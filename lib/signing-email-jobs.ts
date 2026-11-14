import { createHash, randomUUID } from 'crypto';
import type { Document as MongooseDocument } from 'mongoose';

import { sendSigningRequestEmail } from '@/lib/email';
import { hashSigningToken, issueSigningToken } from '@/lib/signing-token';
import { decryptSigningToken, encryptSigningToken } from '@/lib/signing-token-crypto';
import DocumentModel, { type IDocumentRecipient, type IDocumentSendDispatch, type ISigningEmailDelivery } from '@/models/Document';
import connectDB from '@/utils/db';

export const SIGNING_EMAIL_LEASE_MS = 5 * 60 * 1000;
export const SIGNING_EMAIL_MAX_ATTEMPTS = 5;
type Scope = { documentId?: string; orgId?: string | null };
export type SigningEmailJobResult = { documentId: string; recipientId: string; status: ISigningEmailDelivery['status'] };

function documentScope(scope: Scope) {
  return { ...(scope.documentId ? { _id: scope.documentId } : {}), ...(scope.orgId !== undefined ? { orgId: scope.orgId } : {}), deletedAt: null, status: { $in: ['sent', 'in_progress', 'delivery_failed'] } };
}

function staleLease(now: Date) {
  return { status: 'processing', $or: [
    { claimedAt: { $lte: new Date(now.getTime() - SIGNING_EMAIL_LEASE_MS) } },
    { claimedAt: { $exists: false } },
  ] };
}

/** Save in the SAME atomic write as recipient hashes and document signing state. */
export function createSigningEmailDelivery(recipientId: string, token: string, now = new Date()): ISigningEmailDelivery {
  return { recipientId, status: 'queued', tokenEncrypted: encryptSigningToken(token), attempts: 0, nextAttemptAt: now };
}

type NextSigningInvitation = { recipient: { id: string }; signingToken: string };
type DispatchSnapshot = { sendDispatch?: IDocumentSendDispatch; updatedAt?: Date };

/** Append only: replacing a dispatch can erase another recipient's live lease or
 * completed delivery history. Persist this update with the new recipient hashes. */
export function nextSigningEmailUpdate(document: DispatchSnapshot, invitations: NextSigningInvitation[], now = new Date()) {
  const deliveries = invitations.map(({ recipient, signingToken }) => createSigningEmailDelivery(recipient.id, signingToken, now));
  const $set: Record<string, unknown> = {};
  const $push: Record<string, { $each: ISigningEmailDelivery[] }> = {};
  if (deliveries.length > 0) {
    if (!document.sendDispatch) {
      $set.sendDispatch = { claimId: randomUUID(), status: 'processing', claimedAt: now, deliveries };
    } else {
      $set['sendDispatch.status'] = 'processing';
      if (document.sendDispatch.deliveries) $push['sendDispatch.deliveries'] = { $each: deliveries };
      else $set['sendDispatch.deliveries'] = deliveries;
    }
  }
  return { $set, $push };
}

/** A stale signer must not overwrite newly issued tokens or worker outcomes.
 * Mongoose array push remains a narrow $push, including when tokenEncrypted was
 * excluded by the document query. The timestamp predicate fences the whole save. */
export function stageNextSigningEmails(
  document: MongooseDocument & DispatchSnapshot,
  invitations: NextSigningInvitation[],
  now = new Date(),
) {
  if (invitations.length === 0) return;
  document.$where = { ...document.$where, updatedAt: document.updatedAt };
  const update = nextSigningEmailUpdate(document, invitations, now);
  for (const [path, value] of Object.entries(update.$set)) document.set(path, value);
  for (const [path, value] of Object.entries(update.$push)) {
    (document.get(path) as ISigningEmailDelivery[]).push(...value.$each);
  }
}

async function reconcileDispatch(scope: Scope) {
  const base = { ...documentScope(scope), 'sendDispatch.deliveries.0': { $exists: true } };
  await DocumentModel.updateMany({
    ...base, 'sendDispatch.status': { $ne: 'completed' },
    'sendDispatch.deliveries': { $not: { $elemMatch: { status: { $nin: ['completed', 'cancelled'] } } } },
  }, { $set: { 'sendDispatch.status': 'completed', 'sendDispatch.completedAt': new Date() } });
  await DocumentModel.updateMany({
    ...base, 'sendDispatch.status': { $ne: 'failed' }, 'sendDispatch.deliveries.status': { $in: ['failed', 'dead_letter'] },
  }, { $set: { 'sendDispatch.status': 'failed', 'sendDispatch.failedAt': new Date() } });
}

