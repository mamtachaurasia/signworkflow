import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { getClientIp, getUserAgent, isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import { getAuthContext } from '@/lib/auth-context';
import { isOwnerRole } from '@/lib/role-utils';
import MembershipModel, { type MembershipRole, type MembershipStatus } from '@/models/Membership';
import TeamModel from '@/models/Team';
import Users from '@/models/Users';
import connectDB from '@/utils/db';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

export const runtime = 'nodejs';

type RouteParams = Promise<{ memberId: string }>;
type MembershipSummary = {
  userId: mongoose.Types.ObjectId;
  role: MembershipRole;
  status: MembershipStatus;
};

function getMemberId(params: { memberId?: string } | undefined) {
  return params?.memberId || '';
}

function isSupportedStatus(value: unknown): value is MembershipStatus {
  return value === 'active' || value === 'disabled';
}

export async function PATCH(req: NextRequest, { params }: { params: RouteParams }) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  const context = await getAuthContext(req);
  if (!context) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  if (!context.orgId) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace context is missing.' }, { status: 400 })
    );
  }

  if (!isOwnerRole(context.orgRole)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Only owners can manage workspace access.' }, { status: 403 })
    );
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'organization_members' });
  if (!planGate.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGate.message }, { status: planGate.status })
    );
  }

  const memberId = getMemberId(await params);
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid member id.' }, { status: 400 }));
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nextStatus = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
  if (!isSupportedStatus(nextStatus)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Status must be either active or disabled.' }, { status: 400 })
    );
  }

  if (memberId === context.userId && nextStatus === 'disabled') {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Ask another owner to disable your access.' }, { status: 409 })
    );
  }

  await connectDB();

  const membership = await MembershipModel.findOne({
    orgId: context.orgId,
    userId: memberId,
  })
    .select('userId role status')
    .lean<MembershipSummary | null>();

  if (!membership) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace member not found.' }, { status: 404 })
    );
  }

  if (membership.status === nextStatus) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ success: true, unchanged: true, userId: memberId, status: nextStatus }, { status: 200 })
    );
  }

  if (membership.role === 'owner' && membership.status === 'active' && nextStatus === 'disabled') {
    const ownerCount = await MembershipModel.countDocuments({
      orgId: context.orgId,
      role: 'owner',
      status: 'active',
    });

    if (ownerCount <= 1) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'At least one active owner is required.' }, { status: 409 })
      );
    }
  }

  await MembershipModel.updateOne(
    { orgId: context.orgId, userId: memberId },
    {
      $set: {
        status: nextStatus,
        disabledReason: nextStatus === 'disabled' ? 'admin' : null,
      },
    }
  ).exec();

  const targetUser = await Users.findById(memberId)
    .select('primaryOrgId')
    .lean<{ primaryOrgId?: mongoose.Types.ObjectId | null } | null>();

  if (targetUser?.primaryOrgId && String(targetUser.primaryOrgId) === context.orgId) {
    if (nextStatus === 'active') {
      await Users.updateOne({ _id: memberId }, { $set: { role: membership.role } }).exec();
    } else {
      const fallbackMembership = await MembershipModel.findOne({
        userId: memberId,
        orgId: { $ne: context.orgId },
        status: 'active',
      })
        .select('orgId role')
        .sort({ createdAt: 1 })
        .lean<{ orgId: mongoose.Types.ObjectId; role?: MembershipRole } | null>();

      if (fallbackMembership) {
        await Users.updateOne(
          { _id: memberId },
          {
            $set: {
              primaryOrgId: fallbackMembership.orgId,
              role: fallbackMembership.role || 'user',
            },
          }
        ).exec();
      }
    }
  }

  await writeAuditEvent({
    userId: context.userId,
    orgId: context.orgId,
    action: nextStatus === 'disabled' ? 'org_member_access_disabled' : 'org_member_access_restored',
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    metadata: {
      memberUserId: memberId,
      fromStatus: membership.status,
      toStatus: nextStatus,
      role: membership.role,
    },
  });

  return withSecurityHeaders(
    req,
    NextResponse.json({ success: true, userId: memberId, status: nextStatus }, { status: 200 })
  );
}

export async function DELETE(req: NextRequest, { params }: { params: RouteParams }) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  const context = await getAuthContext(req);
  if (!context) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  if (!context.orgId) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace context is missing.' }, { status: 400 })
    );
  }

  if (!isOwnerRole(context.orgRole)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Only owners can remove workspace members.' }, { status: 403 })
    );
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'organization_members' });
  if (!planGate.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGate.message }, { status: planGate.status })
    );
  }

  const memberId = getMemberId(await params);
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid member id.' }, { status: 400 }));
  }

  if (memberId === context.userId) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Ask another owner to remove you from the workspace.' }, { status: 409 })
    );
  }

  await connectDB();

  const membership = await MembershipModel.findOne({
    orgId: context.orgId,
    userId: memberId,
  })
    .select('userId role status')
    .lean<MembershipSummary | null>();

  if (!membership) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace member not found.' }, { status: 404 })
    );
  }

  if (membership.status !== 'disabled') {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        { message: 'Disable access before removing this member from the workspace.' },
        { status: 409 }
      )
    );
  }

  await TeamModel.updateMany(
    { orgId: context.orgId, memberIds: memberId },
    { $pull: { memberIds: memberId }, $set: { updatedBy: context.userId } }
  ).exec();

  await MembershipModel.deleteOne({ orgId: context.orgId, userId: memberId }).exec();

  const fallbackMembership = await MembershipModel.findOne({
    userId: memberId,
    status: 'active',
  })
    .select('orgId role')
    .sort({ createdAt: 1 })
    .lean<{ orgId: mongoose.Types.ObjectId; role?: MembershipRole } | null>();

  if (fallbackMembership) {
    await Users.updateOne(
      { _id: memberId },
      {
        $set: {
          primaryOrgId: fallbackMembership.orgId,
          role: fallbackMembership.role || 'user',
        },
      }
    ).exec();
  }

  await writeAuditEvent({
    userId: context.userId,
    orgId: context.orgId,
    action: 'org_member_removed',
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    metadata: {
      memberUserId: memberId,
      previousStatus: membership.status,
      role: membership.role,
    },
  });

  return withSecurityHeaders(
    req,
    NextResponse.json({ success: true, userId: memberId, removed: true }, { status: 200 })
  );
}
