import mongoose from 'mongoose';
import { setImmediate } from 'node:timers/promises';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ email: vi.fn(), apiKey: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendSigningRequestEmail: mocks.email }));
vi.mock('@/lib/api-key', () => ({ getApiKeyContext: mocks.apiKey, getApiRateLimitResponse: () => null }));
vi.mock('@/lib/trial-access', () => ({ getTrialWriteAccessDeniedResponse: async () => null }));
vi.mock('@/lib/audit', () => ({ writeAuditEvent: mocks.audit }));

import { POST as send } from '@/app/api/v1/documents/[documentId]/send/route';
import { POST as retry } from '@/app/api/v1/documents/[documentId]/send/retry/route';
import { GET as cronGet, POST as cronPost } from '@/app/api/cron/signing-emails/route';
import { createSigningEmailDelivery, getSigningEmailDeliverySummary, processSigningEmailJobs, retrySigningEmailJobs, SIGNING_EMAIL_LEASE_MS, SIGNING_EMAIL_MAX_ATTEMPTS, stageNextSigningEmails } from '@/lib/signing-email-jobs';
import { hashSigningToken, issueSigningToken } from '@/lib/signing-token';
import { decryptSigningToken } from '@/lib/signing-token-crypto';
import { applySigningAction } from '@/lib/signing-actions';
import DocumentModel from '@/models/Document';
import { connectTestDb, disconnectTestDb, resetTestDb } from '../helpers/db';

const orgId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const oldDate = () => new Date(Date.now() - SIGNING_EMAIL_LEASE_MS - 60_000);
const recipient = { id: 'signer-1', name: 'Asha', email: 'asha@example.test', role: 'signer', color: '#4f46e5', order: 1, sendReminders: false };

async function draft() {
  return DocumentModel.create({
    orgId, userId: String(userId), documentName: 'Agreement', originalFileName: 'agreement.pdf', status: 'draft', currentVersion: 1,
    versions: [{
      version: 1, label: 'prepared', storage: { provider: 's3', bucket: 'documents', key: 'prepared.pdf' }, hash: 'pdfhash', size: 100, mimeType: 'application/pdf',
      fields: [{ id: 'signature-1', type: 'signature', x: 10, y: 10, width: 100, height: 40, pageNumber: 1, recipientId: recipient.id, required: true, fieldOwner: 'recipients' }],
    }],
  });
}

async function queued() {
  const document = await draft();
  const token = issueSigningToken();
  document.status = 'in_progress';
  document.recipients = [{ ...recipient, status: 'sent', signingTokenHash: token.tokenHash }];
  document.sendDispatch = {
    claimId: 'dispatch-1', status: 'processing', claimedAt: new Date(), subject: 'Custom subject', message: 'Custom message',
    deliveries: [createSigningEmailDelivery(recipient.id, token.token)],
  };
  await document.save();
  return { document, token: token.token };
}