async function processOne(scope: Scope): Promise<SigningEmailJobResult | null> {
  const now = new Date();
  const claimId = randomUUID();
  // Atomic recipient leases let requests and cron workers overlap safely.
  const document = await DocumentModel.findOneAndUpdate({
    ...documentScope(scope),
    'sendDispatch.deliveries': { $elemMatch: { $or: [
      { status: { $in: ['queued', 'failed'] }, nextAttemptAt: { $lte: now }, attempts: { $lt: SIGNING_EMAIL_MAX_ATTEMPTS } },
      staleLease(now),
    ] } },
  }, {
    $set: { 'sendDispatch.deliveries.$.status': 'processing', 'sendDispatch.deliveries.$.claimId': claimId, 'sendDispatch.deliveries.$.claimedAt': now },
    $inc: { 'sendDispatch.deliveries.$.attempts': 1 },
  }, { new: true }).select('+sendDispatch.deliveries.tokenEncrypted');
  if (!document) return null;
  const delivery = document.sendDispatch.deliveries.find((item: ISigningEmailDelivery) => item.claimId === claimId) as ISigningEmailDelivery;
  const recipient = document.recipients.find((item: IDocumentRecipient) => item.id === delivery.recipientId) as IDocumentRecipient | undefined;
  let status: ISigningEmailDelivery['status'] = 'completed';
  let lastError: string | undefined;
  if (!recipient || !['sent', 'viewed', 'delivery_failed'].includes(recipient.status) || (recipient.expiresAt && new Date(recipient.expiresAt) <= now)) {
    status = 'cancelled';
  } else if (delivery.attempts > SIGNING_EMAIL_MAX_ATTEMPTS) {
    // A crash during the final attempt consumes that attempt too.
    status = 'dead_letter';
    lastError = 'delivery_attempts_exhausted';
  } else {
    try {
      const token = decryptSigningToken(delivery.tokenEncrypted || '');
      if (hashSigningToken(token) !== recipient.signingTokenHash) {
        status = 'cancelled';
      } else {
        const deliveryKey = createHash('sha256').update(`${document._id}:${document.sendDispatch.claimId}:${recipient.id}`).digest('hex');
        await sendSigningRequestEmail(recipient, document, { subject: document.sendDispatch.subject, message: document.sendDispatch.message }, token, `<signing-${deliveryKey}@signworkflow.com>`);
      }
    } catch {
      // SMTP errors can contain credentials or message content. Store only a code.
      status = delivery.attempts >= SIGNING_EMAIL_MAX_ATTEMPTS ? 'dead_letter' : 'failed';
      lastError = 'delivery_failed';
    }
  }
  const finishedAt = new Date();
  const failed = status === 'failed' || status === 'dead_letter';
  const set: Record<string, unknown> = {
    'sendDispatch.deliveries.$[delivery].status': status,
    'sendDispatch.deliveries.$[delivery].attempts': Math.min(delivery.attempts, SIGNING_EMAIL_MAX_ATTEMPTS),
  };
  const unset: Record<string, 1> = { 'sendDispatch.deliveries.$[delivery].claimId': 1, 'sendDispatch.deliveries.$[delivery].claimedAt': 1 };
  if (failed) {
    set['sendDispatch.deliveries.$[delivery].lastError'] = lastError;
    set['sendDispatch.status'] = 'failed';
    set['sendDispatch.failedAt'] = finishedAt;
    if (status === 'failed') set['sendDispatch.deliveries.$[delivery].nextAttemptAt'] = new Date(finishedAt.getTime() + 60_000 * 2 ** (delivery.attempts - 1));
    else unset['sendDispatch.deliveries.$[delivery].nextAttemptAt'] = 1;
  } else {
    set['sendDispatch.deliveries.$[delivery].completedAt'] = finishedAt;
    unset['sendDispatch.deliveries.$[delivery].tokenEncrypted'] = 1;
    unset['sendDispatch.deliveries.$[delivery].nextAttemptAt'] = 1;
    unset['sendDispatch.deliveries.$[delivery].lastError'] = 1;
  }
  const arrayFilters: Record<string, unknown>[] = [{ 'delivery.claimId': claimId, 'delivery.status': 'processing' }];
  if (recipient && status !== 'cancelled') {
    set['recipients.$[recipient].status'] = failed ? 'delivery_failed' : 'sent';
    // A recipient may sign while SMTP is in flight. Do not regress their state.
    arrayFilters.push({ 'recipient.id': recipient.id, 'recipient.signingTokenHash': recipient.signingTokenHash, 'recipient.status': { $in: ['sent', 'delivery_failed'] } });
  }
  const result = await DocumentModel.updateOne({
    _id: document._id, 'sendDispatch.claimId': document.sendDispatch.claimId,
    'sendDispatch.deliveries': { $elemMatch: { claimId, status: 'processing' } },
  }, { $set: set, $unset: unset }, { arrayFilters });
  if (result.modifiedCount !== 1) return null; // A newer lease owns the outcome.
  return { documentId: String(document._id), recipientId: delivery.recipientId, status };
}

