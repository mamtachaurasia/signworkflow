import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  endpointFind: vi.fn(),
  endpointFindOne: vi.fn(),
  endpointUpdateOne: vi.fn(),
  deliveryInsertMany: vi.fn(),
  deliveryFind: vi.fn(),
  deliveryFindOneAndUpdate: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  decryptCloudSecret: vi.fn(),
  postWebhookJson: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/cloud/crypto', () => ({
  decryptCloudSecret: mocks.decryptCloudSecret,
  encryptCloudSecret: vi.fn((value: string) => `encrypted:${value}`),
}));
vi.mock('@/lib/webhook-url', () => ({ postWebhookJson: mocks.postWebhookJson }));
vi.mock('@/models/WebhookEndpoint', () => ({
  default: {
    find: mocks.endpointFind,
    findOne: mocks.endpointFindOne,
    updateOne: mocks.endpointUpdateOne,
  },
}));
vi.mock('@/models/WebhookDelivery', () => ({
  default: {
    insertMany: mocks.deliveryInsertMany,
    find: mocks.deliveryFind,
    findOneAndUpdate: mocks.deliveryFindOneAndUpdate,
    updateMany: mocks.deliveryUpdateMany,
  },
}));

import {
  deliverWebhookEvent,
  enqueueWebhookEvent,
  processPendingWebhookDeliveries,
  processWebhookDelivery,
  replayWebhookDelivery,
} from '@/lib/webhooks';

function endpointList(value: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function deliveryPage(value: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }),
      }),
    }),
  };
}

