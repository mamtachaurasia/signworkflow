import { NextRequest } from 'next/server';

import Users from '@/models/Users';
import { getAuthContext } from '@/lib/auth-context';
import { isAdminRole } from '@/lib/role-utils';
import { getMembershipRoleForUser } from '@/lib/orgs';

export function getRetentionAdminToken(req: NextRequest): string | null {
  const headerToken = req.headers.get('x-retention-token');
  if (headerToken) return headerToken;
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }
  return null;
}

export async function resolveUserRole(userId?: string | null, orgId?: string | null): Promise<string | null> {
  if (!userId || typeof userId !== 'string' || userId.startsWith('guest_')) {
    return null;
  }

  if (orgId) {
    const membershipRole = await getMembershipRoleForUser(userId, orgId);
    if (membershipRole) {
      return membershipRole;
    }
  }

  const user = await Users.findById(userId).select('role').lean<{ role?: string } | null>();
  return user?.role ?? null;
}

async function resolveSessionActor(
  req: NextRequest
): Promise<{ actorId: string | null; role: string | null; orgId: string | null }> {
  const context = await getAuthContext(req);
  if (!context?.userId || context.userId.startsWith('guest_')) {
    return { actorId: null, role: null, orgId: null };
  }
  return { actorId: context.userId, role: context.orgRole, orgId: context.orgId };
}

export async function isAdminUserId(userId?: string | null, orgId?: string | null): Promise<boolean> {
  const role = await resolveUserRole(userId, orgId);
  return isAdminRole(role);
}

export async function verifyRetentionAdmin(req: NextRequest): Promise<{
  authorized: boolean;
  actorId?: string;
  actorRole?: string | null;
  actorOrgId?: string | null;
  status?: number;
  message?: string;
}> {
  const expectedToken = process.env.RETENTION_ADMIN_TOKEN || process.env.RETENTION_PURGE_TOKEN;
  const token = getRetentionAdminToken(req);

  if (expectedToken && token && token === expectedToken) {
    return { authorized: true };
  }

  const { actorId, role, orgId } = await resolveSessionActor(req);
  if (actorId && isAdminRole(role)) {
    return { authorized: true, actorId, actorRole: role, actorOrgId: orgId };
  }

  if (!expectedToken) {
    return { authorized: false, status: 500, message: 'Retention admin token not configured' };
  }

  return { authorized: false, status: 401, message: 'Unauthorized' };
}

export function getAdminBootstrapToken(req: NextRequest): string | null {
  return req.headers.get('x-admin-bootstrap-token');
}

export async function verifyAdminPromotion(req: NextRequest): Promise<{
  authorized: boolean;
  actorId?: string;
  actorRole?: string | null;
  actorType?: 'bootstrap' | 'user';
  actorOrgId?: string | null;
  status?: number;
  message?: string;
}> {
  const expectedToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  const token = getAdminBootstrapToken(req);
  if (expectedToken && token && token === expectedToken) {
    return { authorized: true, actorId: 'bootstrap', actorType: 'bootstrap', actorRole: null };
  }

  const { actorId, role, orgId } = await resolveSessionActor(req);
  if (actorId && isAdminRole(role)) {
    return { authorized: true, actorId, actorRole: role, actorType: 'user', actorOrgId: orgId };
  }

  if (!expectedToken) {
    return { authorized: false, status: 500, message: 'ADMIN_BOOTSTRAP_TOKEN is not configured' };
  }

  return { authorized: false, status: 401, message: 'Unauthorized' };
}
