import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthContext } from '@/lib/auth-context';
import { API_KEY_MAX_REQUESTS_PER_MINUTE, createApiKeySecret, API_KEY_SCOPES } from '@/lib/api-key';
import { serializeApiKey, type ApiKeySummary } from '@/lib/api-key-summary';
import { isSecureRequest, validateCsrfToken } from '@/lib/auth';
import { normalizeAllowedIpCidrs } from '@/lib/ip-allowlist';
import { isAdminRole } from '@/lib/role-utils';
import ApiKeyModel from '@/models/ApiKey';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const CreateKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  allowedIpCidrs: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  maxRequestsPerMinute: z.number().int().min(1).max(API_KEY_MAX_REQUESTS_PER_MINUTE).optional(),
  rotationIntervalDays: z.number().int().min(1).max(365).optional(),
}).strict();

function daysFromNow(days: number, now: Date): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  await connectDB();
  const keys = await ApiKeyModel.find({ orgId: context.orgId, revokedAt: null })
    .select('name prefix scopes lastUsedAt createdAt expiresAt allowedIpCidrs maxRequestsPerMinute rotationIntervalDays rotationDueAt rotatedAt rotatedFrom')
    .sort({ createdAt: -1 })
    .lean<ApiKeySummary[]>();
  return NextResponse.json({
    keys: keys.map(serializeApiKey),
  });
}

export async function POST(req: NextRequest) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const parsed = CreateKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Validation failed' }, { status: 400 });
  const allowedIpCidrs = normalizeAllowedIpCidrs(parsed.data.allowedIpCidrs || []);
  if (!allowedIpCidrs) {
    return NextResponse.json({ message: 'IP allowlists must contain up to 20 valid IPv4 or IPv6 addresses/CIDRs.' }, { status: 400 });
  }
  const generated = createApiKeySecret();
  await connectDB();
  const now = new Date();
  const rotationIntervalDays = parsed.data.rotationIntervalDays ?? null;
  const record = await ApiKeyModel.create({
    orgId: context.orgId,
    createdBy: context.userId,
    name: parsed.data.name,
    prefix: generated.prefix,
    secretHash: generated.secretHash,
    scopes: parsed.data.scopes || ['documents:read'],
    expiresAt: parsed.data.expiresInDays ? daysFromNow(parsed.data.expiresInDays, now) : null,
    allowedIpCidrs,
    maxRequestsPerMinute: parsed.data.maxRequestsPerMinute ?? API_KEY_MAX_REQUESTS_PER_MINUTE,
    rotationIntervalDays,
    rotationDueAt: rotationIntervalDays ? daysFromNow(rotationIntervalDays, now) : null,
  });
  return NextResponse.json({
    key: serializeApiKey(record.toObject()),
    secret: generated.secret,
    warning: 'Store this secret now. It will not be shown again.',
  }, { status: 201 });
}
