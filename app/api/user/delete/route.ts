import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import { clearAllAuthCookies, softDeleteUserAndRevokeSessions } from '@/lib/auth-session';
import connectDB from '@/utils/db';
import { authenticateRequest, enforceMfaForSensitiveAction } from '@/middleware/authMiddleware';
import UserModel from '@/models/Users';
import MembershipModel from '@/models/Membership';
import OrganizationModel from '@/models/Organization';
import DocumentModel from '@/models/Document';
import { sendAccountDeletionScheduledEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';

export const runtime = 'nodejs';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

const DeleteAccountSchema = z.object({
  closeSoloOwnedWorkspaces: z.boolean().optional(),
  confirmation: z.string().trim().min(1).max(320),
  password: z.string().max(128).optional(),
  googleIdToken: z.string().trim().min(1).optional(),
  mfaCode: z.string().trim().regex(/^\d{6}$/).optional(),
});

async function verifyGoogleIdentityForEmail(idToken: string, expectedEmail: string): Promise<boolean> {
  const audience = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!audience) {
    return false;
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience,
  });
  const payload = ticket.getPayload();
  return Boolean(
    payload?.email &&
      payload.email_verified === true &&
      payload.email.toLowerCase() === expectedEmail.toLowerCase()
  );
}

export async function OPTIONS(req: NextRequest) {
  return withSecurityHeaders(req, new NextResponse(null, { status: 204 }));
}

