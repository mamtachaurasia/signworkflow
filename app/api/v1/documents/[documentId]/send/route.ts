import { randomUUID } from 'crypto';

import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';
import { z } from 'zod';

import { getApiKeyContext, getApiRateLimitResponse } from '@/lib/api-key';
import { writeAuditEvent } from '@/lib/audit';
import { createSigningEmailDelivery, getSigningEmailDeliverySummary, processSigningEmailJobs } from '@/lib/signing-email-jobs';
import { copyObject, getRegion, getStorageBucketName, normalizeStorageProvider } from '@/lib/s3';
import {
  validateRoleFieldRestrictions,
  validateSenderFieldValues,
  validateSignerFieldAssignments,
  validateUniqueRecipients,
} from '@/lib/signing-request-validation';
import { issueSigningToken } from '@/lib/signing-token';
import { getLatestPreparedVersion } from '@/lib/signing-utils';
import { getTrialWriteAccessDeniedResponse } from '@/lib/trial-access';
import DocumentModel, { type IDocumentRecipient } from '@/models/Document';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CLAIM_STALE_MS = 5 * 60 * 1000;

type ApiVersion = {
  version: number;
  label?: string;
  fields?: unknown[];
  hash?: string;
  hashAlgo?: string;
  size?: number;
  mimeType?: string;
  locked?: boolean;
  sentAt?: Date;
  storage?: { provider?: string; bucket?: string; key?: string; region?: string };
};

