import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  createIndex: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('mongoose', () => ({
  default: {
    connection: {
      collection: vi.fn(() => ({
        createIndex: mocks.createIndex,
        findOneAndUpdate: mocks.findOneAndUpdate,
      })),
    },
  },
}));

import { consumeRateLimit } from '@/lib/rateLimit';

describe('consumeRateLimit shared enforcement', () => {
  beforeEach(() => {
    vi.stubEnv('AUDIT_LOG_HASH_PEPPER', 'test-rate-limit-pepper');
    mocks.connectDB.mockReset();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.createIndex.mockReset();
    mocks.createIndex.mockResolvedValue('rate_limit_expires_at_ttl');
    mocks.findOneAndUpdate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses an atomic MongoDB counter without storing the raw client key', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    mocks.findOneAndUpdate.mockResolvedValue({
      _id: 'hashed-counter-id',
      namespace: 'test:shared',
      count: 1,
      expiresAt,
    });

    const result = await consumeRateLimit({
      key: '203.0.113.20',
      namespace: 'test:shared',
      limit: 2,
      windowSeconds: 60,
      requireDistributed: true,
    });

    expect(result.allowed).toBe(true);
    expect(mocks.connectDB).toHaveBeenCalledOnce();
    const updateArguments = mocks.findOneAndUpdate.mock.calls[0];
    expect(updateArguments[0]._id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(updateArguments)).not.toContain('203.0.113.20');
    expect(updateArguments[2]).toEqual({ upsert: true, returnDocument: 'after' });
  });

  it('uses the shared MongoDB counter by default in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.findOneAndUpdate.mockResolvedValue({
      _id: 'hashed-counter-id',
      namespace: 'test:production-default',
      count: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await consumeRateLimit({
      key: 'production-request',
      namespace: 'test:production-default',
      limit: 2,
      windowSeconds: 60,
    });

    expect(result.allowed).toBe(true);
    expect(mocks.connectDB).toHaveBeenCalledOnce();
  });

  it('fails closed and reports a MongoDB outage when the shared store is required', async () => {
    mocks.connectDB.mockRejectedValueOnce(new Error('database unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      consumeRateLimit({
        key: '203.0.113.21',
        namespace: 'test:outage',
        limit: 2,
        windowSeconds: 60,
        requireDistributed: true,
      })
    ).rejects.toThrow('Shared rate limiting is temporarily unavailable.');

    expect(consoleError).toHaveBeenCalledWith('MongoDB-backed rate limiter unavailable:', {
      namespace: 'test:outage',
      error: 'database unavailable',
    });
    consoleError.mockRestore();
  });

  it('retains the in-memory counter for local and development use', async () => {
    const key = `local-${Date.now()}`;

    const first = await consumeRateLimit({
      key,
      namespace: 'test:memory',
      limit: 1,
      windowSeconds: 60,
    });
    const second = await consumeRateLimit({
      key,
      namespace: 'test:memory',
      limit: 1,
      windowSeconds: 60,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(mocks.connectDB).not.toHaveBeenCalled();
  });
});
