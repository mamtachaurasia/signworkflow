import { createHmac } from 'node:crypto';

import mongoose from 'mongoose';

import connectDB from '@/utils/db';

interface RateLimitInput {
  key: string;
  namespace: string;
  limit: number;
  windowSeconds: number;
  requireDistributed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

interface MemoryCounter {
  count: number;
  resetAt: number;
}

interface MongoRateLimitCounter {
  _id: string;
  namespace: string;
  count: number;
  expiresAt: Date;
}

interface GlobalWithRateLimitStore {
  __rateLimitStore?: Map<string, MemoryCounter>;
}

const globalStore = globalThis as GlobalWithRateLimitStore;
let mongoRateLimitIndexPromise: Promise<string> | null = null;

function getMemoryStore(): Map<string, MemoryCounter> {
  if (!globalStore.__rateLimitStore) {
    globalStore.__rateLimitStore = new Map<string, MemoryCounter>();
  }
  return globalStore.__rateLimitStore;
}

function toRateLimitResult(
  count: number,
  limit: number,
  resetAt: number,
  now = Date.now()
): RateLimitResult {
  const remaining = Math.max(limit - count, 0);
  const retryAfterSeconds = Math.max(Math.ceil((resetAt - now) / 1000), 0);
  return {
    allowed: count <= limit,
    limit,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}

async function ensureMongoRateLimitIndex() {
  const collection = mongoose.connection.collection<MongoRateLimitCounter>('rate_limit_counters');
  if (!mongoRateLimitIndexPromise) {
    mongoRateLimitIndexPromise = collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'rate_limit_expires_at_ttl' }
    );
  }

  try {
    await mongoRateLimitIndexPromise;
  } catch (error) {
    mongoRateLimitIndexPromise = null;
    throw error;
  }
}

async function consumeWithMongo(input: RateLimitInput): Promise<RateLimitResult> {
  await connectDB();
  await ensureMongoRateLimitIndex();

  const now = new Date();
  const resetAt = new Date(now.getTime() + input.windowSeconds * 1000);
  const keyHashSecret = process.env.AUDIT_LOG_HASH_PEPPER || process.env.JWT_SECRET;
  if (!keyHashSecret) {
    throw new Error('A server-side hash secret is required for shared rate limiting.');
  }
  const counterId = createHmac('sha256', keyHashSecret)
    .update(`${input.namespace}\0${input.key}`)
    .digest('hex');
  const collection = mongoose.connection.collection<MongoRateLimitCounter>('rate_limit_counters');
  const isMissingOrExpired = {
    $or: [
      { $eq: [{ $type: '$expiresAt' }, 'missing'] },
      { $lte: ['$expiresAt', now] },
    ],
  };

  const counter = await collection.findOneAndUpdate(
    { _id: counterId },
    [
      {
        $set: {
          namespace: input.namespace,
          count: {
            $cond: [
              isMissingOrExpired,
              1,
              { $add: [{ $ifNull: ['$count', 0] }, 1] },
            ],
          },
          expiresAt: {
            $cond: [isMissingOrExpired, resetAt, '$expiresAt'],
          },
        },
      },
    ],
    { upsert: true, returnDocument: 'after' }
  );

  if (!counter || !(counter.expiresAt instanceof Date) || !Number.isFinite(counter.count)) {
    throw new Error('MongoDB returned invalid rate-limit counter data.');
  }

  return toRateLimitResult(counter.count, input.limit, counter.expiresAt.getTime(), now.getTime());
}

function consumeWithMemory(input: RateLimitInput): RateLimitResult {
  const now = Date.now();
  const key = `${input.namespace}:${input.key}`;
  const store = getMemoryStore();

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + input.windowSeconds * 1000;
    store.set(key, { count: 1, resetAt });
    return toRateLimitResult(1, input.limit, resetAt, now);
  }

  existing.count += 1;
  store.set(key, existing);
  return toRateLimitResult(existing.count, input.limit, existing.resetAt, now);
}

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  if (input.limit <= 0 || input.windowSeconds <= 0) {
    throw new Error('Rate limit configuration must use positive limit and windowSeconds values.');
  }

  const useSharedCounter = input.requireDistributed ?? process.env.NODE_ENV === 'production';
  if (useSharedCounter) {
    try {
      return await consumeWithMongo(input);
    } catch (error) {
      console.error('MongoDB-backed rate limiter unavailable:', {
        namespace: input.namespace,
        error: error instanceof Error ? error.message : 'Unknown MongoDB error',
      });
      throw new Error('Shared rate limiting is temporarily unavailable.');
    }
  }

  return consumeWithMemory(input);
}
