import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  consumeRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/models/ApiKey', () => ({
  default: { findOne: mocks.findOne, updateOne: mocks.updateOne },
}));
vi.mock('@/lib/rateLimit', () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock('@/lib/auth', () => ({ getClientIp: mocks.getClientIp }));

import { getApiKeyContext } from '@/lib/api-key';

function apiKeyRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'key-1',
    orgId: 'org-1',
    createdBy: 'user-1',
    scopes: ['documents:read'],
    allowedIpCidrs: [],
    maxRequestsPerMinute: 600,
    ...overrides,
  };
}

function findOneResult(value: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

describe('API key security controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.getClientIp.mockReturnValue('203.0.113.10');
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, limit: 600, remaining: 599, resetAt: Date.now() + 60_000, retryAfterSeconds: 0 });
    mocks.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(undefined) });
  });

  it('uses a key-specific request budget', async () => {
    mocks.findOne.mockReturnValue(findOneResult(apiKeyRecord({ maxRequestsPerMinute: 25 })));

    const context = await getApiKeyContext(new NextRequest('https://signworkflow.com/api/v1/documents', {
      headers: { 'x-api-key': 'sw_live_test_secret' },
    }));

    expect(context?.rateLimit.limit).toBe(600);
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });

  it('rejects a valid secret from an IP outside its allowlist before consuming quota', async () => {
    mocks.findOne.mockReturnValue(findOneResult(apiKeyRecord({ allowedIpCidrs: ['198.51.100.0/24'] })));

    const context = await getApiKeyContext(new NextRequest('https://signworkflow.com/api/v1/documents', {
      headers: { 'x-api-key': 'sw_live_test_secret' },
    }));

    expect(context).toBeNull();
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('queries only active, unexpired keys', async () => {
    mocks.findOne.mockReturnValue(findOneResult(null));

    await getApiKeyContext(new NextRequest('https://signworkflow.com/api/v1/documents', {
      headers: { authorization: 'Bearer sw_live_test_secret' },
    }));

    expect(mocks.findOne).toHaveBeenCalledWith(expect.objectContaining({
      revokedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: expect.any(Date) } }],
    }));
  });
});
