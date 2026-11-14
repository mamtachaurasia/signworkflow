import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { consumeRateLimit } from '@/lib/rateLimit';
import { connectTestDb, disconnectTestDb, resetTestDb } from '../helpers/db';

describe('MongoDB-backed rate limiting (integration)', () => {
  beforeAll(async () => {
    process.env.AUDIT_LOG_HASH_PEPPER = 'integration-rate-limit-pepper';
    await connectTestDb();
    await resetTestDb();
  });

  afterAll(async () => {
    await resetTestDb();
    await disconnectTestDb();
  });

  it('atomically limits concurrent requests and creates the TTL index', async () => {
    const rawKey = '203.0.113.70';
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        consumeRateLimit({
          key: rawKey,
          namespace: 'integration:concurrent',
          limit: 10,
          windowSeconds: 900,
          requireDistributed: true,
        })
      )
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(2);

    const collection = mongoose.connection.collection('rate_limit_counters');
    const counter = await collection.findOne({ namespace: 'integration:concurrent' });
    expect(counter?.count).toBe(12);
    expect(String(counter?._id)).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(counter)).not.toContain(rawKey);

    const indexes = await collection.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'rate_limit_expires_at_ttl',
          expireAfterSeconds: 0,
        }),
      ])
    );
  });

  it('starts a fresh fixed window when an existing counter has expired', async () => {
    const input = {
      key: 'supporter@example.com',
      namespace: 'integration:expired',
      limit: 4,
      windowSeconds: 3600,
      requireDistributed: true,
    } as const;

    await consumeRateLimit(input);
    const collection = mongoose.connection.collection('rate_limit_counters');
    await collection.updateOne(
      { namespace: input.namespace },
      { $set: { count: 99, expiresAt: new Date(Date.now() - 1000) } }
    );

    const result = await consumeRateLimit(input);
    const counter = await collection.findOne({ namespace: input.namespace });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
    expect(counter?.count).toBe(1);
    expect(counter?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
