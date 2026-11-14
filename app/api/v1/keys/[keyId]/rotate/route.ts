import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';

import { getAuthContext } from '@/lib/auth-context';
import { API_KEY_MAX_REQUESTS_PER_MINUTE, API_KEY_SCOPES, createApiKeySecret } from '@/lib/api-key';
import { serializeApiKey } from '@/lib/api-key-summary';
import { isSecureRequest, validateCsrfToken } from '@/lib/auth';
import { normalizeAllowedIpCidrs } from '@/lib/ip-allowlist';
import { isAdminRole } from '@/lib/role-utils';
import ApiKeyModel from '@/models/ApiKey';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const RotateKeySchema = z.object({
  // Keep the retiring key valid for a short, bounded overlap so callers can
  // deploy the replacement without a credentials outage.
  overlapHours: z.number().int().min(1).max(24 * 30).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  allowedIpCidrs: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  maxRequestsPerMinute: z.number().int().min(1).max(API_KEY_MAX_REQUESTS_PER_MINUTE).optional(),
  rotationIntervalDays: z.number().int().min(1).max(365).nullable().optional(),
}).strict();

function daysFromNow(days: number, now: Date): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });

  const { keyId } = await params;
  if (!mongoose.Types.ObjectId.isValid(keyId)) return NextResponse.json({ message: 'Invalid API key ID.' }, { status: 400 });
  const parsed = RotateKeySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: 'Validation failed.' }, { status: 400 });
  const suppliedCidrs = parsed.data.allowedIpCidrs;
  if (suppliedCidrs) {
    const normalized = normalizeAllowedIpCidrs(suppliedCidrs);
    if (!normalized) {
      return NextResponse.json({ message: 'IP allowlists must contain up to 20 valid IPv4 or IPv6 addresses/CIDRs.' }, { status: 400 });
    }
  }

  await connectDB();
  const now = new Date();
  const source = await ApiKeyModel.findOne({
    _id: keyId,
    orgId: context.orgId,
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .select('name scopes expiresAt allowedIpCidrs maxRequestsPerMinute rotationIntervalDays')
    .lean<{
      _id: unknown;
      name: string;
      scopes?: string[];
      expiresAt?: Date | null;
      allowedIpCidrs?: string[];
      maxRequestsPerMinute?: number;
      rotationIntervalDays?: number | null;
    } | null>();
  if (!source) return NextResponse.json({ message: 'Active API key not found.' }, { status: 404 });

  // Claim the source key first. This prevents two administrators from both
  // minting a replacement for the same key during a concurrent rotation.
  const overlapHours = parsed.data.overlapHours ?? 24;
  const requestedRetirement = new Date(now.getTime() + overlapHours * 60 * 60 * 1000);
  const expiresAt = source.expiresAt && source.expiresAt < requestedRetirement
    ? source.expiresAt
    : requestedRetirement;
  const claim = await ApiKeyModel.updateOne(
    {
      _id: source._id,
      orgId: context.orgId,
      revokedAt: null,
      $or: [{ rotatedAt: null }, { rotatedAt: { $exists: false } }],
    },
    { $set: { expiresAt, rotatedAt: now } }
  ).exec();
  if (claim.matchedCount === 0) {
    return NextResponse.json({ message: 'This API key has already been rotated. Use the replacement key instead.' }, { status: 409 });
  }

  const allowedIpCidrs = suppliedCidrs
    ? normalizeAllowedIpCidrs(suppliedCidrs)!
    : source.allowedIpCidrs || [];
  const rotationIntervalDays = parsed.data.rotationIntervalDays === undefined
    ? source.rotationIntervalDays ?? null
    : parsed.data.rotationIntervalDays;
  const replacementExpiresAt = parsed.data.expiresInDays === undefined
    ? source.expiresAt ?? null
    : parsed.data.expiresInDays === null
      ? null
      : daysFromNow(parsed.data.expiresInDays, now);
  const defaultName = `${source.name.slice(0, 108)} (rotated)`;
  const generated = createApiKeySecret();

  try {
    const replacement = await ApiKeyModel.create({
      orgId: context.orgId,
      createdBy: context.userId,
      name: parsed.data.name || defaultName,
      prefix: generated.prefix,
      secretHash: generated.secretHash,
      scopes: parsed.data.scopes || source.scopes || ['documents:read'],
      expiresAt: replacementExpiresAt,
      allowedIpCidrs,
      maxRequestsPerMinute: parsed.data.maxRequestsPerMinute ?? source.maxRequestsPerMinute ?? API_KEY_MAX_REQUESTS_PER_MINUTE,
      rotationIntervalDays,
      rotationDueAt: rotationIntervalDays ? daysFromNow(rotationIntervalDays, now) : null,
      rotatedFrom: source._id,
    });
    return NextResponse.json({
      key: serializeApiKey(replacement.toObject()),
      secret: generated.secret,
      warning: `Store this replacement secret now. The previous key expires ${expiresAt.toISOString()}.`,
    }, { status: 201 });
  } catch (error) {
    // The old key remains temporarily valid, so undoing the claim makes a
    // recoverable database failure retryable without weakening its expiry.
    await ApiKeyModel.updateOne(
      { _id: source._id, rotatedAt: now },
      { $set: { rotatedAt: null, expiresAt: source.expiresAt ?? null } }
    ).exec().catch(() => undefined);
    throw error;
  }
}
