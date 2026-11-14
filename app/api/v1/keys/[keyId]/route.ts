import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { getAuthContext } from '@/lib/auth-context';
import { API_KEY_MAX_REQUESTS_PER_MINUTE, API_KEY_SCOPES } from '@/lib/api-key';
import { isSecureRequest, validateCsrfToken } from '@/lib/auth';
import { normalizeAllowedIpCidrs } from '@/lib/ip-allowlist';
import { isAdminRole } from '@/lib/role-utils';
import ApiKeyModel from '@/models/ApiKey';
import connectDB from '@/utils/db';
import { z } from 'zod';

export const runtime = 'nodejs';

const UpdateKeySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  allowedIpCidrs: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  maxRequestsPerMinute: z.number().int().min(1).max(API_KEY_MAX_REQUESTS_PER_MINUTE).optional(),
  rotationIntervalDays: z.number().int().min(1).max(365).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

function daysFromNow(days: number, now: Date): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function getAdminContext(req: NextRequest) {
  if (!isSecureRequest(req)) return { response: NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 }) };
  if (!validateCsrfToken(req)) return { response: NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 }) };
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return { response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) };
  if (!isAdminRole(context.orgRole)) return { response: NextResponse.json({ message: 'Admin access required.' }, { status: 403 }) };
  return { context };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const auth = await getAdminContext(req);
  if ('response' in auth) return auth.response;
  const { keyId } = await params;
  if (!mongoose.Types.ObjectId.isValid(keyId)) return NextResponse.json({ message: 'Invalid API key ID.' }, { status: 400 });
  const parsed = UpdateKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Validation failed.' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.scopes !== undefined) update.scopes = parsed.data.scopes;
  if (parsed.data.maxRequestsPerMinute !== undefined) update.maxRequestsPerMinute = parsed.data.maxRequestsPerMinute;
  if (parsed.data.allowedIpCidrs !== undefined) {
    const allowedIpCidrs = normalizeAllowedIpCidrs(parsed.data.allowedIpCidrs);
    if (!allowedIpCidrs) {
      return NextResponse.json({ message: 'IP allowlists must contain up to 20 valid IPv4 or IPv6 addresses/CIDRs.' }, { status: 400 });
    }
    update.allowedIpCidrs = allowedIpCidrs;
  }

  const now = new Date();
  if (parsed.data.expiresInDays !== undefined) {
    update.expiresAt = parsed.data.expiresInDays === null ? null : daysFromNow(parsed.data.expiresInDays, now);
  }
  if (parsed.data.rotationIntervalDays !== undefined) {
    update.rotationIntervalDays = parsed.data.rotationIntervalDays;
    update.rotationDueAt = parsed.data.rotationIntervalDays === null ? null : daysFromNow(parsed.data.rotationIntervalDays, now);
  }

  await connectDB();
  // Check rotation in the atomic update so even a stale editor cannot extend
  // or remove the retirement deadline after a concurrent rotation claims it.
  const result = await ApiKeyModel.updateOne(
    { _id: keyId, orgId: auth.context.orgId, revokedAt: null, rotatedAt: null },
    { $set: update }
  ).exec();
  if (result.matchedCount === 0) return NextResponse.json({ message: 'API key not found.' }, { status: 404 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const auth = await getAdminContext(req);
  if ('response' in auth) return auth.response;
  const { keyId } = await params;
  if (!mongoose.Types.ObjectId.isValid(keyId)) return NextResponse.json({ message: 'Invalid API key ID.' }, { status: 400 });
  await connectDB();
  const result = await ApiKeyModel.updateOne(
    { _id: keyId, orgId: auth.context.orgId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  ).exec();
  if (result.matchedCount === 0) return NextResponse.json({ message: 'API key not found.' }, { status: 404 });
  return NextResponse.json({ revoked: true });
}
