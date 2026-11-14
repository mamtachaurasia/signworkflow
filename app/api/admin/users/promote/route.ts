import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import connectDB from '@/utils/db';
import Users from '@/models/Users';
import { isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { verifyAdminPromotion } from '@/lib/admin-governance';
import { writeAuditEvent } from '@/lib/audit';
import { isOwnerRole } from '@/lib/role-utils';
import MembershipModel from '@/models/Membership';
import { ensureUserOrg } from '@/lib/orgs';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

const PromoteSchema = z.object({
  email: z.string().trim().email().optional(),
  userId: z.string().trim().min(1).optional(),
  role: z.enum(['user', 'admin', 'owner', 'auditor']).default('admin'),
});

export async function POST(req: NextRequest) {
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
    const parsed = PromoteSchema.safeParse(body);
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

    const { email, userId, role } = parsed.data;
    if (!email && !userId) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'email or userId is required' }, { status: 400 })
      );
    }

    const actorIsBootstrap = auth.actorType === 'bootstrap';
    if (!actorIsBootstrap && !isOwnerRole(auth.actorRole)) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Only owners can update user roles.' }, { status: 403 })
      );
    }

    await connectDB();

    const query = email ? { email: email.toLowerCase() } : { _id: userId };
    const target = await Users.findOne(query);
    if (!target) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'User not found' }, { status: 404 })
      );
    }

    const forwardedFor = req.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : req.headers.get('x-real-ip') || '';
    const userAgent = req.headers.get('user-agent') || '';

    let systemOwnerCount: number | null = null;
    const getSystemOwnerCount = async () => {
      if (systemOwnerCount === null) {
        systemOwnerCount = await MembershipModel.countDocuments({ role: 'owner' });
      }
      return systemOwnerCount;
    };

    if (actorIsBootstrap && role !== 'owner') {
      await writeAuditEvent({
        userId: auth.actorType === 'user' ? auth.actorId : undefined,
        action: 'user_role_update_denied',
        ipAddress,
        userAgent,
        metadata: {
          reason: 'bootstrap_role_mismatch',
          actorType: auth.actorType ?? 'unknown',
          actorId: auth.actorId || 'system',
          userId: target._id,
          email: target.email,
          requestedRole: role,
        },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Bootstrap token can only be used to create an owner.' }, { status: 403 })
      );
    }

    if (actorIsBootstrap && (await getSystemOwnerCount()) > 0) {
      await writeAuditEvent({
        userId: auth.actorType === 'user' ? auth.actorId : undefined,
        action: 'user_role_update_denied',
        ipAddress,
        userAgent,
        metadata: {
          reason: 'bootstrap_owner_exists',
          actorType: auth.actorType ?? 'unknown',
          actorId: auth.actorId || 'system',
          userId: target._id,
          email: target.email,
          requestedRole: role,
        },
      });
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Bootstrap token is disabled once an owner exists.' }, { status: 403 })
      );
    }

    const actorOrgId = actorIsBootstrap ? null : auth.actorOrgId ?? null;
    if (!actorIsBootstrap && !actorOrgId) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Workspace context is missing.' }, { status: 400 })
      );
    }

    if (actorOrgId) {
      const planGate = await getPlanGateForOrgFeature({ orgId: actorOrgId, feature: 'organization_members' });
      if (!planGate.allowed) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: planGate.message }, { status: planGate.status })
        );
      }
    }

    const orgId = actorIsBootstrap
      ? (await ensureUserOrg(String(target._id))).orgId
      : actorOrgId;

    if (!orgId) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Workspace context is missing.' }, { status: 400 })
      );
    }

    const membership = await MembershipModel.findOne({ orgId, userId: target._id });
    if (!membership) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'User is not a member of this workspace.' }, { status: 404 })
      );
    }

    const previousRole = membership.role;
    if (previousRole === role) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          { success: true, userId: String(target._id), role, unchanged: true },
          { status: 200 }
        )
      );
    }

    if (previousRole === 'owner' && role !== 'owner') {
      const count = await MembershipModel.countDocuments({ orgId, role: 'owner' });
      if (count <= 1) {
        await writeAuditEvent({
          userId: auth.actorType === 'user' ? auth.actorId : undefined,
          orgId,
          action: 'user_role_update_denied',
          ipAddress,
          userAgent,
          metadata: {
            reason: 'last_owner_protection',
            actorType: auth.actorType ?? 'unknown',
            actorId: auth.actorId || 'system',
            orgId,
            userId: target._id,
            email: target.email,
            from: previousRole,
            to: role,
          },
        });
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'At least one owner is required.' }, { status: 409 })
        );
      }
    }

    membership.role = role;
    await membership.save();

    const primaryOrgId = target.primaryOrgId ? String(target.primaryOrgId) : null;
    if (primaryOrgId && primaryOrgId === orgId) {
      target.role = role;
      await target.save();
    }

    await writeAuditEvent({
      userId: auth.actorType === 'user' ? auth.actorId : undefined,
      orgId,
      action: 'user_role_updated',
      ipAddress,
      userAgent,
      metadata: {
        actorType: auth.actorType ?? 'unknown',
        actorId: auth.actorId || 'system',
        orgId,
        userId: target._id,
        email: target.email,
        from: previousRole,
        to: role,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json({ success: true, userId: String(target._id), role }, { status: 200 })
    );
  } catch (error) {
    console.error('Admin promote error:', error);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal Server Error' }, { status: 500 })
    );
  }
}
