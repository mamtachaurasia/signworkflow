import { NextRequest, NextResponse } from 'next/server';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import { createCloudStateToken } from '@/lib/cloud/common';
import { buildCloudProviderAuthorizationUrl } from '@/lib/cloud/providers';
import { clearCloudOAuthStateCookie, setCloudOAuthStateCookie } from '@/lib/cloud/oauth-state';
import { isCloudProviderId } from '@/lib/cloud/types';
import { getAuthContext } from '@/lib/auth-context';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { isAdminRole } from '@/lib/role-utils';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed', reason: 'csrf_mismatch' }, { status: 403 })
    );
  }

  const { provider } = await context.params;
  if (!isCloudProviderId(provider)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unsupported cloud provider.' }, { status: 400 }));
  }

  const authContext = await getAuthContext(req);
  if (!authContext?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  if (!authContext.orgId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Workspace context is missing.' }, { status: 400 }));
  }

  const rawBody = await req.json().catch(() => ({}));
  const connectionScope = rawBody && typeof rawBody === 'object' && (rawBody as { scope?: unknown }).scope === 'workspace'
    ? 'workspace'
    : rawBody && typeof rawBody === 'object' && (rawBody as { scope?: unknown }).scope === undefined
      ? 'user'
      : null;
  if (!connectionScope) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid cloud connection scope.' }, { status: 400 }));
  }
  if (connectionScope === 'workspace' && !isAdminRole(authContext.orgRole)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Workspace admin access is required.' }, { status: 403 }));
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: authContext.orgId, feature: 'cloud_library' });
  if (!planGate.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGate.message }, { status: planGate.status })
    );
  }

  try {
    const state = createCloudStateToken();
    const authorizationUrl = buildCloudProviderAuthorizationUrl(provider, req, state);
    const response = NextResponse.json({ authorizationUrl }, { status: 200 });
    clearCloudOAuthStateCookie(response);
    setCloudOAuthStateCookie(response, {
      state,
      provider,
      userId: authContext.userId,
      connectionScope,
      orgId: authContext.orgId,
      redirectPath: connectionScope === 'workspace' ? '/dashboard/account/cloud-storages' : '/dashboard/account/integrations',
    });

    await writeAuditEvent({
      userId: authContext.userId,
      orgId: authContext.orgId,
      action: 'cloud.connection.connect_started',
      ipAddress,
      userAgent,
      metadata: { provider, connectionScope },
    });

    return withSecurityHeaders(req, response);
  } catch (error) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: error instanceof Error ? error.message : 'Unable to start the cloud connection.',
        },
        { status: 503 }
      )
    );
  }
}
