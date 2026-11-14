import { createHmac, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getAuthSession } from '@/lib/api-helpers';
import UserModel from '@/models/Users';

const HANDOFF_TTL_SECONDS = 60;

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function secret(): string {
  const value = process.env.SUPPORT_SSO_SECRET?.trim();
  if (!value || value.length < 32) throw new Error('SUPPORT_SSO_SECRET is not configured');
  return value;
}

type SupportSsoPurpose = 'customer' | 'staff';

function handoffPurpose(request: NextRequest): SupportSsoPurpose {
  return request.nextUrl.searchParams.get('purpose') === 'staff' ? 'staff' : 'customer';
}

function supportReturnTo(request: NextRequest, purpose: SupportSsoPurpose): string {
  const fallback = purpose === 'staff' ? '/desk' : '/create';
  const value = request.nextUrl.searchParams.get('returnTo')?.trim() || fallback;
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback;
}

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const purpose = handoffPurpose(request);
  const returnTo = supportReturnTo(request, purpose);
  const carriesReturnTo = request.nextUrl.searchParams.has('returnTo');
  const userId = await getAuthSession(request);
  if (!userId) {
    const callbackPath = request.nextUrl.pathname === '/api/support/sso/complete'
      ? '/api/support/sso/complete'
      : '/api/support/sso';
    const callbackUrl = new URL(callbackPath, request.url);
    if (purpose === 'staff') callbackUrl.searchParams.set('purpose', 'staff');
    if (carriesReturnTo) callbackUrl.searchParams.set('returnTo', returnTo);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', callbackUrl.pathname + callbackUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const user = await UserModel.findById(userId).select('email firstName lastName').lean<{
    email: string;
    firstName?: string;
    lastName?: string;
  } | null>();
  if (!user?.email) return NextResponse.redirect(new URL('/login', request.url));

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'signworkflow',
    aud: 'signworkflow-support',
    sub: userId,
    email: user.email.trim().toLowerCase(),
    purpose,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    iat: issuedAt,
    exp: issuedAt + HANDOFF_TTL_SECONDS,
    jti: randomBytes(18).toString('base64url'),
  };
  const encoded = base64url(JSON.stringify(payload));
  const token = `${encoded}.${sign(encoded, secret())}`;
  const supportOrigin = process.env.SUPPORT_PUBLIC_ORIGIN?.trim() ||
    (process.env.NODE_ENV === 'production' ? 'https://support.signworkflow.com' : 'http://127.0.0.1:3100');
  const destination = new URL('/sso/consume', supportOrigin);
  destination.searchParams.set('token', token);
  if (purpose === 'staff') destination.searchParams.set('purpose', 'staff');
  destination.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(destination);
}
