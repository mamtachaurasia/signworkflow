import crypto from 'crypto';
import mongoose from 'mongoose';
import AuditLogModel from '@/models/AuditLog';
import DocumentModel from '@/models/Document';
import { DOCUMENT_OUTBOX_EVENTS, type IntegrationEvent } from '@/lib/integration-outbox-event';

interface AuditEventInput {
  userId?: unknown;
  orgId?: unknown;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  documentId?: unknown;
  actor?: string;
  timestamp?: Date;
  createdAt?: Date;
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    if (mongoose.Types.ObjectId.isValid(value)) {
      return new mongoose.Types.ObjectId(value).toHexString();
    }
    return value.trim().length > 0 ? value : null;
  }

  if (typeof (value as { toString?: () => string }).toString === 'function') {
    const normalized = (value as { toString: () => string }).toString();
    return normalized && normalized !== '[object Object]' ? normalized : null;
  }

  return null;
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function computeAuditHash(payload: Record<string, unknown>): string {
  const pepper = process.env.AUDIT_LOG_HASH_PEPPER || '';
  return crypto
    .createHmac('sha256', pepper)
    .update(stableStringify(payload))
    .digest('hex');
}

function resolveChainScope(input: {
  documentId: string | null;
  orgId: string | null;
  userId: string | null;
}): { chainScope: 'document' | 'org' | 'user' | 'system'; chainId: string } {
  if (input.documentId) {
    return { chainScope: 'document', chainId: input.documentId };
  }
  if (input.orgId) {
    return { chainScope: 'org', chainId: input.orgId };
  }
  if (input.userId) {
    return { chainScope: 'user', chainId: input.userId };
  }
  return { chainScope: 'system', chainId: 'system' };
}

/**
 * Lifecycle integration intents are staged atomically with the document
 * mutation. Mark the later audit row as already represented by that source
 * intent so the audit reconciler cannot emit a duplicate event. This lookup is
 * deliberately best-effort: a lookup failure must never prevent the audit
 * ledger from being written.
 */
type StagedDocumentIntegrationEvent = { key: string; eventId: string };

