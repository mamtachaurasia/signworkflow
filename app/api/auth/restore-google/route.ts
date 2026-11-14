import { OAuth2Client } from 'google-auth-library';
import { NextRequest, NextResponse } from 'next/server';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  withSecurityHeaders,
} from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import {
  applyAuthSessionCookies,
  issueSessionForUser,
  resolveAuthOrgState,
  toClientAuthUser,
} from '@/lib/auth-session';
import { AUTH_RESTORE_GOOGLE_USER_SELECT } from '@/lib/auth-user-select';
import connectDB from '@/utils/db';
import { isJwtConfigurationError } from '@/lib/jwt';
import { isMfaConfigurationError, verifyTotpCode } from '@/lib/mfa';
import { consumeRateLimit } from '@/lib/rateLimit';
import { getDeletionWindowState } from '@/lib/user-deletion';
import { sendAccountRestoredEmail } from '@/lib/email';
import MembershipModel from '@/models/Membership';
import UserModel from '@/models/Users';

export const runtime = 'nodejs';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

function isGoogleTokenValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("can't parse token envelope") ||
    message.includes('wrong number of segments') ||
    message.includes('jwt malformed') ||
    message.includes('invalid token') ||
    message.includes('invalid signature') ||
    message.includes('token used too late') ||
    message.includes('no pem found')
  );
}

export async function OPTIONS(req: NextRequest) {
  return withSecurityHeaders(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authentication endpoints.' }, { status: 400 })
    );
  }

  const rateLimit = await consumeRateLimit({
    key: ipAddress,
    namespace: 'auth:restore-google:ip',
    limit: 20,
    windowSeconds: 15 * 60,
  });

  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { message: 'Too many restore attempts. Please try again later.' },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return withSecurityHeaders(req, response);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 }));
  }

  const parsedBody = body as { token?: unknown; totpCode?: unknown };
  const idToken = parsedBody.token;
  if (typeof idToken !== 'string' || !idToken.trim()) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Token is required' }, { status: 400 }));
  }

  const rawTotpCode = parsedBody.totpCode;
  if (rawTotpCode !== undefined && rawTotpCode !== null && typeof rawTotpCode !== 'string') {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid MFA code format' }, { status: 400 })
    );
  }
  const totpCode = typeof rawTotpCode === 'string' ? rawTotpCode.trim() : '';
  if (totpCode && !/^\d{6}$/.test(totpCode)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid MFA code format' }, { status: 400 })
    );
  }

  const audience = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!audience) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Google auth is not configured' }, { status: 500 })
    );
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || payload.email_verified !== true) {
      return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid Google token' }, { status: 401 }));
    }

    await connectDB();

    const normalizedEmail = payload.email.toLowerCase();
    const user = await UserModel.findOne({ email: normalizedEmail })
      .select(AUTH_RESTORE_GOOGLE_USER_SELECT)
      .exec();

    if (!user || user.isDeleted !== true) {
      return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid credentials' }, { status: 401 }));
    }

    const windowState = getDeletionWindowState(user);
    if (!windowState.canRestore) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          { message: 'Account restoration window has expired.', reason: 'restore_expired' },
          { status: 410 }
        )
      );
    }

    if (user.mfaEnabled) {
      if (!totpCode) {
        await writeAuditEvent({
          userId: String(user._id),
          action: 'auth.restore.failed',
          ipAddress,
          userAgent,
          metadata: { reason: 'mfa_required', provider: 'google' },
        });
        return withSecurityHeaders(
          req,
          NextResponse.json(
            { message: 'MFA code is required for Google restore.', mfaRequired: true },
            { status: 200 }
          )
        );
      }

      if (!user.mfaSecret || !verifyTotpCode(user.mfaSecret, totpCode)) {
        await writeAuditEvent({
          userId: String(user._id),
          action: 'auth.restore.failed',
          ipAddress,
          userAgent,
          metadata: { reason: 'invalid_mfa_code', provider: 'google' },
        });

        return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid MFA code' }, { status: 401 }));
      }
    }

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          isDeleted: false,
          isActive: true,
          deletedAt: null,
          deletionScheduledAt: null,
          purgedAt: null,
          failedLoginAttempts: 0,
          lockUntil: null,
        },
        $inc: {
          tokenVersion: 1,
        },
      }
    ).exec();

    await MembershipModel.updateMany(
      { userId: user._id, status: 'disabled', disabledReason: 'user_deleted' },
      { $set: { status: 'active', disabledReason: null } }
    ).exec();

    const authOrgState = await resolveAuthOrgState(user, { bootstrapIfMissing: true });

    const issued = await issueSessionForUser({
      user: {
        _id: user._id,
        email: user.email,
        role: authOrgState.effectiveRole,
        tokenVersion: user.tokenVersion + 1,
        firstName: user.firstName,
        lastName: user.lastName,
        picture: user.picture,
      },
      deviceInfo: 'google-oauth',
      ipAddress,
      userAgent,
    });

    await writeAuditEvent({
      userId: String(user._id),
      action: 'auth.account.restored',
      ipAddress,
      userAgent,
      metadata: {
        provider: 'google',
        sessionId: issued.sessionId,
      },
    });

    try {
      await sendAccountRestoredEmail({
        toEmail: user.email,
        provider: 'google',
        ipAddress,
        userAgent,
        timestamp: new Date(),
      });
    } catch (emailError) {
      console.error('Google account restored email failed:', emailError);
    }

    const response = NextResponse.json(
      {
        success: true,
        accessToken: issued.accessToken,
        token: issued.accessToken,
        accessTokenTtl: issued.accessTokenTtl,
        user: toClientAuthUser(issued.safeUser, authOrgState),
      },
      { status: 200 }
    );

    applyAuthSessionCookies(response, issued.refreshToken, issued.refreshExpiresAt);

    return withSecurityHeaders(req, response);
  } catch (err) {
    if (isJwtConfigurationError(err)) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          { message: 'Authentication service is misconfigured. Missing or invalid JWT key material.' },
          { status: 500 }
        )
      );
    }

    if (isMfaConfigurationError(err)) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          { message: 'MFA service is misconfigured. Please contact support.' },
          { status: 500 }
        )
      );
    }

    if (isGoogleTokenValidationError(err)) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Invalid Google token' }, { status: 401 })
      );
    }

    console.error('Google restore error', err);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Authentication failed' }, { status: 500 })
    );
  }
}
