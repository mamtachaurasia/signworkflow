import mongoose from 'mongoose';

import OrganizationModel, { type OrganizationPlan } from '@/models/Organization';
import MembershipModel, { type MembershipRole } from '@/models/Membership';
import Users from '@/models/Users';
import DocumentModel from '@/models/Document';
import TemplateModel from '@/models/Template';
import ContactModel from '@/models/Contact';
import LegalHoldModel from '@/models/LegalHold';
import AuditLogModel from '@/models/AuditLog';
import { getDefaultSeatLimitForTier, getOrganizationTier, type OrganizationPlanCode, type OrganizationTierId } from '@/lib/subscription-plans';
import { resolveWorkspaceName } from '@/lib/workspace-name';

const DEFAULT_TRIAL_DAYS = Number(process.env.DEFAULT_TRIAL_DAYS || 30);
const DEFAULT_PLAN = (process.env.DEFAULT_PLAN || 'trial') as OrganizationPlan;
export const NO_ACTIVE_ORG_MEMBERSHIPS_ERROR = 'No active workspace memberships';

const ROLE_ORDER: MembershipRole[] = ['owner', 'admin', 'auditor', 'user'];

export type OrgContext = { orgId: string; orgRole: MembershipRole };

export function isNoActiveOrgMembershipError(error: unknown): boolean {
  return error instanceof Error && error.message === NO_ACTIVE_ORG_MEMBERSHIPS_ERROR;
}

export function getRequestedOrgId(req: { headers?: Headers; nextUrl?: URL; url?: string }): string | null {
  const headerValue = req.headers?.get('x-org-id');
  if (headerValue && headerValue.trim()) {
    return headerValue.trim();
  }

  const queryValue = req.nextUrl?.searchParams.get('orgId')?.trim();
  if (queryValue) {
    return queryValue;
  }

  if (req.url) {
    try {
      const url = new URL(req.url);
      const paramValue = url.searchParams.get('orgId')?.trim();
      if (paramValue) {
        return paramValue;
      }
    } catch {
      // Ignore malformed URLs.
    }
  }

  return null;
}

function normalizeMembershipRole(role?: string | null): MembershipRole {
  if (!role) return 'user';
  const normalized = role.trim().toLowerCase();
  if (normalized === 'owner') return 'owner';
  if (normalized === 'admin') return 'admin';
  if (normalized === 'auditor') return 'auditor';
  return 'user';
}

type UserOrgProjection = {
  _id: mongoose.Types.ObjectId;
  role?: string;
  primaryOrgId?: mongoose.Types.ObjectId | null;
};

async function resolveActiveOrgMembership(
  user: UserOrgProjection
): Promise<{ orgId: mongoose.Types.ObjectId; role: MembershipRole } | null> {
  if (user.primaryOrgId) {
    const membership = await MembershipModel.findOne({
      orgId: user.primaryOrgId,
      userId: user._id,
      status: 'active',
    })
      .select('role')
      .lean<{ role?: MembershipRole } | null>();

    if (membership) {
      const normalizedRole = normalizeMembershipRole(membership.role);
      if (normalizedRole !== normalizeMembershipRole(user.role)) {
        await Users.updateOne({ _id: user._id }, { $set: { role: normalizedRole } }).exec();
      }

      return { orgId: user.primaryOrgId, role: normalizedRole };
    }
  }

  const fallbackMembership = await MembershipModel.findOne({ userId: user._id, status: 'active' })
    .select('orgId role')
    .sort({ createdAt: 1 })
    .lean<{ orgId: mongoose.Types.ObjectId; role?: MembershipRole } | null>();

  if (!fallbackMembership) {
    return null;
  }

  const normalizedRole = normalizeMembershipRole(fallbackMembership.role);
  const shouldUpdatePrimaryOrg =
    !user.primaryOrgId || String(user.primaryOrgId) !== String(fallbackMembership.orgId);
  const shouldUpdateRole = normalizedRole !== normalizeMembershipRole(user.role);

  if (shouldUpdatePrimaryOrg || shouldUpdateRole) {
    await Users.updateOne(
      { _id: user._id },
      {
        $set: {
          primaryOrgId: fallbackMembership.orgId,
          role: normalizedRole,
        },
      }
    ).exec();
  }

  return { orgId: fallbackMembership.orgId, role: normalizedRole };
}