export async function DELETE(req: NextRequest) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authentication endpoints.' }, { status: 400 })
    );
  }

  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed', reason: 'csrf_mismatch' }, { status: 403 })
    );
  }

  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return withSecurityHeaders(req, auth.response);
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = DeleteAccountSchema.safeParse(rawBody);
  if (!parsed.success) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Validation failed',
          errors: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      )
    );
  }

  const closeSoloOwnedWorkspaces = parsed.data.closeSoloOwnedWorkspaces === true;
  const userId = String(auth.context.user._id);

  try {
    await connectDB();

    const user = await UserModel.findById(userId)
      .select('email +passwordHash +password settings')
      .lean<{ email: string; passwordHash?: string; password?: string; settings?: unknown } | null>();
    if (!user) {
      return withSecurityHeaders(req, NextResponse.json({ message: 'User not found' }, { status: 404 }));
    }

    const normalizedConfirmation = parsed.data.confirmation.trim().toLowerCase();
    const expectedEmail = user.email.trim().toLowerCase();
    if (normalizedConfirmation !== expectedEmail && normalizedConfirmation !== 'delete') {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: 'Type your account email address or DELETE to confirm account deletion.',
            reason: 'confirmation_required',
          },
          { status: 400 }
        )
      );
    }

    const passwordHash = user.passwordHash || user.password || '';
    let identityVerified = false;

    if (parsed.data.googleIdToken) {
      try {
        identityVerified = await verifyGoogleIdentityForEmail(parsed.data.googleIdToken, user.email);
      } catch {
        identityVerified = false;
      }
    }

    if (!identityVerified && passwordHash && parsed.data.password) {
      identityVerified = await bcrypt.compare(parsed.data.password, passwordHash);
    }

    if (!identityVerified) {
      await writeAuditEvent({
        userId,
        action: 'auth.account.delete_verification_failed',
        ipAddress,
        userAgent,
        metadata: {
          reason: parsed.data.googleIdToken ? 'invalid_google_token' : 'missing_or_invalid_identity_proof',
          sessionId: auth.context.sessionId,
        },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: passwordHash
              ? 'Identity verification failed. Enter your password or verify with Google.'
              : 'Verify with Google before deleting this account.',
            reason: 'invalid_credentials',
          },
          { status: 401 }
        )
      );
    }

    const mfaCheck = enforceMfaForSensitiveAction(auth.context, parsed.data.mfaCode);
    if (!mfaCheck.ok) {
      return withSecurityHeaders(req, mfaCheck.response);
    }

    const ownerMemberships = await MembershipModel.find({
      userId,
      role: 'owner',
      status: 'active',
    })
      .select('orgId')
      .lean<{ orgId: mongoose.Types.ObjectId }[]>();

    if (ownerMemberships.length > 0) {
      const orgIds = ownerMemberships.map((membership) => membership.orgId);
      const [ownerCounts, activeMemberCounts] = await Promise.all([
        MembershipModel.aggregate<{
          _id: mongoose.Types.ObjectId;
          count: number;
        }>([
          { $match: { orgId: { $in: orgIds }, role: 'owner', status: 'active' } },
          { $group: { _id: '$orgId', count: { $sum: 1 } } },
        ]),
        MembershipModel.aggregate<{
          _id: mongoose.Types.ObjectId;
          count: number;
        }>([
          { $match: { orgId: { $in: orgIds }, status: 'active' } },
          { $group: { _id: '$orgId', count: { $sum: 1 } } },
        ]),
      ]);
      const activeMemberCountByOrgId = new Map(
        activeMemberCounts.map((entry) => [entry._id.toString(), entry.count])
      );
      const blockedOrgIds = ownerCounts
        .filter((entry) => entry.count <= 1)
        .map((entry) => entry._id.toString());

      if (blockedOrgIds.length > 0) {
        const soloOwnedOrgIds = blockedOrgIds.filter(
          (orgId) => (activeMemberCountByOrgId.get(orgId) || 0) <= 1
        );
        const sharedOwnedOrgIds = blockedOrgIds.filter(
          (orgId) => (activeMemberCountByOrgId.get(orgId) || 0) > 1
        );
        const blockedOrgs = await OrganizationModel.find({ _id: { $in: blockedOrgIds } })
          .select('name')
          .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string }>>();
        const orgNameById = new Map(blockedOrgs.map((org) => [String(org._id), org.name || 'Unknown Workspace']));
        const sharedOwnedOrgs = sharedOwnedOrgIds.map((orgId) => ({
          orgId,
          name: orgNameById.get(orgId) || 'Unknown Workspace',
        }));
        const soloOwnedOrgs = soloOwnedOrgIds.map((orgId) => ({
          orgId,
          name: orgNameById.get(orgId) || 'Unknown Workspace',
        }));

        if (sharedOwnedOrgs.length > 0) {
          return withSecurityHeaders(
            req,
            NextResponse.json(
              {
                message: 'Before deleting your account, transfer ownership for each workspace where other active members still depend on your owner role.',
                reason: 'pending_owned_workspaces',
                blockedWorkspaces: sharedOwnedOrgs,
                soloOwnedWorkspaces: soloOwnedOrgs,
                instructions: 'Open Workspace Members, invite another owner or promote an existing active member to Owner, then return to Settings and delete your account.',
              },
              { status: 409 }
            )
          );
        }

        if (soloOwnedOrgs.length > 0 && !closeSoloOwnedWorkspaces) {
          return withSecurityHeaders(
            req,
            NextResponse.json(
              {
                message: 'You are the only member of these workspaces. Confirm that they should be closed with your account.',
                reason: 'solo_owned_workspaces',
                blockedWorkspaces: soloOwnedOrgs,
                canCloseWithAccount: true,
                instructions: 'Because these workspaces have no other active members, you can close them while deleting your account.',
              },
              { status: 409 }
            )
          );
        }

        if (soloOwnedOrgIds.length > 0) {
          await OrganizationModel.updateMany(
            { _id: { $in: soloOwnedOrgIds } },
            { $set: { status: 'suspended' } }
          ).exec();
        }
      }
    }

    await DocumentModel.updateMany(
      {
        userId,
        deletedAt: null,
        status: { $in: ['sent', 'pending', 'in_progress'] },
      },
      {
        $set: {
          status: 'cancelled',
        },
      }
    ).exec();

    await softDeleteUserAndRevokeSessions(userId);

    const refreshedUser = await UserModel.findById(userId)
      .select('deletionScheduledAt')
      .lean<{ deletionScheduledAt?: Date | null } | null>();
    const deletionScheduledAt = refreshedUser?.deletionScheduledAt || new Date();

    try {
      await createNotification({
        userId,
        type: 'system',
        title: 'Account deletion scheduled',
        body: `Your account deletion request is being processed. Permanent deletion is scheduled for ${deletionScheduledAt.toLocaleDateString()}.`,
        href: '/login',
        metadata: {
          deletionScheduledAt: deletionScheduledAt.toISOString(),
          securityEvent: true,
        },
        dedupeKey: `account-deletion-scheduled:${userId}:${deletionScheduledAt.toISOString()}`,
      });
    } catch (notificationError) {
      console.error('Failed to create account deletion notification:', notificationError);
    }

    try {
      await sendAccountDeletionScheduledEmail({
        toEmail: user.email,
        deletionScheduledAt,
        ipAddress,
        userAgent,
        timestamp: new Date(),
      });
    } catch (emailError) {
      console.error('Account deletion scheduled email failed:', emailError);
    }

    await writeAuditEvent({
      userId,
      action: 'auth.account.deleted',
      ipAddress,
      userAgent,
      metadata: {
        softDelete: true,
        sessionId: auth.context.sessionId,
      },
    });

    const response = NextResponse.json(
      {
        success: true,
        message: 'Your account deletion request is being processed.',
      },
      { status: 200 }
    );
    clearAllAuthCookies(response, req);
    return withSecurityHeaders(req, response);
  } catch (err) {
    console.error('Delete account route error:', err);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    );
  }
}
