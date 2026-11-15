import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';

import { getClientIp, getUserAgent, isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { resolvePublicBaseUrl } from '@/lib/app-url';
import { writeAuditEvent } from '@/lib/audit';
import { verifyAdminPromotion } from '@/lib/admin-governance';
import { generatePasswordResetToken } from '@/lib/forgotPasswordHelpers';
import { sendOrgAddedEmail, sendUserInviteEmail } from '@/lib/email';
import { isOwnerRole } from '@/lib/role-utils';
import { getDeletionWindowState } from '@/lib/user-deletion';
import OrganizationModel from '@/models/Organization';
import MembershipModel from '@/models/Membership';
import TeamModel from '@/models/Team';
import { ensureUserOrg } from '@/lib/orgs';
import connectDB from '@/utils/db';
import Users from '@/models/Users';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

export const runtime = 'nodejs';

const InviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(['user', 'admin', 'owner', 'auditor']).default('user'),
  name: z.string().trim().max(200).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  teamId: z.string().trim().optional(),
  teamIds: z.array(z.string().trim()).max(20).optional(),
});

function normalizeTeamIds(input: { teamId?: string; teamIds?: string[] }): string[] {
  const ids: string[] = [];
  if (input.teamId && input.teamId.trim()) {
    ids.push(input.teamId.trim());
  }
  if (Array.isArray(input.teamIds)) {
    input.teamIds.forEach((id) => {
      if (typeof id === 'string' && id.trim()) {
        ids.push(id.trim());
      }
    });
  }
  return Array.from(new Set(ids));
}

async function resolveTeamIds(orgId: string, teamIds: string[]): Promise<string[]> {
  if (!teamIds.length) return [];
  const invalid = teamIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalid) {
    throw new Error('Invalid team id.');
  }
  const teams = await TeamModel.find({ _id: { $in: teamIds }, orgId })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }[]>();
  if (teams.length !== teamIds.length) {
    throw new Error('One or more teams not found.');
  }
  return teams.map((team) => String(team._id));
}