export async function getMembershipRoleForUser(
  userId: string,
  orgId: string
): Promise<MembershipRole | null> {
  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(orgId)) {
    return null;
  }

  const membership = await MembershipModel.findOne({ orgId, userId, status: 'active' })
    .select('role')
    .lean<{ role?: MembershipRole } | null>();

  return membership ? normalizeMembershipRole(membership.role) : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function generateOrgSlug(name: string): string {
  const base = slugify(name) || 'org';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

async function migrateUserDataToOrg(userId: string, orgId: mongoose.Types.ObjectId) {
  await Promise.all([
    DocumentModel.updateMany(
      { userId, $or: [{ orgId: { $exists: false } }, { orgId: null }] },
      { $set: { orgId } }
    ).exec(),
    TemplateModel.updateMany(
      { userId, $or: [{ orgId: { $exists: false } }, { orgId: null }] },
      { $set: { orgId } }
    ).exec(),
    ContactModel.updateMany(
      { userId, $or: [{ orgId: { $exists: false } }, { orgId: null }] },
      { $set: { orgId } }
    ).exec(),
    LegalHoldModel.updateMany(
      { createdBy: userId, $or: [{ orgId: { $exists: false } }, { orgId: null }] },
      { $set: { orgId } }
    ).exec(),
    AuditLogModel.updateMany(
      { userId, $or: [{ orgId: { $exists: false } }, { orgId: null }] },
      { $set: { orgId } }
    ).exec(),
  ]);
}

function resolveSeatLimitForPlan(plan: OrganizationPlanCode): number {
  const normalizedTier = getOrganizationTier(plan);
  if (!normalizedTier) {
    const fallbackSeatLimit = Number(process.env.DEFAULT_SEAT_LIMIT || 5);
    return fallbackSeatLimit > 0 ? fallbackSeatLimit : 5;
  }
  return getDefaultSeatLimitForTier(normalizedTier);
}

async function createOrganizationForUser(
  userId: string,
  planOverride?: OrganizationPlanCode,
  membershipRoleOverride?: MembershipRole
) {
  const user = await Users.findById(userId)
    .select('email name role primaryOrgId')
    .lean<{ _id: mongoose.Types.ObjectId; email?: string; name?: string; role?: string; primaryOrgId?: mongoose.Types.ObjectId | null } | null>();

  if (!user) {
    throw new Error('User not found');
  }

  const orgName = resolveWorkspaceName({ name: user.name, email: user.email });
  const organizationPlan = (planOverride || DEFAULT_PLAN) as OrganizationPlanCode;
  const org = await OrganizationModel.create({
    name: orgName,
    slug: generateOrgSlug(orgName),
    ownerUserId: user._id,
    plan: organizationPlan,
    status: 'active',
    seatLimit: resolveSeatLimitForPlan(organizationPlan),
    trialEndsAt:
      organizationPlan === 'trial'
        ? new Date(Date.now() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000)
        : undefined,
  });

  const role = membershipRoleOverride || normalizeMembershipRole(user.role);
  await MembershipModel.create({
    orgId: org._id,
    userId: user._id,
    role,
    status: 'active',
  });

  await Users.updateOne({ _id: user._id }, { $set: { primaryOrgId: org._id, role } }).exec();
  await migrateUserDataToOrg(String(user._id), org._id);

  return { orgId: org._id, role };
}

export async function createOrganizationWorkspaceForUser(
  userId: string,
  tier: OrganizationTierId
): Promise<{ orgId: mongoose.Types.ObjectId; role: MembershipRole }> {
  return createOrganizationForUser(userId, tier, 'owner');
}

export async function ensureUserOrg(userId: string): Promise<{ orgId: mongoose.Types.ObjectId; role: MembershipRole }> {
  const user = await Users.findById(userId)
    .select('role primaryOrgId')
    .lean<UserOrgProjection | null>();

  if (!user) {
    throw new Error('User not found');
  }

  const existingOrg = await resolveActiveOrgMembership(user);
  if (existingOrg) {
    return existingOrg;
  }

  return await createOrganizationForUser(String(user._id), DEFAULT_PLAN as OrganizationPlanCode, 'owner');
}

export async function getActiveOrgContextForUser(
  userId: string
): Promise<{ orgId: mongoose.Types.ObjectId; role: MembershipRole } | null> {
  const user = await Users.findById(userId)
    .select('role primaryOrgId')
    .lean<UserOrgProjection | null>();

  if (!user) {
    throw new Error('User not found');
  }

  return resolveActiveOrgMembership(user);
}

export async function getOrgContextForUser(
  userId: string,
  requestedOrgId?: string | null
): Promise<OrgContext | null> {
  if (!userId || typeof userId !== 'string') {
    return null;
  }

  if (requestedOrgId) {
    const role = await getMembershipRoleForUser(userId, requestedOrgId);
    if (!role) {
      return null;
    }
    return { orgId: requestedOrgId, orgRole: role };
  }

  try {
    const context = await getActiveOrgContextForUser(userId);
    if (!context) {
      return null;
    }
    return {
      orgId: String(context.orgId),
      orgRole: context.role,
    };
  } catch {
    return null;
  }
}

export function compareRoles(a: MembershipRole, b: MembershipRole): number {
  return ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b);
}