const BodySchema = z.object({
  recipients: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1).max(200),
    role: z.enum(['signer', 'approver', 'viewer']).default('signer'),
    order: z.number().int().positive().optional(),
  })).min(1).max(100),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().max(2000).optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  let activeClaim: { documentId: string; claimId: string } | null = null;
  try {
    const apiKey = await getApiKeyContext(req);
    if (!apiKey) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
    const rateLimitResponse = getApiRateLimitResponse(apiKey);
    if (rateLimitResponse) return rateLimitResponse;
    if (!apiKey.scopes.includes('documents:write')) return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    const trialDenied = await getTrialWriteAccessDeniedResponse({ orgId: apiKey.orgId });
    if (trialDenied) return trialDenied;

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request', details: parsed.error.flatten() }, { status: 400 });
    const { documentId } = await params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) return NextResponse.json({ error: 'invalid_document_id' }, { status: 400 });
    if (!parsed.data.recipients.some((recipient) => recipient.role === 'signer')) {
      return NextResponse.json({ error: 'signer_required' }, { status: 400 });
    }
    const uniqueRecipientError = validateUniqueRecipients(parsed.data.recipients);
    if (uniqueRecipientError) return NextResponse.json({ error: 'duplicate_recipient', message: uniqueRecipientError }, { status: 400 });

    await connectDB();
    const document = await DocumentModel.findOne({ _id: documentId, orgId: apiKey.orgId, deletedAt: null });
    if (!document) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!['draft', 'saved'].includes(document.status)) {
      return NextResponse.json({ error: 'invalid_state', message: 'Only draft documents can be sent.' }, { status: 409 });
    }

    const versions = (Array.isArray(document.versions) ? document.versions : []) as ApiVersion[];
    let preparedVersion = getLatestPreparedVersion(versions);
    const fallbackVersion = versions.find((version: ApiVersion) => version.version === document.currentVersion)
      || versions.find((version: ApiVersion) => version.label === 'original')
      || versions[versions.length - 1];
    const fields = Array.isArray(preparedVersion?.fields)
      ? preparedVersion.fields
      : Array.isArray(fallbackVersion?.fields) ? fallbackVersion.fields : [];
    const recipientIds = new Set(parsed.data.recipients.map((recipient) => recipient.id));
    const unknownFieldRecipient = fields.some((rawField: unknown) => {
      const field = rawField as { recipientId?: string | null; fieldOwner?: string };
      return field.fieldOwner !== 'me' && Boolean(field.recipientId) && !recipientIds.has(String(field.recipientId));
    });
    if (unknownFieldRecipient) return NextResponse.json({ error: 'field_recipient_mismatch' }, { status: 400 });
    const fieldError = validateRoleFieldRestrictions(parsed.data.recipients, fields)
      || validateSignerFieldAssignments(parsed.data.recipients, fields)
      || validateSenderFieldValues(fields);
    if (fieldError) return NextResponse.json({ error: 'invalid_fields', message: fieldError }, { status: 400 });
    if (!preparedVersion && !fallbackVersion?.storage?.key) {
      return NextResponse.json({ error: 'prepared_version_unavailable' }, { status: 400 });
    }

    const claimId = randomUUID();
    const claimedAt = new Date();
    const claimResult = await DocumentModel.updateOne({
      _id: document._id,
      orgId: apiKey.orgId,
      status: { $in: ['draft', 'saved'] },
      currentVersion: document.currentVersion,
      updatedAt: document.updatedAt,
      $or: [
        { sendDispatch: { $exists: false } },
        { sendDispatch: null },
        { 'sendDispatch.status': 'failed' },
        { 'sendDispatch.status': 'processing', 'sendDispatch.claimedAt': { $lt: new Date(claimedAt.getTime() - CLAIM_STALE_MS) } },
      ],
    }, { $set: { sendDispatch: { claimId, status: 'processing', claimedAt } } });
    if (claimResult.modifiedCount !== 1) return NextResponse.json({ error: 'send_already_claimed' }, { status: 409 });
    activeClaim = { documentId, claimId };
    document.sendDispatch = { claimId, status: 'processing', claimedAt };

    if (!preparedVersion && fallbackVersion?.storage?.key) {
      const provider = normalizeStorageProvider(fallbackVersion.storage.provider);
      const bucket = fallbackVersion.storage.bucket || getStorageBucketName(provider);
      if (!bucket) throw new Error('Storage bucket is not configured.');
      const versionNumber = (document.currentVersion ?? 0) + 1;
      const key = `documents/${apiKey.userId}/${document._id}/prepared_${versionNumber}.pdf`;
      await copyObject({
        sourceBucket: bucket,
        sourceKey: fallbackVersion.storage.key,
        destinationBucket: bucket,
        destinationKey: key,
        region: fallbackVersion.storage.region || getRegion(provider),
        provider,
      });
      const createdAt = new Date();
      const nextPreparedVersion = {
        version: versionNumber,
        label: 'prepared' as const,
        derivedFromVersion: fallbackVersion.version,
        storage: { provider, bucket, key, region: fallbackVersion.storage.region || getRegion(provider), url: `${provider}://${bucket}/${key}` },
        hash: fallbackVersion.hash,
        hashAlgo: fallbackVersion.hashAlgo || 'SHA-256',
        size: fallbackVersion.size,
        mimeType: fallbackVersion.mimeType || 'application/pdf',
        locked: false,
        fields,
        documentName: document.documentName,
        status: 'draft' as const,
        changeLog: 'Document prepared for signing through the API',
        editHistory: [],
        createdAt,
        updatedAt: createdAt,
      };
      document.versions.push(nextPreparedVersion as never);
      document.currentVersion = versionNumber;
      preparedVersion = nextPreparedVersion as never;
    }

    const sentAt = new Date();
    if (preparedVersion) {
      preparedVersion.locked = true;
      preparedVersion.sentAt = sentAt;
    }
    const tokens = new Map<string, string>();
    const recipients = parsed.data.recipients.map((recipient, index) => {
      const issued = issueSigningToken();
      tokens.set(recipient.id, issued.token);
      return {
        id: recipient.id,
        email: recipient.email,
        name: recipient.name,
        role: recipient.role,
        color: '#4f46e5',
        order: recipient.order || index + 1,
        status: 'sent' as const,
        sendReminders: false,
        signingTokenHash: issued.tokenHash,
      } as IDocumentRecipient;
    });
    document.recipients = recipients as never;
    document.signingEvents ??= [];
    for (const recipient of recipients) {
      document.signingEvents.push({
        recipientId: recipient.id,
        action: 'sent',
        sentAt,
        serverTimestamp: sentAt,
        baseVersion: preparedVersion?.version ?? document.currentVersion,
        order: recipient.order,
      } as never);
    }
    document.status = 'in_progress';
    document.signingMode = 'parallel';
    document.updatedAt = sentAt;
    document.sendDispatch = {
      claimId, status: 'processing', claimedAt,
      subject: parsed.data.subject,
      message: parsed.data.message,
      deliveries: recipients.map((recipient) => createSigningEmailDelivery(recipient.id, tokens.get(recipient.id)!, sentAt)),
    };
    // Mongoose merges $where into the save filter. A sender whose preparation
    // lease was reclaimed cannot overwrite the newer dispatch or its tokens.
    document.$where = { 'sendDispatch.claimId': claimId, 'sendDispatch.status': 'processing', status: { $in: ['draft', 'saved'] }, deletedAt: null };
    stageDocumentIntegrationEvent(document, { event: 'document_sent_for_signing', createdAt: sentAt,
      metadata: { source: 'api', recipientCount: recipients.length } });
    await document.save();
    activeClaim = null;

    await processSigningEmailJobs({ documentId, orgId: apiKey.orgId, limit: recipients.length });
    const delivery = await getSigningEmailDeliverySummary(documentId, apiKey.orgId);
    const failures = delivery.failures;
    try {
      await writeAuditEvent({
        userId: apiKey.userId,
        orgId: apiKey.orgId,
        documentId: document._id,
        actor: apiKey.userId,
        action: 'document_sent_for_signing',
        metadata: { source: 'api', recipientCount: recipients.length, deliveryFailures: failures.length },
      });
    } catch (auditError) {
      console.error('[API DOCUMENT SEND] Failed to record audit event:', auditError);
    }
    return NextResponse.json({
      data: { id: String(document._id), status: delivery.status, recipients: delivery.recipients },
      deliveryFailures: failures,
      deliveryPending: delivery.pending,
      retryable: failures.length > 0 || delivery.pending > 0,
    });
  } catch (error) {
    if (activeClaim) {
      await DocumentModel.updateOne(
        { _id: activeClaim.documentId, 'sendDispatch.claimId': activeClaim.claimId },
        { $set: { 'sendDispatch.status': 'failed', 'sendDispatch.failedAt': new Date() } }
      ).catch(() => undefined);
    }
    console.error('[API DOCUMENT SEND] Failed:', error);
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
