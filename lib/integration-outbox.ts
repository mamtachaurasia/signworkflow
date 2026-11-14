import AuditLogModel from '@/models/AuditLog';
import DocumentModel from '@/models/Document';
import CloudExportJobModel from '@/models/CloudExportJob';
import WorkspaceCloudArchiveJobModel from '@/models/WorkspaceCloudArchiveJob';
import { enqueueWebhookEvent } from '@/lib/webhooks';
import { enqueueAutomaticCloudExports } from '@/lib/cloud/auto-export';
import { enqueueWorkspaceCloudArchives } from '@/lib/cloud/workspace-archive';
import { type IntegrationEvent } from '@/lib/integration-outbox-event';
import connectDB from '@/utils/db';
import type { Model } from 'mongoose';

const RETRY_MS = 60_000;

async function fanOut(orgId: unknown, event: IntegrationEvent) {
  const tasks: Promise<unknown>[] = [enqueueWebhookEvent({
    orgId, event: event.event, data: { ...event.data, metadata: event.data.metadata ?? {} },
    eventId: event.eventId, createdAt: new Date(event.createdAt),
  })];
  if (event.event === 'document_finalized' && event.data.documentId) {
    const input = { orgId, documentId: event.data.documentId, occurredAt: new Date(event.createdAt) };
    tasks.push(enqueueAutomaticCloudExports(input), enqueueWorkspaceCloudArchives(input));
  }
  // Await all destinations even when one fails. Leave the source unacknowledged
  // until every destination is durable; deterministic identities make replay safe.
  const results = await Promise.allSettled(tasks);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : 'Integration event fan-out failed').slice(0, 500);
}

type SourceRecord = {
  _id: unknown;
  orgId: unknown;
  integrationOutbox?: Record<string, IntegrationEvent>;
};

export async function processDocumentIntegrationEvents(documentId: unknown) {
  const document = await DocumentModel.findById(documentId).select('+integrationOutbox orgId').lean<SourceRecord | null>();
  if (!document) return { acknowledged: 0, retrying: 0 };
  return processSource(DocumentModel, document);
}

async function processSource(model: Model<SourceRecord>, source: SourceRecord, deadline = Date.now() + 45_000) {
  let acknowledged = 0;
  let retrying = 0;
  for (const [id, event] of Object.entries(source.integrationOutbox ?? {}).slice(0, 50)) {
    if (Date.now() >= deadline) break;
    try {
      await fanOut(source.orgId, event);
      // A crash before this acknowledgement simply replays the same event IDs.
      // Never replace the map, which could discard concurrently staged events.
      await model.updateOne({ _id: source._id }, {
        $unset: { [`integrationOutbox.${id}`]: 1 },
      }, { timestamps: false }).exec();
      acknowledged += 1;
    } catch (error) {
      retrying += 1;
      await model.updateOne({ _id: source._id }, { $set: {
        integrationNextAttemptAt: new Date(Date.now() + RETRY_MS),
        integrationLastError: safeError(error),
      } }, { timestamps: false }).exec();
    }
  }
  return { acknowledged, retrying };
}

export async function processAuditIntegrationEvent(auditId: unknown) {
  const audit = await AuditLogModel.findOne({ _id: auditId, integrationPending: true })
    .select('+integrationPending orgId documentId action metadata createdAt').lean();
  if (!audit) return { acknowledged: 0, retrying: 0 };
  try {
    // Document lifecycle rows that have an accompanying durable source event
    // are marked non-pending by writeAuditEvent. A pending lifecycle audit has
    // no source event (for example, a legacy/direct writer) and must still be
    // delivered instead of being silently dropped.
    const domainOwned = (audit.action === 'cloud.export.completed' && audit.metadata?.automatic)
      || audit.action === 'cloud.workspace_archive.completed';
    if (!domainOwned) {
      await fanOut(audit.orgId, {
        eventId: `evt_audit_${audit._id}`, event: audit.action, createdAt: audit.createdAt,
        data: {
          auditLogId: String(audit._id),
          documentId: audit.documentId ? String(audit.documentId) : null,
          metadata: audit.metadata ?? {},
        },
      });
    }
    await AuditLogModel.updateOne({ _id: audit._id }, {
      $set: { integrationPending: false }, $unset: { integrationLastError: 1 },
    }).exec();
    return { acknowledged: 1, retrying: 0 };
  } catch (error) {
    await AuditLogModel.updateOne({ _id: audit._id }, { $set: {
      integrationNextAttemptAt: new Date(Date.now() + RETRY_MS), integrationLastError: safeError(error),
    } }).exec();
    return { acknowledged: 0, retrying: 1 };
  }
}

export async function processPendingIntegrationEvents(limit = 10) {
  await connectDB();
  const now = new Date();
  const deadline = Date.now() + 45_000;
  const totals = { acknowledged: 0, retrying: 0 };
  const models = [DocumentModel, CloudExportJobModel, WorkspaceCloudArchiveJobModel] as Model<SourceRecord>[];
  for (const model of models) {
    if (Date.now() >= deadline) break;
    const sources = await model.find({
      integrationOutbox: { $exists: true, $ne: {} },
      integrationNextAttemptAt: { $lte: now },
    }).select('+integrationOutbox orgId').sort({ integrationNextAttemptAt: 1, _id: 1 })
      .limit(limit).lean<SourceRecord[]>();
    for (const source of sources) {
      if (Date.now() >= deadline) break;
      const result = await processSource(model, source, deadline);
      totals.acknowledged += result.acknowledged;
      totals.retrying += result.retrying;
    }
  }
  const audits = await AuditLogModel.find({ integrationPending: true, integrationNextAttemptAt: { $lte: now } })
    .select('_id').sort({ integrationNextAttemptAt: 1, _id: 1 }).limit(limit).lean();
  for (const audit of audits) {
    if (Date.now() >= deadline) break;
    const result = await processAuditIntegrationEvent(audit._id);
    totals.acknowledged += result.acknowledged;
    totals.retrying += result.retrying;
  }
  return totals;
}
