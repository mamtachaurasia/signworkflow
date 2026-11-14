import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';

import { getClientIp } from '@/lib/auth';
import { isIpAllowedByCidrs } from '@/lib/ip-allowlist';
import ApiKeyModel from '@/models/ApiKey';
import { consumeRateLimit, type RateLimitResult } from '@/lib/rateLimit';
import connectDB from '@/utils/db';

const API_KEY_PREFIX = 'sw_live_';
export const API_KEY_MAX_REQUESTS_PER_MINUTE = 600;

export const API_KEY_SCOPES = ['documents:read', 'documents:write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

function hashSecret(secret: string): string {
  const pepper = process.env.API_KEY_PEPPER || '';
  return createHash('sha256').update(`${secret}:${pepper}`).digest('hex');
}

export function createApiKeySecret(): { secret: string; prefix: string; secretHash: string } {
  const value = randomBytes(32).toString('base64url');
  const secret = `${API_KEY_PREFIX}${value}`;
  return { secret, prefix: secret.slice(0, 16), secretHash: hashSecret(secret) };
}

export async function getApiKeyContext(req: NextRequest): Promise<{
  keyId: string;
  orgId: string;
  userId: string;
  scopes: string[];
  rateLimit: RateLimitResult;
} | null> {
  const header = req.headers.get('x-api-key') || '';
  const authorization = req.headers.get('authorization') || '';
  const candidate = header.trim() || (authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '');
  if (!candidate.startsWith(API_KEY_PREFIX)) return null;

  await connectDB();
  const record = await ApiKeyModel.findOne({
    secretHash: hashSecret(candidate),
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .select('+secretHash orgId createdBy scopes allowedIpCidrs maxRequestsPerMinute')
    .lean<{
      _id: unknown;
      orgId: unknown;
      createdBy: unknown;
      scopes?: string[];
      allowedIpCidrs?: string[];
      maxRequestsPerMinute?: number;
    } | null>();
  if (!record) return null;

  if (!isIpAllowedByCidrs(getClientIp(req), record.allowedIpCidrs)) return null;

  const configuredLimit = Math.floor(Number(record.maxRequestsPerMinute));
  const limit = Number.isFinite(configuredLimit) && configuredLimit >= 1
    ? Math.min(configuredLimit, API_KEY_MAX_REQUESTS_PER_MINUTE)
    : API_KEY_MAX_REQUESTS_PER_MINUTE;

  const rateLimit = await consumeRateLimit({
    key: String(record._id),
    namespace: 'public-api:v1',
    limit,
    windowSeconds: 60,
  });
  void ApiKeyModel.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } }).exec();
  return { keyId: String(record._id), orgId: String(record.orgId), userId: String(record.createdBy), scopes: record.scopes || [], rateLimit };
}

export function getApiRateLimitResponse(apiKey: { rateLimit: RateLimitResult }): Response | null {
  if (apiKey.rateLimit.allowed) return null;
  return Response.json(
    { error: 'rate_limit_exceeded', retryAfterSeconds: apiKey.rateLimit.retryAfterSeconds },
    {
      status: 429,
      headers: {
        'Retry-After': String(apiKey.rateLimit.retryAfterSeconds),
        'X-RateLimit-Limit': String(apiKey.rateLimit.limit),
        'X-RateLimit-Remaining': String(apiKey.rateLimit.remaining),
        'X-RateLimit-Reset': String(Math.ceil(apiKey.rateLimit.resetAt / 1000)),
      },
    }
  );
}
