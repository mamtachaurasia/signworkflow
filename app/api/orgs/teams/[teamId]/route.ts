import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import connectDB from '@/utils/db';
import TeamModel from '@/models/Team';
import { getAuthContext } from '@/lib/auth-context';
import { isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { isAdminRole } from '@/lib/role-utils';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

export const runtime = 'nodejs';

function getTeamId(params: { teamId?: string } | undefined) {
  return params?.teamId || '';
}

export async function PATCH(
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
      NextResponse.json({ message: 'Insufficient permissions to update teams.' }, { status: 403 })
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
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!name && !description) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Provide a new name or description.' }, { status: 400 })
    );
  }
  if (name && name.length > 80) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Team name must be 80 characters or fewer.' }, { status: 400 })
    );
  }

  await connectDB();

  const update: Record<string, unknown> = { updatedBy: context.userId };
  if (name) update.name = name;
  if (description) update.description = description;

  try {
    const team = await TeamModel.findOneAndUpdate(
      { _id: teamId, orgId: context.orgId },
      { $set: update },
      { new: true }
    ).lean<{ _id: mongoose.Types.ObjectId; name: string; description?: string | null; memberIds?: mongoose.Types.ObjectId[] } | null>();

    if (!team) {
      return withSecurityHeaders(req, NextResponse.json({ message: 'Team not found.' }, { status: 404 }));
    }

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          team: {
            id: String(team._id),
            name: team.name,
            description: team.description || '',
            memberCount: team.memberIds?.length || 0,
          },
        },
        { status: 200 }
      )
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'A team with that name already exists.' }, { status: 409 })
      );
    }
    console.error('Teams PATCH error:', error);
    return withSecurityHeaders(req, NextResponse.json({ message: 'Internal Server Error' }, { status: 500 }));
  }
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
      NextResponse.json({ message: 'Insufficient permissions to delete teams.' }, { status: 403 })
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

  await connectDB();

  const result = await TeamModel.deleteOne({ _id: teamId, orgId: context.orgId }).exec();
  if (result.deletedCount === 0) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Team not found.' }, { status: 404 }));
  }

  return withSecurityHeaders(req, NextResponse.json({ success: true }, { status: 200 }));
}
