import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import connectDB from '@/utils/db';
import TeamModel from '@/models/Team';
import Users from '@/models/Users';
import MembershipModel from '@/models/Membership';
import { getAuthContext } from '@/lib/auth-context';
import { isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { isAdminRole } from '@/lib/role-utils';
import { ensureBusinessPlanRoomForNewTeam, getOrganizationPlanSnapshot } from '@/lib/subscription-server';
import { getOrganizationTier, getTeamLimitForTier } from '@/lib/subscription-plans';

export const runtime = 'nodejs';

type TeamDoc = {
  _id: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  name: string;
  description?: string | null;
  memberIds?: mongoose.Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
};

type MemberDoc = {
  _id: mongoose.Types.ObjectId;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
};

type MembershipDoc = {
  userId: mongoose.Types.ObjectId;
  role?: string;
  status?: string;
};

const formatDisplayName = (user?: MemberDoc | null) => {
  if (!user) return 'Unknown user';
  const parts = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return parts || user.name || 'Unknown user';
};

export async function GET(req: NextRequest) {
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

  await connectDB();

  const [teams, organization] = await Promise.all([
    TeamModel.find({ orgId: context.orgId })
      .sort({ name: 1 })
      .lean<TeamDoc[]>(),
    getOrganizationPlanSnapshot(context.orgId),
  ]);

  const memberIdSet = new Set<string>();
  teams.forEach((team) => {
    (team.memberIds || []).forEach((memberId) => {
      memberIdSet.add(String(memberId));
    });
  });
  const memberIds = Array.from(memberIdSet);

  const users = memberIds.length
    ? await Users.find({ _id: { $in: memberIds } })
        .select('email name firstName lastName')
        .lean<MemberDoc[]>()
    : [];

  const memberships = memberIds.length
    ? await MembershipModel.find({ orgId: context.orgId, userId: { $in: memberIds } })
        .select('userId role status')
        .lean<MembershipDoc[]>()
    : [];

  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const membershipMap = new Map(memberships.map((membership) => [String(membership.userId), membership]));

  const payloadTeams = teams.map((team) => {
    const members = (team.memberIds || []).map((memberId) => {
      const key = String(memberId);
      const user = userMap.get(key);
      const membership = membershipMap.get(key);
      return {
        userId: key,
        name: formatDisplayName(user),
        email: user?.email || 'unknown@example.com',
        role: membership?.role || 'user',
        status: membership?.status || 'unknown',
      };
    });
    return {
      id: String(team._id),
      name: team.name,
      description: team.description || '',
      memberCount: members.length,
      members,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  });

  return withSecurityHeaders(
    req,
    NextResponse.json(
      {
        orgRole: context.orgRole,
        orgPlan: organization?.plan ?? null,
        maxTeams: organization ? getTeamLimitForTier(getOrganizationTier(organization.plan) ?? 'business') : null,
        teams: payloadTeams,
      },
      { status: 200 }
    )
  );
}

export async function POST(req: NextRequest) {
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

  if (!isAdminRole(context.orgRole)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Insufficient permissions to create teams.' }, { status: 403 })
    );
  }

  const planGuard = await ensureBusinessPlanRoomForNewTeam({ orgId: context.orgId });
  if (!planGuard.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGuard.message }, { status: planGuard.status })
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!name) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Team name is required.' }, { status: 400 }));
  }
  if (name.length > 80) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Team name must be 80 characters or fewer.' }, { status: 400 })
    );
  }

  await connectDB();

  try {
    const team = await TeamModel.create({
      orgId: context.orgId,
      name,
      description: description || null,
      memberIds: [],
      createdBy: context.userId,
      updatedBy: context.userId,
    });

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          team: {
            id: String(team._id),
            name: team.name,
            description: team.description || '',
            memberCount: 0,
          },
        },
        { status: 201 }
      )
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'A team with that name already exists.' }, { status: 409 })
      );
    }
    console.error('Teams POST error:', error);
    return withSecurityHeaders(req, NextResponse.json({ message: 'Internal Server Error' }, { status: 500 }));
  }
}
