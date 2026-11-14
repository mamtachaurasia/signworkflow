import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import connectDB from '@/utils/db';
import TeamModel from '@/models/Team';
import Users from '@/models/Users';
import MembershipModel from '@/models/Membership';
import { getAuthContext } from '@/lib/auth-context';
import { isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { isAdminRole } from '@/lib/role-utils';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

export const runtime = 'nodejs';

function getTeamId(params: { teamId?: string } | undefined) {
  return params?.teamId || '';
}

async function resolveMemberIds(
  orgId: string,
  body: Record<string, unknown>
): Promise<string[]> {
  const memberIds: string[] = [];

  if (typeof body.userId === 'string' && body.userId.trim()) {
    memberIds.push(body.userId.trim());
  }

  if (Array.isArray(body.memberIds)) {
    body.memberIds.forEach((id) => {
      if (typeof id === 'string' && id.trim()) {
        memberIds.push(id.trim());
      }
    });
  }

  if (typeof body.email === 'string' && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    const user = await Users.findOne({ email }).select('_id').lean<{ _id: mongoose.Types.ObjectId } | null>();
    if (user) {
      memberIds.push(String(user._id));
    }
  }

  const unique = Array.from(new Set(memberIds));
  if (!unique.length) {
    return [];
  }

  const validIds = unique.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) {
    return [];
  }

  const memberships = await MembershipModel.find({
    orgId,
    userId: { $in: validIds },
    status: 'active',
  })
    .select('userId')
    .lean<{ userId: mongoose.Types.ObjectId }[]>();

  return memberships.map((membership) => String(membership.userId));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
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
      NextResponse.json({ message: 'Insufficient permissions to manage team members.' }, { status: 403 })
    );
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'teams' });
  if (!planGate.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGate.message }, { status: planGate.status })
    );
  }

  const teamId = getTeamId(await params);
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid team id.' }, { status: 400 }));
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  await connectDB();

  const memberIds = await resolveMemberIds(context.orgId, body);
  if (!memberIds.length) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'No valid active members found for this workspace.' }, { status: 400 })
    );
  }

  const team = await TeamModel.findOneAndUpdate(
    { _id: teamId, orgId: context.orgId },
    { $addToSet: { memberIds: { $each: memberIds } }, $set: { updatedBy: context.userId } },
    { new: true }
  ).lean<{ _id: mongoose.Types.ObjectId; memberIds?: mongoose.Types.ObjectId[] } | null>();

  if (!team) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Team not found.' }, { status: 404 }));
  }

  return withSecurityHeaders(
    req,
    NextResponse.json(
      { success: true, memberCount: team.memberIds?.length || 0, addedIds: memberIds },
      { status: 200 }
    )
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
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
      NextResponse.json({ message: 'Insufficient permissions to manage team members.' }, { status: 403 })
    );
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'teams' });
  if (!planGate.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGate.message }, { status: planGate.status })
    );
  }

  const teamId = getTeamId(await params);
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid team id.' }, { status: 400 }));
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  await connectDB();

  const memberIds = await resolveMemberIds(context.orgId, body);
  if (!memberIds.length) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'No valid active members found for this workspace.' }, { status: 400 })
    );
  }

  const team = await TeamModel.findOneAndUpdate(
    { _id: teamId, orgId: context.orgId },
    { $pull: { memberIds: { $in: memberIds } }, $set: { updatedBy: context.userId } },
    { new: true }
  ).lean<{ _id: mongoose.Types.ObjectId; memberIds?: mongoose.Types.ObjectId[] } | null>();

  if (!team) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Team not found.' }, { status: 404 }));
  }

  return withSecurityHeaders(
    req,
    NextResponse.json(
      { success: true, memberCount: team.memberIds?.length || 0, removedIds: memberIds },
      { status: 200 }
    )
  );
}
