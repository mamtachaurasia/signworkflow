import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const WEBHOOK_ID = '507f1f77bcf86cd799439011';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  endpointFind: vi.fn(),
  endpointFindOne: vi.fn(),
  endpointFindOneAndUpdate: vi.fn(),
  endpointUpdateOne: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  connectDB: vi.fn(),
  resolveWebhookDestination: vi.fn(),
  resolveWebhookSignatureVersion: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
}));
vi.mock('@/lib/auth-context', () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock('@/lib/role-utils', () => ({ isAdminRole: vi.fn(() => true) }));
vi.mock('@/lib/webhook-url', () => ({ resolveWebhookDestination: mocks.resolveWebhookDestination }));
vi.mock('@/lib/webhook-events', () => ({ normalizeWebhookEventSubscriptions: vi.fn((events: string[]) => events) }));
vi.mock('@/lib/webhooks', () => ({
  createWebhookSecret: vi.fn(() => ({ secret: 'whsec_replacement', secretHash: 'hash', secretEncrypted: 'encrypted', secretPrefix: 'whsec_replace' })),
  PAUSED_WEBHOOK_DELIVERY_ERROR: 'Webhook endpoint is paused.',
  resolveWebhookSignatureVersion: mocks.resolveWebhookSignatureVersion,
}));
vi.mock('@/models/WebhookEndpoint', () => ({
  default: {
    find: mocks.endpointFind,
    findOne: mocks.endpointFindOne,
    findOneAndUpdate: mocks.endpointFindOneAndUpdate,
    updateOne: mocks.endpointUpdateOne,
  },
}));
vi.mock('@/models/WebhookDelivery', () => ({ default: { updateMany: mocks.deliveryUpdateMany } }));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));

import { GET } from '@/app/api/v1/webhooks/route';
import { DELETE, PATCH } from '@/app/api/v1/webhooks/[webhookId]/route';
import { POST as rotateSecret } from '@/app/api/v1/webhooks/[webhookId]/rotate-secret/route';

function listQuery(value: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }),
    }),
  };
}