describe('durable webhook delivery queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.decryptCloudSecret.mockReturnValue('webhook-secret');
    mocks.endpointUpdateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(undefined) });
    mocks.deliveryUpdateMany.mockReturnValue({ exec: vi.fn().mockResolvedValue(undefined) });
    mocks.deliveryFind.mockReturnValue(deliveryPage([]));
  });

  it('preserves an interrupted attempt and appends a new result after reclaim', async () => {
    const delivery = {
      _id: 'delivery-interrupted', orgId: 'org-1', endpointId: 'endpoint-1',
      payload: { id: 'evt_interrupted', type: 'document_finalized', data: {}, createdAt: new Date().toISOString() },
      status: 'processing', attempts: 2, maxAttempts: 8,
      attemptHistory: [{ sequence: 1, startedAt: new Date('2026-09-01T00:00:00.000Z'), finishedAt: null, outcome: 'processing', statusCode: null, error: null }],
      save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(delivery);
    mocks.endpointFindOne.mockReturnValue(endpointList({ _id: 'endpoint-1', url: 'https://hooks.example.test', secretEncrypted: 'encrypted', signatureVersion: 'v2' }));
    mocks.postWebhookJson.mockResolvedValue({ delivered: false, statusCode: 503 });
    await processWebhookDelivery('delivery-interrupted');
    expect(delivery.attemptHistory).toEqual([
      expect.objectContaining({ sequence: 1, outcome: 'interrupted', statusCode: null, error: 'Worker stopped before recording the delivery outcome.' }),
      expect.objectContaining({ sequence: 2, outcome: 'failed', statusCode: 503, error: 'Endpoint returned HTTP 503.' }),
    ]);
    expect(delivery.status).toBe('failed');
    await replayWebhookDelivery({ orgId: 'org-1', deliveryId: 'delivery-interrupted' });
    expect(mocks.deliveryFindOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: 'delivery-interrupted', orgId: 'org-1', status: { $in: ['failed', 'dead_letter'] } },
      { $set: { status: 'pending', attempts: 0, nextAttemptAt: expect.any(Date), lockedAt: null, lastError: null } },
      { new: true },
    );
    // Replay resets the retry allowance but never removes previous outcomes.
    expect(delivery.attemptHistory).toHaveLength(2);
  });

  it('persists matching deliveries without performing network I/O in the request lifecycle', async () => {
    mocks.endpointFind.mockReturnValue(endpointList([
      { _id: 'endpoint-all', events: ['*'] },
      { _id: 'endpoint-match', events: ['document_finalized'] },
      { _id: 'endpoint-other', events: ['recipient_viewed'] },
    ]));
    mocks.deliveryInsertMany.mockImplementation(async (values) => values);

    await enqueueWebhookEvent({
      orgId: 'org-1',
      event: 'document_finalized',
      data: { documentId: 'doc-1' },
    });

    const queued = mocks.deliveryInsertMany.mock.calls[0][0];
    expect(queued).toHaveLength(2);
    expect(queued[0]).toEqual(expect.objectContaining({
      endpointId: 'endpoint-all',
      event: 'document_finalized',
      status: 'pending',
    }));
    expect(queued[0].payload.id).toMatch(/^evt_/);
    expect(mocks.postWebhookJson).not.toHaveBeenCalled();
  });

  it('reuses outbox event identities across re-enqueue and tolerates only duplicate rows', async () => {
    mocks.endpointFind.mockReturnValue(endpointList([{ _id: 'endpoint-1', events: ['*'], eventContractVersion: 'v1' }]));
    mocks.deliveryInsertMany.mockImplementationOnce(async (values) => values)
      .mockRejectedValueOnce({ code: 11000 })
      .mockRejectedValueOnce({ code: 11000, writeErrors: [{ code: 11000 }, { code: 121 }] });
    const input = { orgId: 'org-1', event: 'document_finalized', data: { documentId: 'doc-1' },
      eventId: 'evt_persisted', createdAt: new Date('2026-09-12T12:00:00.000Z') };
    await enqueueWebhookEvent(input);
    await expect(enqueueWebhookEvent(input)).resolves.toEqual([]);
    expect(mocks.deliveryInsertMany.mock.calls[0][0][0].payload).toEqual(mocks.deliveryInsertMany.mock.calls[1][0][0].payload);
    expect(mocks.deliveryInsertMany.mock.calls[0][0][0].payload).toEqual(expect.objectContaining({
      id: 'evt_persisted', createdAt: input.createdAt.toISOString(),
    }));
    expect(mocks.endpointFind).toHaveBeenCalledWith(expect.objectContaining({ createdAt: { $lte: input.createdAt } }));
    await expect(enqueueWebhookEvent(input)).rejects.toEqual(expect.objectContaining({ code: 11000 }));
  });

  it.each([
    { contract: 'legacy', eventContractVersion: undefined, expectedEvent: 'document.send_for_signing.success' },
    { contract: 'v1', eventContractVersion: 'v1', expectedEvent: 'document_sent_for_signing' },
  ])('holds newly emitted $contract events for paused subscribers', async ({ eventContractVersion, expectedEvent }) => {
    const endpoints = endpointList([
      { _id: 'active', active: true, events: [expectedEvent], eventContractVersion },
      { _id: 'paused', active: false, events: [expectedEvent], eventContractVersion },
      { _id: 'unsubscribed', active: false, events: ['document_finalized'], eventContractVersion },
    ]);
    mocks.endpointFind.mockReturnValue(endpoints);
    mocks.deliveryInsertMany.mockImplementation(async (values) => values);
    const data = { documentId: 'doc-during-pause' };

    const deliveries = await enqueueWebhookEvent({
      orgId: 'org-1',
      event: 'document.send_for_signing.success',
      data,
    });

    expect(deliveries).toHaveLength(2);
    expect(deliveries).toEqual([
      expect.objectContaining({ endpointId: 'active', status: 'pending', attempts: 0 }),
      expect.objectContaining({
        endpointId: 'paused',
        status: 'paused',
        attempts: 0,
        pausedStateCheckedAt: null,
        lastError: 'Webhook endpoint is paused.',
        payload: expect.objectContaining({ type: expectedEvent, data }),
      }),
    ]);
    // Both subscribers retain the same event identity and original payload.
    expect(deliveries[1].eventId).toBe(deliveries[0].eventId);
    expect(deliveries[1].payload).toEqual(deliveries[0].payload);
    expect(mocks.postWebhookJson).not.toHaveBeenCalled();
    // Include explicit pauses, while excluding both modern and legacy revocations.
    expect(mocks.endpointFind).toHaveBeenCalledWith({
      orgId: 'org-1',
      revokedAt: null,
      $or: [
        { active: { $ne: false } },
        { active: false, pausedAt: { $type: 'date' } },
      ],
    });
    expect(endpoints.select).toHaveBeenCalledWith(expect.stringMatching(/\bactive\b/));
  });

  it('sends only documented events to versioned endpoints and canonicalizes UI send events', async () => {
    mocks.endpointFind.mockReturnValue(endpointList([
      { _id: 'legacy', events: ['*'] },
      { _id: 'versioned', events: ['*'], eventContractVersion: 'v1' },
    ]));
    mocks.deliveryInsertMany.mockImplementation(async (values) => values);

    await enqueueWebhookEvent({
      orgId: 'org-1',
      event: 'document.send_for_signing.success',
      data: { documentId: 'doc-1' },
    });

    expect(mocks.deliveryInsertMany).toHaveBeenCalledTimes(2);
    const versionedDelivery = mocks.deliveryInsertMany.mock.calls[1][0][0];
    expect(versionedDelivery).toEqual(expect.objectContaining({
      endpointId: 'versioned',
      event: 'document_sent_for_signing',
      payload: expect.objectContaining({ schemaVersion: '2026-09-08' }),
    }));

    vi.clearAllMocks();
    mocks.endpointFind.mockReturnValue(endpointList([
      { _id: 'legacy', events: ['*'] },
      { _id: 'versioned', events: ['*'], eventContractVersion: 'v1' },
    ]));
    mocks.deliveryInsertMany.mockImplementation(async (values) => values);
    await enqueueWebhookEvent({ orgId: 'org-1', event: 'user_login', data: {} });
    expect(mocks.deliveryInsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.deliveryInsertMany.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.deliveryInsertMany.mock.calls[0][0][0].endpointId).toBe('legacy');
  });

  it('delivers a claimed job and marks it complete', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const delivery = {
      _id: 'delivery-1',
      orgId: 'org-1',
      endpointId: 'endpoint-1',
      payload: { id: 'evt_1', type: 'document_finalized', data: {}, createdAt: new Date().toISOString() },
      status: 'processing',
      attempts: 1,
      maxAttempts: 8,
      lastStatusCode: null,
      lastError: null,
      lockedAt: new Date(),
      deliveredAt: null,
      save,
    };
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(delivery);
    mocks.endpointFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'endpoint-1',
          url: 'https://hooks.example.test/signworkflow',
          secretEncrypted: 'encrypted',
          signatureVersion: 'v2',
        }),
      }),
    });
    mocks.postWebhookJson.mockResolvedValue({ delivered: true, statusCode: 204 });

    await processWebhookDelivery('delivery-1');

    expect(mocks.postWebhookJson).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://hooks.example.test/signworkflow',
      headers: expect.objectContaining({
        'x-signworkflow-signature': expect.stringMatching(/^sha256=/),
        'x-signworkflow-timestamp': expect.any(String),
      }),
    }));
    const request = mocks.postWebhookJson.mock.calls[0][0];
    const expectedV2Signature = createHmac('sha256', 'webhook-secret')
      .update(`${request.headers['x-signworkflow-timestamp']}.${request.body}`)
      .digest('hex');
    expect(request.headers['x-signworkflow-signature-version']).toBe('v2');
    expect(request.headers['x-signworkflow-signature']).toBe(`sha256=${expectedV2Signature}`);
    expect(delivery.status).toBe('delivered');
    expect(delivery.lastStatusCode).toBe(204);
    expect(delivery.lockedAt).toBeNull();
    expect(save).toHaveBeenCalledTimes(2);
    expect(delivery).toEqual(expect.objectContaining({ attemptHistory: [expect.objectContaining({ sequence: 1, outcome: 'delivered', statusCode: 204, error: null, startedAt: expect.any(Date), finishedAt: expect.any(Date) })] }));
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(mocks.postWebhookJson.mock.invocationCallOrder[0]);
  });

  it('marks versioned event deliveries with their schema version', async () => {
    mocks.postWebhookJson.mockResolvedValue({ delivered: true, statusCode: 200 });
    await deliverWebhookEvent({
      _id: 'contract-v1',
      url: 'https://hooks.example.test/contract',
      secretEncrypted: 'encrypted',
      signatureVersion: 'v2',
      eventContractVersion: 'v1',
    }, {
      id: 'evt_contract',
      type: 'document_finalized',
      data: {},
      createdAt: new Date().toISOString(),
      schemaVersion: '2026-09-08',
    });
    expect(mocks.postWebhookJson.mock.calls[0][0].headers['x-signworkflow-event-version']).toBe('2026-09-08');
  });

  it('preserves raw-body HMAC verification for endpoints without a signature version', async () => {
    mocks.postWebhookJson.mockResolvedValue({ delivered: true, statusCode: 200 });
    const payload = {
      id: 'evt_legacy',
      type: 'document_finalized',
      data: { documentId: 'doc-1' },
      createdAt: '2026-09-04T12:00:00.000Z',
    };

    await deliverWebhookEvent({
      _id: 'legacy-endpoint',
      url: 'https://hooks.example.test/legacy',
      secretEncrypted: 'encrypted',
    }, payload);

    const request = mocks.postWebhookJson.mock.calls[0][0];
    const expectedV1Signature = createHmac('sha256', 'webhook-secret')
      .update(JSON.stringify(payload))
      .digest('hex');
    expect(request.headers['x-signworkflow-signature-version']).toBe('v1');
    expect(request.headers['x-signworkflow-signature']).toBe(`sha256=${expectedV1Signature}`);
  });

  it('preserves timestamped HMAC for unversioned endpoints created after its rollout', async () => {
    mocks.postWebhookJson.mockResolvedValue({ delivered: true, statusCode: 200 });
    const payload = {
      id: 'evt_unversioned_v2',
      type: 'document_finalized',
      data: { documentId: 'doc-1' },
      createdAt: '2026-09-04T12:00:00.000Z',
    };

    await deliverWebhookEvent({
      _id: 'unversioned-v2-endpoint',
      url: 'https://hooks.example.test/v2-rollout',
      secretEncrypted: 'encrypted',
      createdAt: '2026-09-04T12:00:00.000Z',
    }, payload);

    const request = mocks.postWebhookJson.mock.calls[0][0];
    const expectedSignature = createHmac('sha256', 'webhook-secret')
      .update(`${request.headers['x-signworkflow-timestamp']}.${request.body}`)
      .digest('hex');
    expect(request.headers['x-signworkflow-signature-version']).toBe('v2');
    expect(request.headers['x-signworkflow-signature']).toBe(`sha256=${expectedSignature}`);
    expect(mocks.endpointUpdateOne).toHaveBeenCalledWith(
      { _id: 'unversioned-v2-endpoint', signatureVersion: { $exists: false } },
      { $set: { signatureVersion: 'v2' } }
    );
  });

  it('moves a delivery with an undecryptable endpoint secret into the retry schedule', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const delivery = {
      _id: 'delivery-bad-secret',
      orgId: 'org-1',
      endpointId: 'endpoint-bad-secret',
      payload: { id: 'evt_bad_secret', type: 'document_finalized', data: {}, createdAt: new Date().toISOString() },
      status: 'processing',
      attempts: 1,
      maxAttempts: 8,
      lastStatusCode: null,
      lastError: null,
      nextAttemptAt: new Date(0),
      lockedAt: new Date(),
      deliveredAt: null,
      save,
    };
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(delivery);
    mocks.endpointFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'endpoint-bad-secret',
          url: 'https://hooks.example.test/signworkflow',
          secretEncrypted: 'damaged',
          signatureVersion: 'v2',
        }),
      }),
    });
    mocks.decryptCloudSecret.mockImplementationOnce(() => {
      throw new Error('Unable to decrypt webhook secret');
    });

    await processWebhookDelivery('delivery-bad-secret');

    expect(mocks.postWebhookJson).not.toHaveBeenCalled();
    expect(delivery.status).toBe('failed');
    expect(delivery.lastError).toBe('Unable to decrypt webhook secret');
    expect(delivery.lockedAt).toBeNull();
    expect(delivery.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(save).toHaveBeenCalledTimes(2);
    expect(delivery).toEqual(expect.objectContaining({ attemptHistory: [expect.objectContaining({ outcome: 'failed', statusCode: null, error: expect.any(String) })] }));
  });

  it('dead-letters a stale processing delivery that crashed on its final attempt', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const delivery = {
      _id: 'delivery-final-attempt',
      orgId: 'org-1',
      endpointId: 'endpoint-1',
      payload: { id: 'evt_final', type: 'document_finalized', data: {}, createdAt: new Date().toISOString() },
      status: 'processing',
      attempts: 9,
      maxAttempts: 8,
      lastStatusCode: null,
      lastError: null,
      lockedAt: new Date(),
      save,
    };
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(delivery);
    mocks.endpointFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'endpoint-1',
          url: 'https://hooks.example.test/signworkflow',
          secretEncrypted: 'encrypted',
          signatureVersion: 'v2',
          active: true,
        }),
      }),
    });

    await processWebhookDelivery('delivery-final-attempt');

    expect(delivery.status).toBe('dead_letter');
    expect(delivery.lastError).toBe('The worker stopped during the final webhook delivery attempt.');
    expect(delivery.lockedAt).toBeNull();
    expect(mocks.endpointFindOne).toHaveBeenCalledOnce();
    expect(mocks.postWebhookJson).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
    expect(mocks.deliveryFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ status: 'processing' }),
        ]),
      }),
      expect.anything(),
      expect.anything()
    );
  });

  it('moves a delivery claimed during a pause race into a non-claimable paused state', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const delivery = {
      _id: 'delivery-paused',
      orgId: 'org-1',
      endpointId: 'endpoint-paused',
      payload: { id: 'evt_paused', type: 'document_finalized', data: {}, createdAt: new Date().toISOString() },
      status: 'processing',
      attempts: 1,
      maxAttempts: 8,
      lastError: null,
      lockedAt: new Date(),
      nextAttemptAt: new Date(0),
      save,
    };
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(delivery);
    mocks.endpointFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'endpoint-paused', active: false }),
      }),
    });

    await processWebhookDelivery('delivery-paused');

    expect(delivery.status).toBe('paused');
    expect(delivery.attempts).toBe(0);
    expect(delivery.lastError).toBe('Webhook endpoint is paused.');
    expect(delivery.lockedAt).toBeNull();
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      {
        endpointId: { $in: ['endpoint-paused'] },
        status: { $in: ['pending', 'failed'] },
      },
      {
        $set: {
          status: 'paused',
          lockedAt: null,
          lastError: 'Webhook endpoint is paused.',
          pausedStateCheckedAt: null,
        },
      }
    );
    expect(mocks.postWebhookJson).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it('defers paused endpoint backlogs before claiming active deliveries', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const delivery = {
      _id: 'delivery-active',
      orgId: 'org-1',
      endpointId: 'endpoint-active',
      payload: { id: 'evt_active', type: 'document_finalized', data: {}, createdAt: new Date().toISOString() },
      status: 'processing',
      attempts: 1,
      maxAttempts: 8,
      lastStatusCode: null,
      lastError: null,
      lockedAt: new Date(),
      save,
    };
    mocks.deliveryFind
      .mockReturnValueOnce(deliveryPage([]))
      .mockReturnValueOnce(deliveryPage([{ endpointId: 'endpoint-paused' }]));
    mocks.endpointFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: 'endpoint-paused' }]),
      }),
    });
    mocks.deliveryFindOneAndUpdate
      .mockResolvedValueOnce(delivery);
    mocks.endpointFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'endpoint-active',
          active: true,
          url: 'https://hooks.example.test/active',
          secretEncrypted: 'encrypted',
          signatureVersion: 'v2',
        }),
      }),
    });
    mocks.postWebhookJson.mockResolvedValue({ delivered: true, statusCode: 204 });

    const processed = await processPendingWebhookDeliveries(1);

    expect(mocks.endpointFind).toHaveBeenCalledWith({
      _id: { $in: ['endpoint-paused'] },
      active: false,
      pausedAt: { $type: 'date' },
      revokedAt: null,
    });
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      {
        endpointId: { $in: ['endpoint-paused'] },
        status: { $in: ['pending', 'failed'] },
      },
      {
        $set: {
          status: 'paused',
          lockedAt: null,
          lastError: 'Webhook endpoint is paused.',
          pausedStateCheckedAt: null,
        },
      }
    );
    expect(mocks.deliveryFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ status: { $in: ['pending', 'failed'] } }),
        ]),
      }),
      expect.anything(),
      expect.anything()
    );
    expect(processed).toHaveLength(1);
    expect(processed[0].status).toBe('delivered');
  });

  it('does not begin queue reconciliation after connecting consumes the worker budget', async () => {
    const now = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValue(51_001);

    const processed = await processPendingWebhookDeliveries(10, 50_000);

    expect(processed).toEqual([]);
    expect(mocks.deliveryFind).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('requeues a paused delivery when its endpoint became active after a late pause update', async () => {
    mocks.deliveryFind
      .mockReturnValueOnce(deliveryPage([{ endpointId: 'endpoint-resumed' }]))
      .mockReturnValueOnce(deliveryPage([]));
    mocks.endpointFind.mockReturnValueOnce(endpointList([
      { _id: 'endpoint-resumed', active: true, revokedAt: null },
    ]));
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(null);

    const processed = await processPendingWebhookDeliveries(1);

    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      { endpointId: { $in: ['endpoint-resumed'] }, status: 'paused' },
      {
        $set: expect.objectContaining({
          status: 'pending',
          lockedAt: null,
          lastError: null,
          nextAttemptAt: expect.any(Date),
          pausedStateCheckedAt: null,
        }),
      }
    );
    expect(processed).toEqual([]);
  });

  it('marks a confirmed paused endpoint only when its paused deliveries have not been checked', async () => {
    mocks.deliveryFind
      .mockReturnValueOnce(deliveryPage([{ endpointId: 'endpoint-paused' }]))
      .mockReturnValueOnce(deliveryPage([]))
      .mockReturnValueOnce(deliveryPage([]));
    mocks.endpointFind.mockReturnValueOnce(endpointList([
      { _id: 'endpoint-paused', active: false, pausedAt: new Date(), revokedAt: null },
    ]));
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(null);

    const processed = await processPendingWebhookDeliveries(1);

    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      {
        endpointId: { $in: ['endpoint-paused'] },
        status: 'paused',
        pausedStateCheckedAt: null,
      },
      { $set: { pausedStateCheckedAt: expect.any(Date) } }
    );
    expect(processed).toEqual([]);
  });

  it('defers stale processing deliveries for a paused endpoint before they can consume a claim slot', async () => {
    mocks.deliveryFind
      .mockReturnValueOnce(deliveryPage([]))
      .mockReturnValueOnce(deliveryPage([]))
      .mockReturnValueOnce(deliveryPage([{ endpointId: 'endpoint-paused' }]));
    mocks.endpointFind.mockReturnValueOnce(endpointList([
      { _id: 'endpoint-paused', active: false, pausedAt: new Date(), revokedAt: null },
    ]));
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(null);

    const processed = await processPendingWebhookDeliveries(1);

    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      {
        endpointId: { $in: ['endpoint-paused'] },
        status: 'processing',
        lockedAt: { $lte: expect.any(Date) },
        $expr: { $lt: ['$attempts', '$maxAttempts'] },
      },
      [
        {
          $set: expect.objectContaining({
          status: 'paused',
          lockedAt: null,
          lastError: 'Webhook endpoint is paused.',
          pausedStateCheckedAt: null,
          attemptHistory: expect.objectContaining({
            $map: expect.objectContaining({
              input: { $ifNull: ['$attemptHistory', []] },
            }),
          }),
        }),
        },
      ]
    );
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      {
        endpointId: { $in: ['endpoint-paused'] },
        status: 'processing',
        lockedAt: { $lte: expect.any(Date) },
        $expr: { $gte: ['$attempts', '$maxAttempts'] },
      },
      [
        {
          $set: expect.objectContaining({
          status: 'dead_letter',
          lockedAt: null,
          lastError: 'The worker stopped during the final webhook delivery attempt.',
          pausedStateCheckedAt: null,
          attemptHistory: expect.any(Object),
        }),
        },
      ]
    );
    expect(processed).toEqual([]);
  });

  it('dead-letters an exhausted stale delivery even when its endpoint is paused', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const delivery = {
      _id: 'delivery-paused-final',
      orgId: 'org-1',
      endpointId: 'endpoint-paused',
      payload: { id: 'evt_paused_final', type: 'document_finalized', data: {}, createdAt: new Date().toISOString() },
      status: 'processing',
      attempts: 9,
      maxAttempts: 8,
      lastError: null,
      lockedAt: new Date(),
      save,
    };
    mocks.deliveryFindOneAndUpdate.mockResolvedValue(delivery);
    mocks.endpointFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'endpoint-paused', active: false }),
      }),
    });

    await processWebhookDelivery('delivery-paused-final');

    expect(delivery.status).toBe('dead_letter');
    expect(delivery.lastError).toBe('The worker stopped during the final webhook delivery attempt.');
    expect(delivery.lockedAt).toBeNull();
    expect(mocks.postWebhookJson).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });
});
