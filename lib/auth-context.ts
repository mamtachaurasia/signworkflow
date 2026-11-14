import { NextRequest } from 'next/server';

import { getAuthSession } from '@/lib/api-helpers';
import { getOrgContextForUser, getRequestedOrgId } from '@/lib/orgs';

interface AuthContextOptions {
  allowGuest?: boolean;
}

export async function getAuthContext(
  req: NextRequest,
  options: AuthContextOptions = {}
): Promise<{ userId: string; orgId: string | null; orgRole: string | null } | null> {
  const userId = await getAuthSession(req, options);
  if (!userId) return null;

  if (userId.startsWith('guest_')) {
    return { userId, orgId: null, orgRole: null };
  }

  const orgContext = await getOrgContextForUser(userId, getRequestedOrgId(req));
  if (!orgContext) {
    return { userId, orgId: null, orgRole: null };
  }
  return {
    userId,
    orgId: orgContext.orgId,
    orgRole: orgContext.orgRole,
  };
}
