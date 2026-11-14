import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

import connectDB from '@/utils/db';
import Users from '@/models/Users';
import OrganizationModel from '@/models/Organization';
import MembershipModel from '@/models/Membership';
import { getAuthSession } from '@/lib/api-helpers';
import { getClientIp, getUserAgent, isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

type OrgResponse = {
  orgId: string;
  role: string;
  status: string;
  isPrimary: boolean;
  memberSince?: Date;
  org: {
    id: string;
    name: string;
    slug?: string;
    plan: string;
    status: string;
    seatLimit: number;
    trialEndsAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
  };
};

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

  await connectDB();

  const [memberships, user] = await Promise.all([
    MembershipModel.find({ userId, status: { $ne: 'disabled' } })
      .select('orgId role status createdAt')
      .lean<{ orgId: mongoose.Types.ObjectId; role: string; status: string; createdAt?: Date }[]>(),
    Users.findById(userId).select('primaryOrgId').lean<{ primaryOrgId?: mongoose.Types.ObjectId | null } | null>(),
  ]);

  if (memberships.length === 0) {
    return withSecurityHeaders(req, NextResponse.json({ organizations: [] }, { status: 200 }));
  }

  const orgIds = memberships.map((membership) => membership.orgId);
  const orgs = await OrganizationModel.find({ _id: { $in: orgIds } })
    .select('name slug plan status seatLimit trialEndsAt createdAt updatedAt')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; slug?: string; plan: string; status: string; seatLimit: number; trialEndsAt?: Date; createdAt?: Date; updatedAt?: Date }[]>();

  const orgMap = new Map(orgs.map((org) => [String(org._id), org]));
  const primaryOrgId = user?.primaryOrgId ? String(user.primaryOrgId) : null;

  const organizations = memberships
    .map<OrgResponse | null>((membership) => {
      const org = orgMap.get(String(membership.orgId));
      if (!org) return null;
      return {
        orgId: String(membership.orgId),
        role: membership.role,
        status: membership.status,
        isPrimary: primaryOrgId ? primaryOrgId === String(membership.orgId) : false,
        memberSince: membership.createdAt,
        org: {
          id: String(org._id),
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          status: org.status,
          seatLimit: org.seatLimit,
          trialEndsAt: org.trialEndsAt,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
        },
      };
    })
    .filter(Boolean) as OrgResponse[];

  return withSecurityHeaders(req, NextResponse.json({ organizations }, { status: 200 }));
}

export async function PATCH(req: NextRequest) {
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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orgId = typeof body.orgId === 'string' ? body.orgId.trim() : '';
  if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid workspace id' }, { status: 400 }));
  }

  await connectDB();

  const membership = await MembershipModel.findOne({ userId, orgId, status: 'active' })
    .select('role')
    .lean<{ role?: string } | null>();

  if (!membership) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'User is not an active member of this workspace.' }, { status: 403 })
    );
  }

  await Users.updateOne({ _id: userId }, { $set: { primaryOrgId: orgId, role: membership.role || 'user' } }).exec();

  await writeAuditEvent({
    userId,
    orgId,
    action: 'org_primary_updated',
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    metadata: { orgId },
  });

  return withSecurityHeaders(
    req,
    NextResponse.json(
      {
        success: true,
        orgId,
        orgRole: membership.role || 'user',
        role: membership.role || 'user',
        primaryOrgId: orgId,
      },
      { status: 200 }
    )
  );
}
