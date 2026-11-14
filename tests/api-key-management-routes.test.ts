import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const KEY_ID = '507f1f77bcf86cd799439011';
const REPLACEMENT_ID = '507f1f77bcf86cd799439012';
const NOW = new Date('2026-09-10T12:00:00.000Z');

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  connectDB: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
}));
vi.mock('@/lib/auth-context', () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/api-key', () => ({
  API_KEY_MAX_REQUESTS_PER_MINUTE: 600,
  API_KEY_SCOPES: ['documents:read', 'documents:write'],
  createApiKeySecret: vi.fn(() => ({
    secret: 'sw_live_new_secret',
    prefix: 'sw_live_new',
    secretHash: 'private-credential-hash',
  })),
}));
vi.mock('@/models/ApiKey', () => ({ default: {
  find: mocks.find,
  findOne: mocks.findOne,
  updateOne: mocks.updateOne,
  create: mocks.create,
} }));

import { GET, POST } from '@/app/api/v1/keys/route';
import { DELETE, PATCH } from '@/app/api/v1/keys/[keyId]/route';
import { POST as rotateKey } from '@/app/api/v1/keys/[keyId]/rotate/route';

function request(method: string, body?: unknown, suffix = '') {
  return new NextRequest(`https://signworkflow.com/api/v1/keys${suffix}`, {
    method,
    ...(body !== undefined ? {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    } : {}),
  });
}

function params() {
  return { params: Promise.resolve({ keyId: KEY_ID }) };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    _id: REPLACEMENT_ID,
    name: 'Production API',
    prefix: 'sw_live_new',
    scopes: ['documents:read'],
    createdAt: NOW,
    lastUsedAt: null,
    expiresAt: null,
    allowedIpCidrs: [],
    maxRequestsPerMinute: 600,
    rotationIntervalDays: null,
    rotationDueAt: null,
    rotatedAt: null,
    rotatedFrom: null,
    secretHash: 'private-credential-hash',
    orgId: 'org-1',
    createdBy: 'user-1',
    revokedAt: null,
    updatedAt: NOW,
    __v: 0,
    futurePrivateField: 'must stay private',
    ...overrides,
  };
}

const publicKey = {
  id: REPLACEMENT_ID,
  name: 'Production API',
  prefix: 'sw_live_new',
  scopes: ['documents:read'],
  createdAt: NOW.toISOString(),
  lastUsedAt: null,
  expiresAt: null,
  allowedIpCidrs: [],
  maxRequestsPerMinute: 600,
  rotationIntervalDays: null,
  rotationDueAt: null,
  rotatedAt: null,
  rotatedFrom: null,
};

describe('API key management security', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.getAuthContext.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'owner' });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ matchedCount: 1 }) });
    mocks.create.mockImplementation(async (fields: Record<string, unknown>) => ({
      toObject: () => record(fields),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([null, 3650])('cannot clear or extend a rotated key expiry (expiresInDays: %s)', async (expiresInDays) => {
    const retirement = new Date('2026-09-11T12:00:00.000Z');
    const source = record({ _id: KEY_ID, rotatedAt: NOW, expiresAt: retirement });
    mocks.updateOne.mockImplementation((filter, update) => ({
      exec: async () => {
        // Model the null/missing rotation predicate used by MongoDB. A missing
        // predicate would let this update revive the retiring credential.
        const matches = !Object.hasOwn(filter, 'rotatedAt') || source.rotatedAt === filter.rotatedAt;
        if (matches) Object.assign(source, update.$set);
        return { matchedCount: matches ? 1 : 0 };
      },
    }));

    const response = await PATCH(request('PATCH', { expiresInDays }, `/${KEY_ID}`), params());

    expect(response.status).toBe(404);
    expect(source.expiresAt).toEqual(retirement);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: KEY_ID, orgId: 'org-1', revokedAt: null, rotatedAt: null },
      { $set: { expiresAt: expiresInDays === null ? null : expect.any(Date) } }
    );
  });

  it('still allows expiry changes for an unrotated key', async () => {
    const response = await PATCH(request('PATCH', { expiresInDays: null }, `/${KEY_ID}`), params());

    expect(response.status).toBe(200);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: KEY_ID, orgId: 'org-1', revokedAt: null, rotatedAt: null },
      { $set: { expiresAt: null } }
    );
  });

  it('still permits immediate revocation of a retiring credential', async () => {
    const response = await DELETE(request('DELETE', undefined, `/${KEY_ID}`), params());

    expect(response.status).toBe(200);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: KEY_ID, orgId: 'org-1', revokedAt: null },
      { $set: { revokedAt: NOW } }
    );
  });

  it('returns only public fields when creating a key, even with private document paths', async () => {
    const response = await POST(request('POST', { name: 'Production API' }));

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.key).toEqual(publicKey);
    expect(payload.secret).toBe('sw_live_new_secret');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ secretHash: 'private-credential-hash' }));
  });

  it('returns only public fields for a replacement key and retains the rotation link', async () => {
    mocks.findOne.mockReturnValue({ select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(record({ _id: KEY_ID })),
    }) });

    const response = await rotateKey(request('POST', {}, `/${KEY_ID}/rotate`), params());

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.key).toEqual({ ...publicKey, name: 'Production API (rotated)', rotatedFrom: KEY_ID });
    expect(payload.secret).toBe('sw_live_new_secret');
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: KEY_ID }),
      { $set: { rotatedAt: NOW, expiresAt: new Date('2026-09-11T12:00:00.000Z') } }
    );
  });

  it('lists rotation state without leaking private fields', async () => {
    const select = vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([record({ rotatedAt: NOW })]),
    }) });
    mocks.find.mockReturnValue({ select });

    const response = await GET(request('GET'));

    expect(response.status).toBe(200);
    expect((await response.json()).keys).toEqual([{ ...publicKey, rotatedAt: NOW.toISOString() }]);
    expect(select).toHaveBeenCalledWith(expect.stringContaining('rotatedAt'));
  });

  it.each(['10.0.0.0/0x10', '10.0.0.0/1e1'])('rejects malformed CIDRs in every key-management write: %s', async (cidr) => {
    const controls = { allowedIpCidrs: [cidr] };
    const responses = [
      await POST(request('POST', { name: 'Production API', ...controls })),
      await PATCH(request('PATCH', controls, `/${KEY_ID}`), params()),
      await rotateKey(request('POST', controls, `/${KEY_ID}/rotate`), params()),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect((await response.json()).message).toContain('valid IPv4 or IPv6');
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});
