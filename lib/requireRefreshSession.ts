import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getAuthenticatedUserIdFromRefreshToken } from '@/lib/api-helpers';
import { REFRESH_TOKEN_COOKIE_NAME } from '@/lib/auth';
import { buildDashboardBuilderLoginHref } from '@/lib/dashboard-builder-auth';

export async function requireRefreshSessionOrRedirect(nextHref?: string | null): Promise<string> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const loginHref = buildDashboardBuilderLoginHref(nextHref);

  if (!refreshToken) {
    redirect(loginHref);
  }

  const userId = await getAuthenticatedUserIdFromRefreshToken(refreshToken);
  if (!userId) {
    redirect(loginHref);
  }

  return userId;
}