async function addUserToTeams(params: {
  orgId: string;
  userId: string;
  teamIds: string[];
  updatedBy?: string | null;
}) {
  const { orgId, userId, teamIds, updatedBy } = params;
  if (!teamIds.length) return;
  const update: Record<string, unknown> = { $addToSet: { memberIds: userId } };
  if (updatedBy) {
    update.$set = { updatedBy };
  }
  await TeamModel.updateMany({ _id: { $in: teamIds }, orgId }, update).exec();
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

  try {
    const auth = await verifyAdminPromotion(req);
    if (!auth.authorized) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 })
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = InviteSchema.safeParse(body);
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

    const actorIsBootstrap = auth.actorType === 'bootstrap';
    if (!actorIsBootstrap && !isOwnerRole(auth.actorRole)) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Only owners can invite users.' }, { status: 403 })
      );
    }

    const { email, role, name, firstName, lastName, teamId, teamIds } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const requestedTeamIds = normalizeTeamIds({ teamId, teamIds });

    await connectDB();

    let orgId: string | null = null;

    if (actorIsBootstrap) {
      if (role !== 'owner') {
        await writeAuditEvent({
          action: 'user_invite_denied',
          ipAddress,
          userAgent,
          metadata: {
            reason: 'bootstrap_role_mismatch',
            actorType: auth.actorType ?? 'unknown',
            actorId: auth.actorId || 'system',
            email: normalizedEmail,
            requestedRole: role,
          },
        });
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Bootstrap token can only be used to create an owner.' }, { status: 403 })
        );
      }

      const ownerCount = await MembershipModel.countDocuments({ role: 'owner' });
      if (ownerCount > 0) {
        await writeAuditEvent({
          action: 'user_invite_denied',
          ipAddress,
          userAgent,
          metadata: {
            reason: 'bootstrap_owner_exists',
            actorType: auth.actorType ?? 'unknown',
            actorId: auth.actorId || 'system',
            email: normalizedEmail,
            requestedRole: role,
          },
        });
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Bootstrap token is disabled once an owner exists.' }, { status: 403 })
        );
      }
    } else if (auth.actorId) {
      orgId = auth.actorOrgId ?? null;
      if (!orgId) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Workspace context is missing.' }, { status: 400 })
        );
      }

      const planGate = await getPlanGateForOrgFeature({ orgId, feature: 'organization_members' });
      if (!planGate.allowed) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: planGate.message }, { status: planGate.status })
        );
      }
    }

    if (!orgId && requestedTeamIds.length) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Team assignment requires a workspace context.' }, { status: 400 })
      );
    }

    if (orgId) {
      const org = await OrganizationModel.findById(orgId)
        .select('status seatLimit')
        .lean<{ status?: string; seatLimit?: number } | null>();
      if (!org) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Workspace not found.' }, { status: 404 })
        );
      }
      if (org.status !== 'active') {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Workspace is not active.' }, { status: 403 })
        );
      }
      const seatCount = await MembershipModel.countDocuments({ orgId, status: { $ne: 'disabled' } });
      const seatLimit = typeof org.seatLimit === 'number' ? org.seatLimit : 0;
      if (seatCount >= seatLimit) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Seat limit reached for this workspace.' }, { status: 403 })
        );
      }
    }

    const existingUser = await Users.findOne({ email: normalizedEmail })
      .select('isDeleted deletionScheduledAt primaryOrgId role')
      .exec();
    if (existingUser?.isDeleted) {
      const windowState = getDeletionWindowState(existingUser);
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: windowState.canRestore
              ? 'User account is deleted. Ask them to restore their account first.'
              : 'User account is deleted and no longer eligible for self-restore.',
            reason: 'account_deleted',
            canRestore: windowState.canRestore,
            deletionScheduledAt: windowState.deletionScheduledAt?.toISOString(),
          },
          { status: 409 }
        )
      );
    }
    if (existingUser && !orgId) {
      const existingOrgContext = await ensureUserOrg(String(existingUser._id));
      const existingOrgId = String(existingOrgContext.orgId);

      await MembershipModel.updateOne(
        { orgId: existingOrgId, userId: existingUser._id },
        { $set: { role, status: 'active' } }
      ).exec();

      if (existingUser.primaryOrgId && String(existingUser.primaryOrgId) === existingOrgId) {
        existingUser.role = role;
        await existingUser.save();
      }

      const baseUrl = resolvePublicBaseUrl({ req });
      const loginLink = `${baseUrl}/login?email=${encodeURIComponent(normalizedEmail)}`;
      await sendOrgAddedEmail(normalizedEmail, loginLink, role);

      await writeAuditEvent({
        userId: auth.actorType === 'user' ? auth.actorId : undefined,
        orgId: existingOrgId,
        action: 'user_invited',
        ipAddress,
        userAgent,
        metadata: {
          actorType: auth.actorType ?? 'unknown',
          actorId: auth.actorId || 'system',
          userId: String(existingUser._id),
          email: normalizedEmail,
          role,
          orgId: existingOrgId,
          existingUser: true,
        },
      });

      return withSecurityHeaders(
        req,
        NextResponse.json({ success: true, userId: String(existingUser._id), email: normalizedEmail, role }, { status: 201 })
      );
    }

    if (existingUser && orgId) {
      const existingMembership = await MembershipModel.findOne({ orgId, userId: existingUser._id });
      if (existingMembership) {
        if (requestedTeamIds.length) {
          try {
            const resolvedTeamIds = await resolveTeamIds(orgId, requestedTeamIds);
            await addUserToTeams({
              orgId,
              userId: String(existingUser._id),
              teamIds: resolvedTeamIds,
              updatedBy: auth.actorId || null,
            });
            return withSecurityHeaders(
              req,
              NextResponse.json(
                {
                  success: true,
                  userId: String(existingUser._id),
                  email: normalizedEmail,
                  role: existingMembership.role,
                  teamIds: resolvedTeamIds,
                  alreadyMember: true,
                },
                { status: 200 }
              )
            );
          } catch (error) {
            return withSecurityHeaders(
              req,
              NextResponse.json(
                { message: error instanceof Error ? error.message : 'Invalid team assignment.' },
                { status: 400 }
              )
            );
          }
        }
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'User already belongs to this workspace.' }, { status: 409 })
        );
      }

      await MembershipModel.create({
        orgId,
        userId: existingUser._id,
        role,
        status: 'active',
        invitedBy: auth.actorType === 'user' ? auth.actorId : undefined,
      });

      if (!existingUser.primaryOrgId) {
        existingUser.primaryOrgId = new mongoose.Types.ObjectId(orgId);
        existingUser.role = role;
        await existingUser.save();
      }

      const baseUrl = resolvePublicBaseUrl({ req });
      const loginLink = `${baseUrl}/login?email=${encodeURIComponent(normalizedEmail)}`;

      await sendOrgAddedEmail(normalizedEmail, loginLink, role);

      let resolvedTeamIds: string[] = [];
      if (requestedTeamIds.length) {
        try {
          resolvedTeamIds = await resolveTeamIds(orgId, requestedTeamIds);
          await addUserToTeams({
            orgId,
            userId: String(existingUser._id),
            teamIds: resolvedTeamIds,
            updatedBy: auth.actorId || null,
          });
        } catch (error) {
          return withSecurityHeaders(
            req,
            NextResponse.json(
              { message: error instanceof Error ? error.message : 'Invalid team assignment.' },
              { status: 400 }
            )
          );
        }
      }

      await writeAuditEvent({
        userId: auth.actorType === 'user' ? auth.actorId : undefined,
        action: 'user_invited',
        ipAddress,
        userAgent,
        metadata: {
          actorType: auth.actorType ?? 'unknown',
          actorId: auth.actorId || 'system',
          userId: String(existingUser._id),
          email: normalizedEmail,
          role,
          orgId,
          existingUser: true,
        },
      });

      return withSecurityHeaders(
        req,
        NextResponse.json(
          { success: true, userId: String(existingUser._id), email: normalizedEmail, role, teamIds: resolvedTeamIds },
          { status: 201 }
        )
      );
    }

    let resolvedFirstName = (firstName || '').trim();
    let resolvedLastName = (lastName || '').trim();
    const normalizedName = (name || '').trim();

    if ((!resolvedFirstName || !resolvedLastName) && normalizedName) {
      const parts = normalizedName.split(/\s+/).filter(Boolean);
      resolvedFirstName = resolvedFirstName || parts[0] || '';
      resolvedLastName = resolvedLastName || (parts.length > 1 ? parts.slice(1).join(' ') : '');
    }

    const fullName = [resolvedFirstName, resolvedLastName].filter(Boolean).join(' ').trim();
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const newUser = await Users.create({
      email: normalizedEmail,
      passwordHash,
      password: passwordHash,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      name: fullName,
      isActive: true,
      isDeleted: false,
      role,
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockUntil: null,
      mfaEnabled: false,
      mfaSecret: null,
    });

    let resolvedOrgId = orgId;
    if (!resolvedOrgId) {
      if (requestedTeamIds.length) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Team assignment requires a workspace context.' }, { status: 400 })
        );
      }
      const newOrgContext = await ensureUserOrg(String(newUser._id));
      resolvedOrgId = String(newOrgContext.orgId);
    } else {
      await MembershipModel.create({
        orgId: resolvedOrgId,
        userId: newUser._id,
        role,
        status: 'active',
        invitedBy: auth.actorType === 'user' ? auth.actorId : undefined,
      });
      await Users.updateOne({ _id: newUser._id }, { $set: { primaryOrgId: resolvedOrgId, role } }).exec();
    }

    let resolvedTeamIds: string[] = [];
    if (resolvedOrgId && requestedTeamIds.length) {
      try {
        resolvedTeamIds = await resolveTeamIds(resolvedOrgId, requestedTeamIds);
        await addUserToTeams({
          orgId: resolvedOrgId,
          userId: String(newUser._id),
          teamIds: resolvedTeamIds,
          updatedBy: auth.actorId || null,
        });
      } catch (error) {
        return withSecurityHeaders(
          req,
          NextResponse.json(
            { message: error instanceof Error ? error.message : 'Invalid team assignment.' },
            { status: 400 }
          )
        );
      }
    }

    const resetToken = await generatePasswordResetToken(String(newUser._id));
    const baseUrl = resolvePublicBaseUrl({ req });
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(normalizedEmail)}`;

    const emailResult = await sendUserInviteEmail(normalizedEmail, resetLink, role);
    if (!emailResult.success) {
      await writeAuditEvent({
        userId: auth.actorType === 'user' ? auth.actorId : undefined,
        orgId,
        action: 'user_invite_failed',
        ipAddress,
        userAgent,
        metadata: {
          actorType: auth.actorType ?? 'unknown',
          actorId: auth.actorId || 'system',
          userId: String(newUser._id),
          email: normalizedEmail,
          role,
          orgId: resolvedOrgId,
          reason: emailResult.error || 'email_send_failed',
        },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: emailResult.error || 'Failed to send invite email.' }, { status: 500 })
      );
    }

    await writeAuditEvent({
      userId: auth.actorType === 'user' ? auth.actorId : undefined,
      orgId: resolvedOrgId,
      action: 'user_invited',
      ipAddress,
      userAgent,
      metadata: {
        actorType: auth.actorType ?? 'unknown',
        actorId: auth.actorId || 'system',
        userId: String(newUser._id),
        email: normalizedEmail,
        role,
        orgId: resolvedOrgId,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json(
        { success: true, userId: String(newUser._id), email: normalizedEmail, role, teamIds: resolvedTeamIds },
        { status: 201 }
      )
    );
  } catch (error) {
    console.error('Admin invite error:', error);

    await writeAuditEvent({
      action: 'user_invite_failed',
      ipAddress,
      userAgent,
      metadata: {
        reason: error instanceof Error ? error.message : 'unknown_error',
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal Server Error' }, { status: 500 })
    );
  }
}
