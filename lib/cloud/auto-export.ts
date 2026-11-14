import { ensurePdfFileName } from '@/lib/cloud/common';
import { exportPdfToConnectedProvider } from '@/lib/cloud/connections';
import { writeAuditEvent } from '@/lib/audit';
import { canReadDocument, resolveDocumentReadScope } from '@/lib/document-access';
import { buildSignedDocumentPdf } from '@/lib/signed-document-pdf';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import CloudExportJobModel from '@/models/CloudExportJob';
import CloudExportRuleModel from '@/models/CloudExportRule';
import DocumentModel from '@/models/Document';
import MembershipModel from '@/models/Membership';
import OrganizationModel from '@/models/Organization';
import UserModel from '@/models/Users';
import connectDB from '@/utils/db';
import { isDuplicateKeyOnly } from '@/lib/mongo-duplicate-only';
import { integrationAuditLogUpdate, stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';

const JOB_LOCK_MS = 10 * 60 * 1000;
const RETRY_DELAYS_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60, 24 * 60 * 60];

function retryAt(attempts: number): Date {
  const delay = RETRY_DELAYS_SECONDS[
    Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_SECONDS.length - 1)
  ];
  return new Date(Date.now() + delay * 1000);
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : 'Automatic cloud export failed.').slice(0, 1000);
}

export async function enqueueAutomaticCloudExports(args: {
  orgId: unknown;
  documentId: unknown;
  occurredAt?: Date;
}) {
  if (!args.orgId || !args.documentId) return [];
  await connectDB();
  const rules = await CloudExportRuleModel.find({ orgId: args.orgId, enabled: true,
    ...(args.occurredAt ? { createdAt: { $lte: args.occurredAt } } : {}),
  })
    .select('_id userId provider destinationFolder')
    .lean();
  if (rules.length === 0) return [];

  try {
    return await CloudExportJobModel.insertMany(
      rules.map((rule) => ({
        orgId: args.orgId,
        userId: rule.userId,
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
    // A repeated document_finalized event must not create duplicate exports. MongoDB
    // can still insert non-duplicate rows from an unordered batch before reporting 11000.
    if (isDuplicateKeyOnly(error)) return [];
    throw error;
  }
}

async function failJob(
  job: InstanceType<typeof CloudExportJobModel>,
  error: unknown,
  permanent = false
) {
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

export async function processCloudExportJob(jobId?: string) {
  await connectDB();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - JOB_LOCK_MS);
  const job = await CloudExportJobModel.findOneAndUpdate(
    {
      ...(jobId ? { _id: jobId } : {}),
      $or: [
        { status: { $in: ['pending', 'failed'] }, attempts: { $lt: 8 }, nextAttemptAt: { $lte: now } },
        { status: 'processing', lockedAt: { $lte: staleBefore } },
      ],
    },
    {
      $set: { status: 'processing', lockedAt: now },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
  );
  if (!job) return null;
  if (job.attempts > job.maxAttempts) {
    return failJob(job, new Error('The worker stopped during the final automatic export attempt.'), true);
  }

  const rule = await CloudExportRuleModel.findOne({
    _id: job.ruleId,
    orgId: job.orgId,
    userId: job.userId,
    provider: job.provider,
    enabled: true,
  }).lean();
  if (!rule) return failJob(job, new Error('The automatic export rule is missing or disabled.'), true);

  const membership = await MembershipModel.findOne({
    orgId: job.orgId,
    userId: job.userId,
    status: 'active',
  })
    .select('role')
    .lean<{ role?: string } | null>();
  if (!membership) return failJob(job, new Error('The export owner is no longer an active workspace member.'), true);

  const gate = await getPlanGateForOrgFeature({ orgId: String(job.orgId), feature: 'cloud_library' });
  if (!gate.allowed) return failJob(job, new Error(gate.message), true);

  const document = await DocumentModel.findOne({
    _id: job.documentId,
    orgId: job.orgId,
    deletedAt: null,
  });
  if (!document) return failJob(job, new Error('The completed document is no longer available.'), true);

  const [readScope, requester] = await Promise.all([
    resolveDocumentReadScope(String(job.userId), String(job.orgId), membership.role),
    UserModel.findById(job.userId)
      .select('email')
      .lean<{ email?: unknown } | null>(),
  ]);
  const requesterEmail = typeof requester?.email === 'string' ? requester.email : null;
  const hasAccess = canReadDocument({
    userId: String(job.userId),
    orgId: String(job.orgId),
    orgRole: membership.role,
    documentUserId: document.userId ? String(document.userId) : null,
    documentOrgId: document.orgId ? String(document.orgId) : null,
    documentTeamId: document.teamId ? String(document.teamId) : null,
    requesterEmail,
    sharedWith: document.sharedWith,
    accessibleTeamIds: readScope.accessibleTeamIds,
  });
  if (!hasAccess) {
    return failJob(job, new Error('The export owner no longer has access to this document.'), true);
  }
  if (document.status !== 'signed' && document.status !== 'completed') {
    return failJob(job, new Error('The document finalization has not completed yet.'));
  }

  try {
    const workspace = await OrganizationModel.findById(job.orgId)
      .select('name')
      .lean<{ name?: string } | null>();
    const pdf = await buildSignedDocumentPdf({
      document,
      requesterUserId: String(job.userId),
    });
    const upload = await exportPdfToConnectedProvider({
      userId: String(job.userId),
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
      metadata: { documentId: String(job.documentId), automatic: true, provider: job.provider, providerFileId: upload.providerFileId },
    });
    await job.save();

    // The provider upload and completed job are already durable. Audit
    // unavailability must not turn this job retryable and create a second
    // remote file on the next worker pass.
    try {
      const auditLogId = await writeAuditEvent({
        userId: job.userId,
        orgId: job.orgId,
        documentId: job.documentId,
        action: 'cloud.export.completed',
        metadata: {
          automatic: true,
          jobId: String(job._id),
          provider: job.provider,
          providerFileId: upload.providerFileId,
          destinationFolder: job.destinationFolder || null,
        },
      });
      if (auditLogId && stagedIntegrationEvent) {
        const link = integrationAuditLogUpdate(stagedIntegrationEvent, auditLogId);
        await CloudExportJobModel.updateOne({ _id: job._id, ...link.filter }, link.update, { timestamps: false }).exec();
      }
    } catch (error) {
      console.error('Cloud export audit/link failed after completion', { jobId: String(job._id), error });
    }
    return job;
  } catch (error) {
    return failJob(job, error);
  }
}

export async function processPendingCloudExportJobs(limit = 5, timeBudgetMs = 50_000) {
  const processed = [];
  const startedAt = Date.now();
  for (let index = 0; index < Math.min(Math.max(limit, 1), 100); index += 1) {
    if (Date.now() - startedAt >= timeBudgetMs) break;
    const job = await processCloudExportJob();
    if (!job) break;
    processed.push(job);
  }
  return processed;
}

export async function retryCloudExportJob(args: {
  orgId: string;
  userId: string;
  jobId: string;
}) {
  await connectDB();
  return CloudExportJobModel.findOneAndUpdate(
    {
      _id: args.jobId,
      orgId: args.orgId,
      userId: args.userId,
      status: { $in: ['failed', 'dead_letter'] },
    },
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