function params(documentId: unknown) { return { params: Promise.resolve({ documentId: String(documentId) }) }; }
function sendRequest(documentId: unknown) {
  return new NextRequest(`https://example.test/api/v1/documents/${documentId}/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipients: [{ id: recipient.id, name: recipient.name, email: recipient.email, role: recipient.role }], subject: 'Custom subject', message: 'Custom message' }),
  });
}
function retryRequest(documentId: unknown) { return new NextRequest(`https://example.test/api/v1/documents/${documentId}/send/retry`, { method: 'POST' }); }
async function raw(documentId: unknown) { return DocumentModel.collection.findOne({ _id: new mongoose.Types.ObjectId(String(documentId)) }); }
async function expireClaim(documentId: unknown) {
  await DocumentModel.updateOne({ _id: documentId }, { $set: { 'sendDispatch.deliveries.0.claimedAt': oldDate() } });
}

describe('durable signing email recovery', () => {
  beforeAll(async () => {
    // Cloud providers are optional: signing delivery must not use their key.
    vi.stubEnv('CLOUD_CONNECTIONS_ENCRYPTION_KEY', '');
    vi.stubEnv('SIGNING_TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    await connectTestDb();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    mocks.email.mockReset().mockResolvedValue({ success: true });
    mocks.apiKey.mockResolvedValue({ orgId: String(orgId), userId: String(userId), scopes: ['documents:write'] });
    mocks.audit.mockResolvedValue(undefined);
    await resetTestDb();
  });
  afterAll(async () => { await disconnectTestDb(); vi.unstubAllEnvs(); });

  it('atomically saves encrypted jobs and hashes before email, then erases completed credentials', async () => {
    const document = await draft();
    mocks.email.mockImplementation(async (_recipient, _document, options, token) => {
      const saved = await raw(document._id);
      expect(saved?.status).toBe('in_progress');
      expect(saved?.sendDispatch.status).toBe('processing');
      expect(saved?.sendDispatch.deliveries[0].status).toBe('processing');
      expect(saved?.recipients[0].signingTokenHash).toBe(hashSigningToken(token));
      expect(JSON.stringify(saved)).not.toContain(token);
      expect(saved?.sendDispatch.deliveries[0].tokenEncrypted).toMatch(/^st1\./);
      expect(decryptSigningToken(saved?.sendDispatch.deliveries[0].tokenEncrypted)).toBe(token);
      expect(options).toEqual({ subject: 'Custom subject', message: 'Custom message' });
    });
    const response = await send(sendRequest(document._id), params(document._id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ deliveryFailures: [], deliveryPending: 0, retryable: false });
    expect(body.data.recipients).toEqual([{ id: recipient.id, status: 'sent' }]);
    const saved = await raw(document._id);
    expect(saved?.sendDispatch.status).toBe('completed');
    expect(saved?.sendDispatch.deliveries[0].tokenEncrypted).toBeUndefined();
    expect(saved?.signingEvents).toHaveLength(1);
  });

  it('recovers a crash after the document commit and before the first email', async () => {
    const document = await draft();
    const claim = vi.spyOn(DocumentModel, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('process stopped'); });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await send(sendRequest(document._id), params(document._id))).status).toBe(503);
    expect(mocks.email).not.toHaveBeenCalled();
    expect((await raw(document._id))?.sendDispatch.deliveries[0].status).toBe('queued');
    claim.mockRestore(); logged.mockRestore();
    await processSigningEmailJobs({ limit: 1 });
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect((await raw(document._id))?.sendDispatch.status).toBe('completed');
  });

  it('persists the next sequential invitation before any later side effect can fail', async () => {
    const document = await draft();
    const firstToken = issueSigningToken();
    document.status = 'sent';
    document.signingMode = 'sequential';
    document.recipients = [
      { ...recipient, id: 'first-signer', email: 'first@example.test', status: 'sent', signingTokenHash: firstToken.tokenHash },
      { ...recipient, id: 'next-signer', email: 'next@example.test', order: 2, status: 'pending' },
    ];
    const actionAt = new Date();
    const firstSigner = document.recipients[0]!;
    const { nextRecipientsToNotify } = applySigningAction({
      document,
      recipient: firstSigner,
      action: 'signed',
      actionAt,
      version: 2,
      baseVersion: 1,
    });

    stageNextSigningEmails(document, nextRecipientsToNotify, actionAt);
    await document.save();
    // A subsequent audit/notification failure must not remove this durable
    // work; the cron worker can still issue the next signing email.
    const saved = await raw(document._id);
    const queuedDelivery = saved?.sendDispatch.deliveries[0];
    const nextRecipient = saved?.recipients.find((item: { id: string }) => item.id === 'next-signer');
    expect(nextRecipient?.status).toBe('sent');
    expect(nextRecipient?.signingTokenHash).toBe(hashSigningToken(nextRecipientsToNotify[0]!.signingToken));
    expect(decryptSigningToken(queuedDelivery?.tokenEncrypted)).toBe(nextRecipientsToNotify[0]!.signingToken);

    await processSigningEmailJobs({ documentId: String(document._id), limit: 1 });
    expect(mocks.email).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'next-signer' }), expect.anything(), expect.anything(),
      nextRecipientsToNotify[0]!.signingToken, expect.any(String)
    );
  });

  it('fences the document save when another sender takes over an expired preparation claim', async () => {
    const document = await draft();
    const save = DocumentModel.prototype.save;
    vi.spyOn(DocumentModel.prototype, 'save').mockImplementationOnce(async function(this: mongoose.Document) {
      await DocumentModel.collection.updateOne({ _id: document._id }, {
        $set: { sendDispatch: { claimId: 'new-sender', status: 'processing', claimedAt: new Date() } },
      });
      return save.call(this);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await send(sendRequest(document._id), params(document._id))).status).toBe(503);
    const saved = await raw(document._id);
    expect(saved?.status).toBe('draft');
    expect(saved?.recipients).toEqual([]);
    expect(saved?.sendDispatch).toMatchObject({ claimId: 'new-sender', status: 'processing' });
    expect(saved?.sendDispatch.deliveries).toBeUndefined();
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it('reclaims a retry interrupted with recipient still sent and preserves its signing token', async () => {
    const { document, token } = await queued();
    await DocumentModel.updateOne({ _id: document._id }, { $set: {
      'sendDispatch.deliveries.0.status': 'processing', 'sendDispatch.deliveries.0.claimId': 'lost-worker',
      'sendDispatch.deliveries.0.claimedAt': oldDate(), 'sendDispatch.deliveries.0.attempts': 1,
    } });
    const response = await retry(retryRequest(document._id), params(document._id));
    expect(response.status).toBe(200);
    expect((await response.json()).deliveryFailures).toEqual([]);
    expect(mocks.email.mock.calls[0][3]).toBe(token);
    expect((await raw(document._id))?.recipients[0].signingTokenHash).toBe(hashSigningToken(token));
  });

  it('does not claim a live lease or send a duplicate when workers race', async () => {
    const { document } = await queued();
    await Promise.all([processSigningEmailJobs({ limit: 1 }), processSigningEmailJobs({ limit: 1 }), processSigningEmailJobs({ limit: 1 })]);
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect((await raw(document._id))?.sendDispatch.deliveries[0].attempts).toBe(1);
    await DocumentModel.updateOne({ _id: document._id }, { $set: { 'sendDispatch.deliveries.0.status': 'processing', 'sendDispatch.deliveries.0.claimedAt': new Date() } });
    expect(await retrySigningEmailJobs(String(document._id), String(orgId))).toBe(false);
    expect(await processSigningEmailJobs({ limit: 1 })).toEqual([]);
  });

  it('reuses the same token and Message-ID when SMTP succeeded but acknowledgement persistence failed', async () => {
    const { document, token } = await queued();
    const update = vi.spyOn(DocumentModel, 'updateOne').mockRejectedValueOnce(new Error('database connection lost'));
    await expect(processSigningEmailJobs({ limit: 1 })).rejects.toThrow('database connection lost');
    update.mockRestore();
    expect((await raw(document._id))?.sendDispatch.deliveries[0].status).toBe('processing');
    await expireClaim(document._id);
    await processSigningEmailJobs({ limit: 1 });
    expect(mocks.email).toHaveBeenCalledTimes(2);
    expect(mocks.email.mock.calls.map((call) => call[3])).toEqual([token, token]);
    expect(mocks.email.mock.calls[1][4]).toBe(mocks.email.mock.calls[0][4]);
  });

  it('awaits other claimed recipients when one acknowledgement fails', async () => {
    await queued();
    await queued();
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const secondStarted = new Promise<void>((resolve) => { started = resolve; });
    mocks.email.mockResolvedValueOnce(undefined).mockImplementationOnce(() => { started(); return waiting; });
    vi.spyOn(DocumentModel, 'updateOne').mockRejectedValueOnce(new Error('acknowledgement failed'));
    const finished = vi.fn();
    const worker = processSigningEmailJobs({ limit: 2 }).then(finished, (error: Error) => { finished(error.message); });
    await secondStarted;
    await setImmediate();
    expect(finished).not.toHaveBeenCalled();
    release();
    await worker;
    expect(finished).toHaveBeenCalledWith('acknowledgement failed');
    expect(await DocumentModel.countDocuments({ 'sendDispatch.deliveries.status': 'completed' })).toBe(1);
  });

  it('rejects an old worker acknowledgement after a replacement lease finishes delivery', async () => {
    const { document, token } = await queued();
    let started!: () => void;
    let failOriginal!: (error: Error) => void;
    const emailStarted = new Promise<void>((resolve) => { started = resolve; });
    const originalEmail = new Promise<never>((_resolve, reject) => { failOriginal = reject; });
    mocks.email.mockImplementationOnce(() => { started(); return originalEmail; });
    const originalWorker = processSigningEmailJobs({ limit: 1 });
    await emailStarted;
    await expireClaim(document._id);
    await processSigningEmailJobs({ limit: 1 });
    failOriginal(new Error('late SMTP failure'));
    await originalWorker;
    const saved = await raw(document._id);
    expect(saved?.sendDispatch.status).toBe('completed');
    expect(saved?.sendDispatch.deliveries[0]).toMatchObject({ status: 'completed', attempts: 2 });
    expect(saved?.sendDispatch.deliveries[0].tokenEncrypted).toBeUndefined();
    expect(saved?.recipients[0]).toMatchObject({ status: 'sent', signingTokenHash: hashSigningToken(token) });
    expect(mocks.email.mock.calls.map((call) => call[3])).toEqual([token, token]);
  });

  it('backs off failures, bounds attempts, and explicitly retries dead letters without rotating tokens', async () => {
    const { document, token } = await queued();
    mocks.email.mockRejectedValue(new Error(`provider leaked ${token}`));
    for (let attempt = 1; attempt <= SIGNING_EMAIL_MAX_ATTEMPTS; attempt++) {
      await processSigningEmailJobs({ limit: 1 });
      const saved = await raw(document._id);
      expect(saved?.sendDispatch.deliveries[0].attempts).toBe(attempt);
      expect(saved?.sendDispatch.deliveries[0].lastError).toBe('delivery_failed');
      if (attempt < SIGNING_EMAIL_MAX_ATTEMPTS) {
        expect(await processSigningEmailJobs({ limit: 1 })).toEqual([]);
        await DocumentModel.updateOne({ _id: document._id }, { $set: { 'sendDispatch.deliveries.0.nextAttemptAt': oldDate() } });
      }
    }
    expect((await raw(document._id))?.sendDispatch.deliveries[0].status).toBe('dead_letter');
    expect(await processSigningEmailJobs({ limit: 1 })).toEqual([]);
    mocks.email.mockResolvedValue({ success: true });
    expect(await retrySigningEmailJobs(String(document._id), String(orgId))).toBe(true);
    await processSigningEmailJobs({ limit: 1 });
    expect(mocks.email.mock.calls.at(-1)?.[3]).toBe(token);
    expect((await raw(document._id))?.sendDispatch.status).toBe('completed');
  });

  it('dead-letters an abandoned final attempt without making an extra SMTP call', async () => {
    const { document } = await queued();
    await DocumentModel.updateOne({ _id: document._id }, { $set: {
      'sendDispatch.deliveries.0.status': 'processing', 'sendDispatch.deliveries.0.attempts': SIGNING_EMAIL_MAX_ATTEMPTS,
      'sendDispatch.deliveries.0.claimedAt': oldDate(),
    } });
    await processSigningEmailJobs({ limit: 1 });
    expect(mocks.email).not.toHaveBeenCalled();
    expect((await raw(document._id))?.sendDispatch.deliveries[0]).toMatchObject({ status: 'dead_letter', attempts: SIGNING_EMAIL_MAX_ATTEMPTS });
  });

  it('does not overwrite a signature recorded while SMTP was in flight', async () => {
    const { document } = await queued();
    mocks.email.mockImplementation(async () => {
      await DocumentModel.updateOne({ _id: document._id }, { $set: { 'recipients.0.status': 'signed', 'recipients.0.signedVersion': 2 } });
      throw new Error('SMTP failed');
    });
    await processSigningEmailJobs({ limit: 1 });
    expect((await raw(document._id))?.recipients[0].status).toBe('signed');
    await retrySigningEmailJobs(String(document._id), String(orgId));
    await processSigningEmailJobs({ limit: 1 });
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect((await raw(document._id))?.sendDispatch.deliveries[0].status).toBe('cancelled');
  });

  it('cancels a queued message whose signing token was rotated', async () => {
    const { document } = await queued();
    await DocumentModel.updateOne({ _id: document._id }, { $set: { 'recipients.0.signingTokenHash': issueSigningToken().tokenHash } });
    await processSigningEmailJobs({ limit: 1 });
    expect(mocks.email).not.toHaveBeenCalled();
    expect((await raw(document._id))?.sendDispatch.deliveries[0]).toMatchObject({ status: 'cancelled' });
  });

  it('does not change a replacement invitation when the previous token fails during SMTP', async () => {
    const { document } = await queued();
    const replacement = issueSigningToken();
    mocks.email.mockImplementation(async () => {
      await DocumentModel.updateOne({ _id: document._id }, { $set: { 'recipients.0.signingTokenHash': replacement.tokenHash } });
      throw new Error('previous invitation failed');
    });
    await processSigningEmailJobs({ limit: 1 });
    expect((await raw(document._id))?.recipients[0]).toMatchObject({ status: 'sent', signingTokenHash: replacement.tokenHash });
  });

  it('supports personal documents while explicitly scoping a null organization', async () => {
    const { document } = await queued();
    expect(await processSigningEmailJobs({ documentId: String(document._id), orgId: null, limit: 1 })).toEqual([]);
    await expect(getSigningEmailDeliverySummary(String(document._id), null)).rejects.toThrow('Signing document unavailable');
    await DocumentModel.updateOne({ _id: document._id }, { $unset: { orgId: 1 } });
    await processSigningEmailJobs({ documentId: String(document._id), orgId: null, limit: 1 });
    expect((await getSigningEmailDeliverySummary(String(document._id), null)).completed).toBe(1);
  });

  it('upgrades an old stale dispatch even when its recipients are still sent', async () => {
    const { document, token } = await queued();
    await DocumentModel.updateOne({ _id: document._id }, { $set: { sendDispatch: { claimId: 'legacy', status: 'processing', claimedAt: oldDate() } } });
    expect((await retry(retryRequest(document._id), params(document._id))).status).toBe(200);
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email.mock.calls[0][3]).not.toBe(token);
    expect((await raw(document._id))?.sendDispatch.status).toBe('completed');
  });

  it('does not resend successful recipients when migrating a legacy failed dispatch', async () => {
    const { document } = await queued();
    const deliveredToken = issueSigningToken();
    await DocumentModel.updateOne({ _id: document._id }, { $set: {
      sendDispatch: { claimId: 'legacy-failed', status: 'failed', claimedAt: oldDate() },
      recipients: [
        { ...recipient, status: 'delivery_failed' },
        { ...recipient, id: 'already-delivered', email: 'delivered@example.test', status: 'sent', signingTokenHash: deliveredToken.tokenHash },
      ],
    } });
    expect((await retry(retryRequest(document._id), params(document._id))).status).toBe(200);
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email.mock.calls[0][0].id).toBe(recipient.id);
    expect((await raw(document._id))?.recipients[1].signingTokenHash).toBe(deliveredToken.tokenHash);
  });

  it('hides encrypted tokens from normal reads and scopes retries to the API organization', async () => {
    const { document } = await queued();
    expect((await DocumentModel.findById(document._id)).sendDispatch.deliveries[0].tokenEncrypted).toBeUndefined();
    mocks.apiKey.mockResolvedValue({ orgId: String(new mongoose.Types.ObjectId()), userId: String(userId), scopes: ['documents:write'] });
    expect((await retry(retryRequest(document._id), params(document._id))).status).toBe(409);
    expect(mocks.email).not.toHaveBeenCalled();
    await DocumentModel.updateOne({ _id: document._id }, { $set: { status: 'voided' } });
    expect(await processSigningEmailJobs({ limit: 1 })).toEqual([]);
  });

  it('authenticates the cron worker, validates limits, and repairs a missed dispatch completion', async () => {
    const { document } = await queued();
    expect((await cronGet(new NextRequest('https://example.test/api/cron/signing-emails'))).status).toBe(401);
    expect((await cronPost(new NextRequest('https://example.test/api/cron/signing-emails', { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, body: '{"limit":0}' }))).status).toBe(400);
    await DocumentModel.updateOne({ _id: document._id }, { $set: { 'sendDispatch.deliveries.0.status': 'completed' }, $unset: { 'sendDispatch.deliveries.0.tokenEncrypted': 1 } });
    const response = await cronGet(new NextRequest('https://example.test/api/cron/signing-emails', { headers: { authorization: 'Bearer test-cron-secret' } }));
    expect(response.status).toBe(200);
    expect((await raw(document._id))?.sendDispatch.status).toBe('completed');
  });
});
