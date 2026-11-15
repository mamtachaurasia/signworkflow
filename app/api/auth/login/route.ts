import bcrypt from 'bcryptjs';
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
import { LoginBodySchema } from '@/lib/auth-schemas';
import { AUTH_LOGIN_USER_SELECT } from '@/lib/auth-user-select';
import connectDB from '@/utils/db';
import {
  isJwtConfigurationError,
} from '@/lib/jwt';
import { sendLoginAlertEmail } from '@/lib/email';
import { isMfaConfigurationError, verifyTotpCode } from '@/lib/mfa';
import { consumeRateLimit } from '@/lib/rateLimit';
import { isLocalE2EEnabled } from '@/lib/e2e-env';
import { isUserAllowed } from '@/lib/user-status';
import { normalizeUserSettings } from '@/lib/user-settings';
import SessionModel from '@/models/Session';
import UserModel from '@/models/Users';
import { getDeletionWindowState } from '@/lib/user-deletion';

export const runtime = 'nodejs';

const MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS || 5);
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES || 15);

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
    namespace: 'auth:login:ip',
    limit: 50,
    windowSeconds: 15 * 60,
  });

  if (!ipLimit.allowed) {
    const response = NextResponse.json(
      { message: 'Too many login attempts. Please try again later.' },
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

  const parsed = LoginBodySchema.safeParse(rawBody);
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
    namespace: 'auth:login:email',
    limit: 10,
    windowSeconds: 15 * 60,
  });

  if (!emailLimit.allowed) {
    const response = NextResponse.json(
      { message: 'Too many login attempts for this account. Please try again later.' },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(emailLimit.retryAfterSeconds));
    return withSecurityHeaders(req, response);
  }

  try {
    await connectDB();

    const user = await UserModel.findOne({ email: normalizedEmail })
      .select(AUTH_LOGIN_USER_SELECT)
      .exec();

    if (!user) {
      await writeAuditEvent({
        action: 'auth.login.failed',
        ipAddress,
        userAgent,
        metadata: { reason: 'invalid_credentials', email: normalizedEmail },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
      );
    }

    if (user.isDeleted) {
      const windowState = getDeletionWindowState(user);
      await writeAuditEvent({
        userId: String(user._id),
        action: 'auth.login.blocked',
        ipAddress,
        userAgent,
        metadata: {
          reason: 'account_deleted',
          canRestore: windowState.canRestore,
          deletionScheduledAt: windowState.deletionScheduledAt?.toISOString(),
        },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: 'Account is deleted.',
            reason: 'account_deleted',
            canRestore: windowState.canRestore,
            deletionScheduledAt: windowState.deletionScheduledAt,
          },
          { status: 403 }
        )
      );
    }

    if (!isUserAllowed(user)) {
      await writeAuditEvent({
        userId: String(user._id),
        action: 'auth.login.blocked',
        ipAddress,
        userAgent,
        metadata: { reason: 'account_disabled_or_deleted' },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Account is disabled' }, { status: 403 })
      );
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      await writeAuditEvent({
        userId: String(user._id),
        action: 'auth.login.blocked',
        ipAddress,
        userAgent,
        metadata: {
          reason: 'account_locked',
          lockUntil: user.lockUntil.toISOString(),
        },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: 'Account is temporarily locked due to failed login attempts',
            lockUntil: user.lockUntil,
          },
          { status: 423 }
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
      const nextFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      const update: Record<string, unknown> = { failedLoginAttempts: nextFailedAttempts };

      if (nextFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        update.lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        update.failedLoginAttempts = 0;
      }

      await UserModel.updateOne({ _id: user._id }, { $set: update }).exec();

      await writeAuditEvent({
        userId: String(user._id),
        action: 'auth.login.failed',
        ipAddress,
        userAgent,
        metadata: { reason: 'invalid_credentials', failedAttempts: nextFailedAttempts },
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
          action: 'auth.login.failed',
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

    const authOrgState = await resolveAuthOrgState(user, { bootstrapIfMissing: true });

    const issued = await issueSessionForUser({
      user: {
        _id: user._id,
        email: user.email,
        role: authOrgState.effectiveRole,
        tokenVersion: user.tokenVersion,
        firstName: user.firstName,
        lastName: user.lastName,
        picture: user.picture,
      },
      deviceInfo: deviceInfo || '',
      ipAddress,
      userAgent,
    });

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginAttempts: 0,
          lockUntil: null,
        },
      }
    ).exec();

    await writeAuditEvent({
      userId: String(user._id),
      action: 'auth.login.success',
      ipAddress,
      userAgent,
      metadata: {
        sessionId: issued.sessionId,
        mfaUsed: Boolean(user.mfaEnabled),
      },
    });

    const userSettings = normalizeUserSettings(user.settings);
    if (userSettings.loginAlerts && !isLocalE2EEnabled()) {
      try {
        const deviceKey = deviceInfo || '';
        const userAgentKey = userAgent || '';
        const matchFilters: Record<string, string>[] = [];
        if (deviceKey) {
          matchFilters.push({ deviceInfo: deviceKey });
        }
        if (userAgentKey) {
          matchFilters.push({ userAgent: userAgentKey });
        }

        const hasKnownDevice =
          matchFilters.length > 0
            ? await SessionModel.exists({
                userId: user._id,
                revoked: false,
                _id: { $ne: issued.sessionId },
                $or: matchFilters,
              })
            : false;

        if (!hasKnownDevice) {
          await sendLoginAlertEmail({
            toEmail: user.email,
            ipAddress,
            userAgent: userAgent || undefined,
            deviceInfo: deviceInfo || undefined,
            timestamp: new Date(),
          });
        }
      } catch (err) {
        console.error('Login alert email failed:', err);
      }
    }

    const response = NextResponse.json(
      {
        success: true,
        accessToken: issued.accessToken,
        // Legacy compatibility field; frontend should use accessToken in memory only.
        token: issued.accessToken,
        accessTokenTtl: issued.accessTokenTtl,
        user: toClientAuthUser(issued.safeUser, authOrgState),
      },
      { status: 200 }
    );

    applyAuthSessionCookies(response, issued.refreshToken, issued.refreshExpiresAt, req);

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

    console.error('Login route error:', error);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    );
  }
}