async function findStagedDocumentIntegrationEvent(documentId: string | null, action: string): Promise<StagedDocumentIntegrationEvent | null> {
  if (!documentId || !DOCUMENT_OUTBOX_EVENTS.has(action)) return null;
  try {
    const document = await DocumentModel.findById(documentId)
      .select('+integrationOutbox')
      .lean<{ integrationOutbox?: Record<string, IntegrationEvent> } | null>();
    const matching = Object.entries(document?.integrationOutbox ?? {})
      .filter(([, event]) => event?.event === action && !event.data?.auditLogId)
      .sort(([, left], [, right]) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
    return matching ? { key: matching[0], eventId: matching[1].eventId } : null;
  } catch {
    return null;
  }
}

async function attachAuditLogToStagedIntegrationEvent(args: {
  documentId: string | null;
  staged: StagedDocumentIntegrationEvent | null;
  auditLogId: string;
}) {
  if (!args.documentId || !args.staged) return false;
  const result = await DocumentModel.updateOne({
    _id: args.documentId,
    [`integrationOutbox.${args.staged.key}.eventId`]: args.staged.eventId,
  }, {
    $set: { [`integrationOutbox.${args.staged.key}.data.auditLogId`]: args.auditLogId },
  }, { timestamps: false }).exec();
  return result.modifiedCount === 1;
}

export async function writeAuditEvent(input: AuditEventInput): Promise<string | null> {
  const normalizedUserId = normalizeId(input.userId);
  const normalizedOrgId = normalizeId(input.orgId);
  const normalizedDocumentId = normalizeId(input.documentId);
  const { chainScope, chainId } = resolveChainScope({
    documentId: normalizedDocumentId,
    orgId: normalizedOrgId,
    userId: normalizedUserId,
  });
  const stagedIntegrationEvent = await findStagedDocumentIntegrationEvent(normalizedDocumentId, input.action);
  let auditLogId: string | null = null;
  const requestedCreatedAt = (input.createdAt ?? new Date()).getTime();
  // A duplicate successor ID means another writer appended the exact tail we
  // observed. Keep following that moving tail until this event is committed;
  // contention is normal and does not make the audit event invalid.
  while (true) {
    const previous = await AuditLogModel.findOne({ chainScope, chainId })
      .sort({ createdAt: -1, _id: -1 })
      .select({ hash: 1, createdAt: 1 })
      .lean<{ hash?: string; createdAt: Date } | null>();

    const prevHash = previous?.hash || '';
    // Each predecessor has exactly one possible successor _id. MongoDB's
    // built-in unique index arbitrates concurrent writers, including the first
    // event, without requiring transactions or a replica set. Existing random
    // ObjectIds remain valid predecessors.
    const successorId = crypto.createHash('sha256')
      .update(JSON.stringify(['audit-successor-v1', chainScope, chainId, prevHash]))
      .digest('hex').slice(0, 24);
    // Keep the committed tail last even if clocks move backwards or callers
    // supply old timestamps. The optional event timestamp remains unchanged.
    const createdAt = new Date(Math.max(
      requestedCreatedAt,
      previous ? new Date(previous.createdAt).getTime() + 1 : requestedCreatedAt
    ));
    const payloadForHash = {
      chainScope,
      chainId,
      prevHash,
      userId: normalizedUserId,
      orgId: normalizedOrgId,
      documentId: normalizedDocumentId,
      actor: normalizeString(input.actor),
      action: input.action,
      ipAddress: normalizeString(input.ipAddress),
      userAgent: normalizeString(input.userAgent),
      metadata: input.metadata || {},
      timestamp: input.timestamp ? input.timestamp.toISOString() : null,
      createdAt: createdAt.toISOString(),
    };
    const hash = computeAuditHash(payloadForHash);

    try {
      const created = await AuditLogModel.create({
        _id: successorId,
        userId: normalizedUserId,
        orgId: normalizedOrgId,
        documentId: normalizedDocumentId,
        actor: normalizeString(input.actor) || undefined,
        timestamp: input.timestamp,
        action: input.action,
        ipAddress: input.ipAddress || '',
        userAgent: input.userAgent || '',
        metadata: input.metadata || {},
        createdAt,
        chainScope,
        chainId,
        prevHash,
        hash,
        // The domain source outbox will deliver this lifecycle event. Direct
        // audit writers remain pending and are durably fanned out themselves.
        integrationPending: !stagedIntegrationEvent,
      });
      auditLogId = String(created._id);
      if (stagedIntegrationEvent) {
        const attached = await attachAuditLogToStagedIntegrationEvent({
          documentId: normalizedDocumentId,
          staged: stagedIntegrationEvent,
          auditLogId,
        });
        if (!attached) {
          // The source has been claimed or changed since the lookup. Let the
          // audit outbox deliver rather than silently discarding this event.
          await AuditLogModel.updateOne({ _id: created._id }, { $set: { integrationPending: true } }).exec();
        }
      }
      break;
    } catch (error) {
      const duplicate = error as {
        code?: number;
        keyPattern?: { _id?: number };
        keyValue?: { _id?: unknown };
      };
      const lostRace = duplicate?.code === 11000 && (
        duplicate.keyPattern?._id === 1 || String(duplicate.keyValue?._id) === successorId
      );
      if (!lostRace) throw error;
      // Re-read the committed tail before retrying; jitter limits repeated
      // collisions among writers that arrived together.
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 25)));
    }
  }

  // The event intent already lives in the same write as its domain change (or
  // in the audit row for non-document events). This is only a low-latency nudge;
  // the cron reconciler retries unacknowledged intents after any interruption.
  try {
    const { processDocumentIntegrationEvents, processAuditIntegrationEvent } = await import('@/lib/integration-outbox');
    await Promise.allSettled([
      ...(normalizedDocumentId ? [processDocumentIntegrationEvents(normalizedDocumentId)] : []),
      ...(auditLogId ? [processAuditIntegrationEvent(auditLogId)] : []),
    ]);
  } catch {
    // Source records remain durable and eligible for the scheduled reconciler.
  }
  return auditLogId;
}

export async function writeAuditEvents(inputs: AuditEventInput[]): Promise<void> {
  for (const input of inputs) {
    await writeAuditEvent(input);
  }
}
