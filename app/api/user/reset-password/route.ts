import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  withSecurityHeaders,
} from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import connectDB from '@/utils/db';
import { consumeRateLimit } from '@/lib/rateLimit';
import {
  hashDocumentShareToken,
  isDocumentShareAccess,
  normalizeShareEmail,
} from '@/lib/document-sharing';
import Document from '@/models/Document';
import SessionModel from '@/models/Session';
import Users from '@/models/Users';

export const runtime = 'nodejs';

const ResetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(512).optional(),
  shareToken: z.string().trim().min(32).max(512).optional(),
  email: z.string().trim().email().max(320).optional(),
  newPassword: z.string().min(6).max(128),
}).refine((value) => Boolean(value.token || (value.shareToken && value.email)), {
  message: 'A reset or invite token is required',
});

type ShareClaimDocument = {
  sharedWith?: Array<{
    email?: unknown;
    access?: unknown;
    shareTokenHash?: unknown;
    revokedAt?: unknown;
  }>;
};

function isActiveDocumentShareClaim(entry: {
  email?: unknown;
  access?: unknown;
  shareTokenHash?: unknown;
  revokedAt?: unknown;
}, email: string, shareTokenHash: string): boolean {
  const entryEmail = normalizeShareEmail(entry.email);
  const entryAccess = isDocumentShareAccess(entry.access) ? entry.access : null;
  return (
    entryEmail === email &&
    entry.shareTokenHash === shareTokenHash &&
    (entry.revokedAt === null || entry.revokedAt === undefined) &&
    (entryAccess === 'can_send' || entryAccess === 'can_edit')
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

  const ipLimit = await consumeRateLimit({
    key: ipAddress,
    namespace: 'auth:reset-password:ip',
    limit: 30,
    windowSeconds: 15 * 60,
  });

  if (!ipLimit.allowed) {
    const response = NextResponse.json(
      { message: 'Too many reset attempts. Please try again later.' },
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

  const parsed = ResetPasswordSchema.safeParse(rawBody);
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

  try {
    await connectDB();

    const { token, shareToken, email, newPassword } = parsed.data;
    let user: { _id: unknown } | null = null;
    let updateFilter: Record<string, unknown> | null = null;
    let resetSource: 'password_reset' | 'document_share_invite' = 'password_reset';
    let claimedShareEmail: string | null = null;

    if (token) {
      // Hash the incoming raw token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find user by stored hashed token + expiry
      user = await Users.findOne({
        'passwordResetToken.token': hashedToken,
        'passwordResetToken.expires': { $gt: new Date() },
      });

      if (user) {
        updateFilter = {
          _id: user._id,
          'passwordResetToken.token': hashedToken,
          'passwordResetToken.expires': { $gt: new Date() },
        };
      }
    } else {
      resetSource = 'document_share_invite';
      const normalizedEmail = normalizeShareEmail(email);
      if (shareToken && normalizedEmail) {
        const shareTokenHash = hashDocumentShareToken(shareToken);
        const document = await Document.findOne({
          sharedWith: {
            $elemMatch: {
              email: normalizedEmail,
              shareTokenHash,
              access: { $in: ['can_send', 'can_edit'] },
            },
          },
        })
          .select('sharedWith')
          .lean<ShareClaimDocument | null>();

        const matchingShare = Array.isArray(document?.sharedWith)
          ? document.sharedWith.find((entry) =>
              isActiveDocumentShareClaim(entry, normalizedEmail, shareTokenHash)
            )
          : null;

        if (matchingShare) {
          user = await Users.findOne({
            email: normalizedEmail,
            pendingAccount: true,
            isDeleted: { $ne: true },
          });
          if (user) {
            updateFilter = {
              _id: user._id,
              email: normalizedEmail,
              pendingAccount: true,
            };
            claimedShareEmail = normalizedEmail;
          }
        } else {
          user = null;
        }
      } else {
        user = null;
      }
    }

    if (!user || !updateFilter) {
      await writeAuditEvent({
        action: 'auth.reset_password.failed',
        ipAddress,
        userAgent,
        metadata: {
          reason: 'invalid_or_expired_token',
          source: resetSource,
        },
      });

      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Invalid or expired token' }, { status: 400 })
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const updateResult = await Users.updateOne(
      updateFilter,
      {
        $set: {
          passwordHash: hashedPassword,
          password: hashedPassword,
          failedLoginAttempts: 0,
          lockUntil: null,
          pendingAccount: false,
          'pendingInvite.claimedAt': new Date(),
          passwordResetToken: { token: null, expires: null },
        },
        $inc: {
          tokenVersion: 1,
        },
      }
    ).exec();

    if (updateResult.modifiedCount !== 1) {
      await writeAuditEvent({
        action: 'auth.reset_password.failed',
        ipAddress,
        userAgent,
        metadata: {
          userId: String(user._id),
          reason: 'stale_or_already_used_token',
        },
      });

      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Invalid or expired token' }, { status: 400 })
      );
    }

    await SessionModel.updateMany({ userId: user._id }, { $set: { revoked: true } }).exec();

    if (claimedShareEmail) {
      await Document.updateMany(
        { 'sharedWith.email': claimedShareEmail },
        {
          $set: {
            'sharedWith.$[share].accountStatus': 'registered',
            'sharedWith.$[share].recipientUserId': String(user._id),
          },
        },
        { arrayFilters: [{ 'share.email': claimedShareEmail }] }
      ).exec();
    }

    await writeAuditEvent({
      userId: user._id,
      action: 'auth.reset_password.success',
      ipAddress,
      userAgent,
      metadata: {
        sessionRevoked: true,
        source: resetSource,
      },
    });

    return withSecurityHeaders(req, NextResponse.json({ success: true }, { status: 200 }));
  } catch (error) {
    console.error('Password reset error:', error);

    await writeAuditEvent({
      action: 'auth.reset_password.failed',
      ipAddress,
      userAgent,
      metadata: {
        reason: error instanceof Error ? error.message : 'unknown_error',
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
    );
  }
}
