import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
import { AUTH_RESTORE_USER_SELECT } from '@/lib/auth-user-select';
import connectDB from '@/utils/db';
import { isJwtConfigurationError } from '@/lib/jwt';
import { isMfaConfigurationError, verifyTotpCode } from '@/lib/mfa';
import { consumeRateLimit } from '@/lib/rateLimit';
import { getDeletionWindowState } from '@/lib/user-deletion';
import { sendAccountRestoredEmail } from '@/lib/email';
import MembershipModel from '@/models/Membership';
import UserModel from '@/models/Users';

export const runtime = 'nodejs';

const RestoreSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(6).max(128),
  totpCode: z.string().trim().regex(/^\d{6}$/).optional(),
  deviceInfo: z.string().trim().max(200).optional(),
});

export async function OPTIONS(req: NextRequest) {
  return withSecurityHeaders(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        { message: 'HTTPS is required for authentication endpoints.' },
        { status: 400 }
      )
    );
  }

  const ipLimit = await consumeRateLimit({
    key: ipAddress,
    namespace: 'auth:restore:ip',
    limit: 20,
    windowSeconds: 15 * 60,
  });

  if (!ipLimit.allowed) {
    const response = NextResponse.json(
      { message: 'Too many restore attempts. Please try again later.' },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(ipLimit.retryAfterSeconds));
    return withSecurityHeaders(req, response);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
    );
  }

  const parsed = RestoreSchema.safeParse(rawBody);
  if (!parsed.success) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Validation failed',
          errors: parsed.error.issues.map((issue: { message: string }) => issue.message),
        },
        { status: 400 }
      )
    );
  }

  const { email, password, totpCode, deviceInfo } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const emailLimit = await consumeRateLimit({
    key: normalizedEmail,
    namespace: 'auth:restore:email',
    limit: 8,
    windowSeconds: 15 * 60,
  });

  if (!emailLimit.allowed) {
    const response = NextResponse.json(
      { message: 'Too many restore attempts for this account. Please try again later.' },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(emailLimit.retryAfterSeconds));
    return withSecurityHeaders(req, response);
  }

  try {
    await connectDB();

    const user = await UserModel.findOne({ email: normalizedEmail })
      .select(AUTH_RESTORE_USER_SELECT)
      .exec();

    if (!user || user.isDeleted !== true) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
      );
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

    const passwordHash = user.passwordHash || user.password;
    if (!passwordHash) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
      );
    }

    const isPasswordMatch = await bcrypt.compare(password, passwordHash);
    if (!isPasswordMatch) {
      await writeAuditEvent({
        userId: String(user._id),
        action: 'auth.restore.failed',
        ipAddress,
        userAgent,
        metadata: { reason: 'invalid_credentials' },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
      );
    }

    if (user.mfaEnabled) {
      if (!totpCode) {
        return withSecurityHeaders(
          req,
          NextResponse.json(
            {
              success: false,
              mfaRequired: true,
              message: 'MFA code is required',
            },
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
          metadata: { reason: 'invalid_mfa_code' },
        });
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Invalid MFA code' }, { status: 401 })
        );
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
      deviceInfo: deviceInfo || '',
      ipAddress,
      userAgent,
    });

    await writeAuditEvent({
      userId: String(user._id),
      action: 'auth.account.restored',
      ipAddress,
      userAgent,
      metadata: {
        sessionId: issued.sessionId,
      },
    });

    try {
      await sendAccountRestoredEmail({
        toEmail: user.email,
        provider: 'password',
        ipAddress,
        userAgent,
        timestamp: new Date(),
      });
    } catch (emailError) {
      console.error('Account restored email failed:', emailError);
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
  } catch (error) {
    if (isJwtConfigurationError(error)) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          { message: 'Authentication service is misconfigured. Missing or invalid JWT key material.' },
          { status: 500 }
        )
      );
    }

    if (isMfaConfigurationError(error)) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          { message: 'MFA service is misconfigured. Please contact support.' },
          { status: 500 }
        )
      );
    }

    console.error('Restore route error:', error);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    );
  }
}