function oneQuery(value: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

describe('webhook management compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthContext.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'owner' });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.resolveWebhookSignatureVersion.mockImplementation((endpoint: { signatureVersion?: string }) => endpoint.signatureVersion || 'v1');
    mocks.deliveryUpdateMany.mockReturnValue({ exec: vi.fn().mockResolvedValue(undefined) });
  });

  it('does not list legacy active:false records with no pause or revocation marker', async () => {
    mocks.endpointFind.mockReturnValue(listQuery([]));

    const response = await GET(new NextRequest('https://signworkflow.com/api/v1/webhooks'));

    expect(response.status).toBe(200);
    expect(mocks.endpointFind).toHaveBeenCalledWith({
      orgId: 'org-1',
      revokedAt: null,
      $or: [
        { active: { $ne: false } },
        { active: false, pausedAt: { $type: 'date' } },
      ],
    });
  });

  it('refuses to resume a legacy revoked endpoint', async () => {
    mocks.endpointFindOne.mockReturnValue(oneQuery(null));
    const request = new NextRequest(`https://signworkflow.com/api/v1/webhooks/${WEBHOOK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ webhookId: WEBHOOK_ID }) });

    expect(response.status).toBe(404);
    expect(mocks.endpointFindOne).toHaveBeenCalledWith(expect.objectContaining({
      _id: WEBHOOK_ID,
      revokedAt: null,
      $or: expect.arrayContaining([{ active: false, pausedAt: { $type: 'date' } }]),
    }));
    expect(mocks.endpointFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rotates a v1 secret without changing its signature contract', async () => {
    mocks.endpointFindOneAndUpdate.mockReturnValue(oneQuery({
      _id: WEBHOOK_ID,
      url: 'https://hooks.example.test/webhook',
      secretPrefix: 'whsec_replace',
      signatureVersion: 'v1',
      events: ['*'],
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }));
    const request = new NextRequest(`https://signworkflow.com/api/v1/webhooks/${WEBHOOK_ID}/rotate-secret`, { method: 'POST' });

    const response = await rotateSecret(request, { params: Promise.resolve({ webhookId: WEBHOOK_ID }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.webhook.signatureVersion).toBe('v1');
    expect(payload.warning).toContain('v1 signing format is unchanged');
    expect(mocks.endpointFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: WEBHOOK_ID,
        revokedAt: null,
        $or: expect.arrayContaining([{ active: false, pausedAt: { $type: 'date' } }]),
      }),
      { $set: expect.not.objectContaining({ signatureVersion: expect.anything() }) },
      { new: true }
    );
  });

  it('reports the effective v2 contract after patching an unversioned post-rollout endpoint', async () => {
    mocks.endpointFindOne.mockReturnValue(oneQuery({ eventContractVersion: 'v1' }));
    mocks.endpointFindOneAndUpdate.mockReturnValue(oneQuery({
      _id: WEBHOOK_ID,
      url: 'https://hooks.example.test/webhook',
      secretPrefix: 'whsec_legacy',
      events: ['*'],
      active: true,
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    }));
    mocks.resolveWebhookSignatureVersion.mockReturnValue('v2');
    const request = new NextRequest(`https://signworkflow.com/api/v1/webhooks/${WEBHOOK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: ['*'] }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ webhookId: WEBHOOK_ID }) });

    expect(response.status).toBe(200);
    expect((await response.json()).webhook.signatureVersion).toBe('v2');
    expect(mocks.resolveWebhookSignatureVersion).toHaveBeenCalledWith(expect.objectContaining({
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    }));
  });

  it('defers a paused endpoint backlog and restores it on resume', async () => {
    mocks.endpointFindOne
      .mockReturnValueOnce(oneQuery({ eventContractVersion: 'v1', active: true }))
      .mockReturnValueOnce(oneQuery({ eventContractVersion: 'v1', active: false }));
    mocks.endpointFindOneAndUpdate
      .mockReturnValueOnce(oneQuery({
        _id: WEBHOOK_ID,
        url: 'https://hooks.example.test/webhook',
        secretPrefix: 'whsec_pause',
        signatureVersion: 'v2',
        events: ['*'],
        active: false,
        pausedAt: new Date(),
        createdAt: new Date(),
      }))
      .mockReturnValueOnce(oneQuery({
        _id: WEBHOOK_ID,
        url: 'https://hooks.example.test/webhook',
        secretPrefix: 'whsec_pause',
        signatureVersion: 'v2',
        events: ['*'],
        active: true,
        pausedAt: null,
        createdAt: new Date(),
      }));

    const pauseResponse = await PATCH(new NextRequest(`https://signworkflow.com/api/v1/webhooks/${WEBHOOK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: false }),
    }), { params: Promise.resolve({ webhookId: WEBHOOK_ID }) });

    expect(pauseResponse.status).toBe(200);
    expect(mocks.deliveryUpdateMany).toHaveBeenLastCalledWith(
      { endpointId: WEBHOOK_ID, status: { $in: ['pending', 'failed'] } },
      {
        $set: {
          status: 'paused',
          lockedAt: null,
          lastError: 'Webhook endpoint is paused.',
          pausedStateCheckedAt: null,
        },
      }
    );

    const resumeResponse = await PATCH(new NextRequest(`https://signworkflow.com/api/v1/webhooks/${WEBHOOK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: true }),
    }), { params: Promise.resolve({ webhookId: WEBHOOK_ID }) });

    expect(resumeResponse.status).toBe(200);
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      { endpointId: WEBHOOK_ID, status: 'paused' },
      { $set: { pausedStateCheckedAt: null } }
    );
    expect(mocks.deliveryUpdateMany).toHaveBeenLastCalledWith(
      { endpointId: WEBHOOK_ID, status: { $in: ['paused', 'pending', 'failed'] } },
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
  });

  it('preserves delivery retry backoff when an already-active endpoint is activated again', async () => {
    mocks.endpointFindOne.mockReturnValue(oneQuery({ eventContractVersion: 'v1', active: true }));
    mocks.endpointFindOneAndUpdate.mockReturnValue(oneQuery({
      _id: WEBHOOK_ID,
      url: 'https://hooks.example.test/webhook',
      secretPrefix: 'whsec_active',
      signatureVersion: 'v2',
      events: ['*'],
      active: true,
      pausedAt: null,
      createdAt: new Date(),
    }));

    const response = await PATCH(new NextRequest(`https://signworkflow.com/api/v1/webhooks/${WEBHOOK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: true }),
    }), { params: Promise.resolve({ webhookId: WEBHOOK_ID }) });

    expect(response.status).toBe(200);
    expect((await response.json()).webhook.active).toBe(true);
    expect(mocks.endpointFindOneAndUpdate).toHaveBeenCalled();
    expect(mocks.deliveryUpdateMany).not.toHaveBeenCalled();
  });

  it('dead-letters deferred deliveries when a paused endpoint is revoked', async () => {
    mocks.endpointUpdateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ matchedCount: 1 }) });

    const response = await DELETE(new NextRequest(`https://signworkflow.com/api/v1/webhooks/${WEBHOOK_ID}`, {
      method: 'DELETE',
    }), { params: Promise.resolve({ webhookId: WEBHOOK_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      { endpointId: WEBHOOK_ID, status: { $in: ['pending', 'paused', 'failed'] } },
      {
        $set: {
          status: 'dead_letter',
          lockedAt: null,
          lastError: 'Webhook endpoint was revoked.',
          pausedStateCheckedAt: null,
        },
      }
    );
  });

  it('prioritizes held deliveries for reconciliation if revocation terminalization fails', async () => {
    mocks.endpointUpdateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ matchedCount: 1 }) });
    mocks.deliveryUpdateMany
      .mockReturnValueOnce({ exec: vi.fn().mockRejectedValue(new Error('temporary delivery write failure')) })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(undefined) });

    await expect(DELETE(new NextRequest(`https://signworkflow.com/api/v1/webhooks/${WEBHOOK_ID}`, {
      method: 'DELETE',
    }), { params: Promise.resolve({ webhookId: WEBHOOK_ID }) })).rejects.toThrow('temporary delivery write failure');

    expect(mocks.deliveryUpdateMany).toHaveBeenLastCalledWith(
      { endpointId: WEBHOOK_ID, status: 'paused' },
      { $set: { pausedStateCheckedAt: null } }
    );
  });
});