/** At-least-once SMTP: a lost acknowledgement can cause a duplicate, always with
 * the same valid signing token and stable Message-ID. */
export async function processSigningEmailJobs(options: Scope & { limit?: number } = {}) {
  await connectDB();
  const limit = Math.max(1, Math.min(100, options.limit ?? 10));
  const deadline = Date.now() + 40_000;
  const results: SigningEmailJobResult[] = [];
  for (let attempted = 0; attempted < limit && Date.now() < deadline; attempted += 5) {
    // Wait for every claimed recipient even when one acknowledgement fails.
    // Otherwise a serverless response can terminate another in-flight save.
    const settled = await Promise.allSettled(Array.from({ length: Math.min(5, limit - attempted) }, () => processOne(options)));
    const failed = settled.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    const batch = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    results.push(...batch.filter((result): result is SigningEmailJobResult => result !== null));
    if (batch.every((result) => result === null)) break;
  }
  // Repairs crashes after the last job acknowledgement but before completion.
  await reconcileDispatch(options);
  return results;
}

export async function getSigningEmailDeliverySummary(documentId: string, orgId: string | null) {
  const document = await DocumentModel.findOne({ _id: documentId, orgId, deletedAt: null }).select('status recipients sendDispatch.deliveries');
  if (!document) throw new Error('Signing document unavailable');
  const deliveries = (document.sendDispatch?.deliveries || []) as ISigningEmailDelivery[];
  return {
    status: document.status as string,
    recipients: document.recipients.map((recipient: IDocumentRecipient) => ({ id: recipient.id, status: recipient.status })),
    failures: deliveries.filter((job) => ['failed', 'dead_letter'].includes(job.status)).map((job) => ({ id: job.recipientId, reason: job.lastError || 'delivery_failed' })),
    pending: deliveries.filter((job) => ['queued', 'processing'].includes(job.status)).length,
    completed: deliveries.filter((job) => job.status === 'completed').length,
  };
}

/** Explicit retry re-arms dead letters and expedites backoff. It neither rotates
 * durable tokens nor takes active leases from another worker. */
export async function retrySigningEmailJobs(documentId: string, orgId: string): Promise<boolean> {
  await connectDB();
  const now = new Date();
  const scope = documentScope({ documentId, orgId });
  const document = await DocumentModel.findOne({ ...scope, $or: [
    { 'sendDispatch.deliveries': { $elemMatch: { $or: [{ status: { $in: ['queued', 'failed', 'dead_letter'] } }, staleLease(now)] } } },
    { 'sendDispatch.deliveries': { $exists: false }, $or: [
      { 'sendDispatch.status': 'failed' },
      { 'sendDispatch.status': 'processing', 'sendDispatch.claimedAt': { $lte: new Date(now.getTime() - SIGNING_EMAIL_LEASE_MS) } },
    ] },
  ] });
  if (!document) return false;
  if (!document.sendDispatch.deliveries) {
    // Old recoverable dispatches stored only hashes. A replacement token is
    // required once when upgrading them to durable delivery.
    const retryableStatuses = document.sendDispatch.status === 'failed'
      ? ['delivery_failed'] : ['sent', 'delivery_failed'];
    const recipients = document.recipients.filter((item: IDocumentRecipient) => retryableStatuses.includes(item.status)) as IDocumentRecipient[];
    if (recipients.length === 0) return false;
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    const deliveries = recipients.map((recipient, index) => {
      const issued = issueSigningToken();
      set[`recipients.$[recipient${index}].signingTokenHash`] = issued.tokenHash;
      unset[`recipients.$[recipient${index}].signingToken`] = 1;
      return createSigningEmailDelivery(recipient.id, issued.token, now);
    });
    set.sendDispatch = { claimId: randomUUID(), status: 'processing', claimedAt: now, deliveries };
    const result = await DocumentModel.updateOne({ ...scope, updatedAt: document.updatedAt, 'sendDispatch.claimId': document.sendDispatch.claimId, 'sendDispatch.deliveries': { $exists: false } }, {
      $set: set, $unset: unset,
    }, { arrayFilters: recipients.map((recipient, index) => ({ [`recipient${index}.id`]: recipient.id, [`recipient${index}.status`]: recipient.status })) });
    return result.modifiedCount === 1;
  }
  await DocumentModel.updateOne({ ...scope, 'sendDispatch.claimId': document.sendDispatch.claimId }, {
    $set: { 'sendDispatch.deliveries.$[delivery].status': 'queued', 'sendDispatch.deliveries.$[delivery].attempts': 0, 'sendDispatch.deliveries.$[delivery].nextAttemptAt': now },
    $unset: { 'sendDispatch.deliveries.$[delivery].lastError': 1 },
  }, { arrayFilters: [{ 'delivery.status': { $in: ['failed', 'dead_letter'] } }] });
  return true;
}
