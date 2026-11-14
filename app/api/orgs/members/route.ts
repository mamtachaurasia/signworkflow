import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import connectDB from '@/utils/db';
import Users from '@/models/Users';
import MembershipModel from '@/models/Membership';
import OrganizationModel from '@/models/Organization';
import TeamModel from '@/models/Team';
import { getAuthSession } from '@/lib/api-helpers';
import { getOrgContextForUser, getRequestedOrgId } from '@/lib/orgs';
import { isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { isAdminRole, isAuditorRole, isOwnerRole } from '@/lib/role-utils';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

export const runtime = 'nodejs';

type MemberEntry = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  teams: { id: string; name: string }[];
  invitedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  isDeleted?: boolean;
};

const ROLE_ORDER = ['owner', 'admin', 'auditor', 'user'];

export async function GET(req: NextRequest) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  const userId = await getAuthSession(req);
  if (!userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  const orgContext = await getOrgContextForUser(userId, getRequestedOrgId(req));
  if (!orgContext?.orgId) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace context is missing.' }, { status: 400 })
    );
  }

  const role = orgContext.orgRole;
  const canView = isOwnerRole(role) || isAdminRole(role) || isAuditorRole(role);
  if (!canView) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Insufficient permissions to view members.' }, { status: 403 })
    );
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: orgContext.orgId, feature: 'organization_members' });
  if (!planGate.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGate.message }, { status: planGate.status })
    );
  }

  await connectDB();

  const org = await OrganizationModel.findById(orgContext.orgId)
    .select('name slug plan status seatLimit')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; slug?: string; plan: string; status: string; seatLimit: number } | null>();

  if (!org) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace not found.' }, { status: 404 })
    );
  }

  const memberships = await MembershipModel.find({ orgId: orgContext.orgId })
    .select('userId role status invitedBy createdAt updatedAt')
    .lean<{
      userId: mongoose.Types.ObjectId;
      role: string;
      status: string;
      invitedBy?: mongoose.Types.ObjectId | null;
      createdAt?: Date;
      updatedAt?: Date;
    }[]>();

  const userIds = memberships.map((membership) => membership.userId);
  const users = await Users.find({ _id: { $in: userIds } })
    .select('email name firstName lastName isDeleted')
    .lean<{ _id: mongoose.Types.ObjectId; email?: string; name?: string; firstName?: string; lastName?: string; isDeleted?: boolean }[]>();

  const teams = await TeamModel.find({ orgId: orgContext.orgId, memberIds: { $in: userIds } })
    .select('name memberIds')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; memberIds: mongoose.Types.ObjectId[] }[]>();

  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const teamMap = new Map<string, { id: string; name: string }[]>();

  teams.forEach((team) => {
    team.memberIds.forEach((memberId) => {
      const key = String(memberId);
      const existing = teamMap.get(key) || [];
      existing.push({ id: String(team._id), name: team.name });
      teamMap.set(key, existing);
    });
  });

  const members: MemberEntry[] = memberships
    .map((membership) => {
      const linkedUser = userMap.get(String(membership.userId));
      const nameParts = [linkedUser?.firstName, linkedUser?.lastName].filter(Boolean).join(' ');
      const displayName = nameParts || linkedUser?.name || 'Unknown user';
      return {
        userId: String(membership.userId),
        name: displayName,
        email: linkedUser?.email || 'unknown@example.com',
        role: membership.role,
        status: membership.status,
        teams: (teamMap.get(String(membership.userId)) || []).sort((a, b) => a.name.localeCompare(b.name)),
        invitedBy: membership.invitedBy ? String(membership.invitedBy) : null,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
        isDeleted: linkedUser?.isDeleted ?? false,
      };
    })
    .sort((a, b) => {
      const roleOrder = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
      if (roleOrder !== 0) return roleOrder;
      return a.name.localeCompare(b.name);
    });

  return withSecurityHeaders(
    req,
    NextResponse.json(
      {
        organization: {
          id: String(org._id),
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          status: org.status,
          seatLimit: org.seatLimit,
        },
        orgRole: role,
        members,
      },
      { status: 200 }
    )
  );
}
