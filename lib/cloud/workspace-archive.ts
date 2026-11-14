import { ensurePdfFileName } from '@/lib/cloud/common';
import { exportPdfToWorkspaceProvider } from '@/lib/cloud/connections';
import { writeAuditEvent } from '@/lib/audit';
import { buildSignedDocumentPdf } from '@/lib/signed-document-pdf';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import DocumentModel from '@/models/Document';
import OrganizationModel from '@/models/Organization';
import WorkspaceCloudArchiveJobModel from '@/models/WorkspaceCloudArchiveJob';
import WorkspaceCloudArchiveRuleModel from '@/models/WorkspaceCloudArchiveRule';
import connectDB from '@/utils/db';
import { isDuplicateKeyOnly } from '@/lib/mongo-duplicate-only';
import { integrationAuditLogUpdate, stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';

const JOB_LOCK_MS = 10 * 60 * 1000;
const RETRY_DELAYS_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60, 24 * 60 * 60];

function retryAt(attempts: number): Date {
  const delay = RETRY_DELAYS_SECONDS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_SECONDS.length - 1)];
  return new Date(Date.now() + delay * 1000);
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : 'Workspace archive export failed.').slice(0, 1000);
}

async function failJob(job: InstanceType<typeof WorkspaceCloudArchiveJobModel>, error: unknown, permanent = false) {
  job.lastError = errorMessage(error);
  job.lockedAt = null;
  if (permanent || job.attempts >= job.maxAttempts) {
    job.status = 'dead_letter';
  } else {
    job.status = 'failed';
    job.nextAttemptAt = retryAt(job.attempts);
  }
  await job.save();
  return job;
}

/** Queue one durable export per enabled workspace rule. No user document ACL is
 * evaluated here: an administrator explicitly opted the whole workspace into
 * this archive destination, which is deliberately different from personal
 * automatic exports. */
export async function enqueueWorkspaceCloudArchives(args: { orgId: unknown; documentId: unknown; occurredAt?: Date }) {
  if (!args.orgId || !args.documentId) return [];
  await connectDB();
  const rules = await WorkspaceCloudArchiveRuleModel.find({ orgId: args.orgId, enabled: true,
    ...(args.occurredAt ? { createdAt: { $lte: args.occurredAt } } : {}),
  })
    .select('_id provider destinationFolder')
    .lean();
  if (rules.length === 0) return [];
  try {
    return await WorkspaceCloudArchiveJobModel.insertMany(
      rules.map((rule) => ({
        orgId: args.orgId,
        ruleId: rule._id,
        documentId: args.documentId,
        provider: rule.provider,
        destinationFolder: rule.destinationFolder || null,
        status: 'pending',
        attempts: 0,
        maxAttempts: 8,
        nextAttemptAt: new Date(),
      })),
      { ordered: false }
    );
  } catch (error) {
    if (isDuplicateKeyOnly(error)) return [];
    throw error;
  }
}

export async function processWorkspaceCloudArchiveJob(jobId?: string) {
  await connectDB();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - JOB_LOCK_MS);
  const job = await WorkspaceCloudArchiveJobModel.findOneAndUpdate(
    {
      ...(jobId ? { _id: jobId } : {}),
      $or: [
        { status: { $in: ['pending', 'failed'] }, attempts: { $lt: 8 }, nextAttemptAt: { $lte: now } },
        { status: 'processing', lockedAt: { $lte: staleBefore } },
      ],
    },
    { $set: { status: 'processing', lockedAt: now }, $inc: { attempts: 1 } },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
  );
  if (!job) return null;
  if (job.attempts > job.maxAttempts) {
    return failJob(job, new Error('The worker stopped during the final workspace archive attempt.'), true);
  }

  const rule = await WorkspaceCloudArchiveRuleModel.findOne({
    _id: job.ruleId,
    orgId: job.orgId,
    provider: job.provider,
    enabled: true,
  })
    .select('configuredBy')
    .lean<{ configuredBy?: unknown } | null>();
  if (!rule?.configuredBy) return failJob(job, new Error('The workspace archive rule is missing or disabled.'), true);

  const gate = await getPlanGateForOrgFeature({ orgId: String(job.orgId), feature: 'cloud_library' });
  if (!gate.allowed) return failJob(job, new Error(gate.message), true);

  const document = await DocumentModel.findOne({ _id: job.documentId, orgId: job.orgId, deletedAt: null });
  if (!document) return failJob(job, new Error('The completed document is no longer available.'), true);
  if (document.status !== 'signed' && document.status !== 'completed') {
    return failJob(job, new Error('The document finalization has not completed yet.'));
  }

  try {
    const workspace = await OrganizationModel.findById(job.orgId).select('name').lean<{ name?: string } | null>();
    const pdf = await buildSignedDocumentPdf({ document, requesterUserId: String(rule.configuredBy) });
    const upload = await exportPdfToWorkspaceProvider({
      orgId: String(job.orgId),
      provider: job.provider,
      fileName: ensurePdfFileName(pdf.fileName),
      contentType: 'application/pdf',
      fileBuffer: pdf.buffer,
      workspaceName: workspace?.name || null,
      destinationFolder: job.destinationFolder || null,
      idempotencyKey: String(job._id),
    });
    job.status = 'completed';
    job.completedAt = new Date();
    job.lockedAt = null;
    job.lastError = null;
    job.providerFileId = upload.providerFileId;
    job.providerUrl = upload.providerUrl;
    const stagedIntegrationEvent = stageDocumentIntegrationEvent(job, {
      event: 'cloud.export.completed',
      documentId: job.documentId,
      metadata: { documentId: String(job.documentId), automatic: true, workspaceOwned: true, provider: job.provider, providerFileId: upload.providerFileId },
    });
    await job.save();
    // Completion has been persisted. Do not retry the provider upload merely
    // because the separate audit ledger is temporarily unavailable.
    try {
      const auditLogId = await writeAuditEvent({
        userId: rule.configuredBy,
        orgId: job.orgId,
        documentId: job.documentId,
        action: 'cloud.workspace_archive.completed',
        metadata: {
          automatic: true,
          workspaceOwned: true,
          jobId: String(job._id),
          provider: job.provider,
          providerFileId: upload.providerFileId,
          destinationFolder: job.destinationFolder || null,
        },
      });
      if (auditLogId && stagedIntegrationEvent) {
        const link = integrationAuditLogUpdate(stagedIntegrationEvent, auditLogId);
        await WorkspaceCloudArchiveJobModel.updateOne({ _id: job._id, ...link.filter }, link.update, { timestamps: false }).exec();
      }
    } catch (error) {
      console.error('Workspace cloud archive audit/link failed after completion', { jobId: String(job._id), error });
    }
    return job;
  } catch (error) {
    return failJob(job, error);
  }
}

export async function processPendingWorkspaceCloudArchiveJobs(limit = 5, timeBudgetMs = 50_000) {
  const processed = [];
  const startedAt = Date.now();
  for (let index = 0; index < Math.min(Math.max(limit, 1), 100); index += 1) {
    if (Date.now() - startedAt >= timeBudgetMs) break;
    const job = await processWorkspaceCloudArchiveJob();
    if (!job) break;
    processed.push(job);
  }
  return processed;
}

export async function retryWorkspaceCloudArchiveJob(args: { orgId: string; jobId: string }) {
  await connectDB();
  return WorkspaceCloudArchiveJobModel.findOneAndUpdate(
    { _id: args.jobId, orgId: args.orgId, status: { $in: ['failed', 'dead_letter'] } },
    {
      $set: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        completedAt: null,
        lastError: null,
      },
    },
    { new: true }
  );
}
