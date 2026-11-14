import { NextRequest, NextResponse } from 'next/server';

import { getClientIp, getUserAgent, isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { writeAuditEvent } from '@/lib/audit';
import { getCloudBaseUrl } from '@/lib/cloud/common';
import { upsertCloudConnectionForUser, upsertWorkspaceCloudConnection } from '@/lib/cloud/connections';
import { clearCloudOAuthStateCookie, readCloudOAuthState } from '@/lib/cloud/oauth-state';
import { completeCloudProviderAuthorization } from '@/lib/cloud/providers';
import { isCloudProviderId } from '@/lib/cloud/types';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { isAdminRole } from '@/lib/role-utils';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ provider: string }>;
};

function buildRedirect(req: NextRequest, pathname: string, params: Record<string, string | null | undefined>) {
  const url = new URL(pathname, getCloudBaseUrl(req));
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

function trimMessage(value: string): string {
  return value.trim().slice(0, 180);
}

export async function GET(req: NextRequest, context: RouteContext) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.redirect(
        buildRedirect(req, '/dashboard/account/integrations', {
          cloud_status: 'error',
          message: 'Secure HTTPS is required to finish the cloud connection.',
        })
      )
    );
  }

  const { provider } = await context.params;
  if (!isCloudProviderId(provider)) {
    return withSecurityHeaders(
      req,
      NextResponse.redirect(
        buildRedirect(req, '/dashboard/account/integrations', {
          cloud_status: 'error',
          message: 'Unsupported cloud provider.',
        })
      )
    );
  }

  const authContext = await getAuthContext(req);
  const oauthState = readCloudOAuthState(req);
  const redirectPath = oauthState?.redirectPath || '/dashboard/account/integrations';

  const finalizeRedirect = (params: Record<string, string | null | undefined>) => {
    const response = NextResponse.redirect(buildRedirect(req, redirectPath, params));
    clearCloudOAuthStateCookie(response);
    return withSecurityHeaders(req, response);
  };

  if (!authContext?.userId) {
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: 'Your session expired before the cloud connection finished. Please try again.',
    });
  }

  if (!oauthState || oauthState.provider !== provider || oauthState.userId !== authContext.userId) {
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: 'The cloud connection session could not be verified. Please try again.',
    });
  }

  const providerError = req.nextUrl.searchParams.get('error');
  const providerErrorDescription = req.nextUrl.searchParams.get('error_description');
  if (providerError) {
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: trimMessage(providerErrorDescription || providerError),
    });
  }

  const state = req.nextUrl.searchParams.get('state');
  const code = req.nextUrl.searchParams.get('code');
  if (!state || !code || state !== oauthState.state) {
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: 'The cloud connection response is invalid or expired. Please try again.',
    });
  }

  if (!authContext.orgId) {
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: 'Workspace context is missing. Please switch into a workspace and try again.',
    });
  }

  if (oauthState.connectionScope === 'workspace' && oauthState.orgId !== authContext.orgId) {
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: 'The workspace changed before this cloud connection was completed. Please try again.',
    });
  }
  if (oauthState.connectionScope === 'workspace' && !isAdminRole(authContext.orgRole)) {
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: 'Workspace admin access is required to connect an archive destination.',
    });
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: authContext.orgId, feature: 'cloud_library' });
  if (!planGate.allowed) {
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: planGate.message,
    });
  }

  try {
    await connectDB();
    const account = await completeCloudProviderAuthorization(provider, req, code);
    if (oauthState.connectionScope === 'workspace') {
      await upsertWorkspaceCloudConnection({
        orgId: authContext.orgId,
        connectedBy: authContext.userId,
        provider,
        account,
      });
    } else {
      await upsertCloudConnectionForUser({
        userId: authContext.userId,
        provider,
        account,
      });
    }

    await writeAuditEvent({
      userId: authContext.userId,
      orgId: authContext.orgId,
      action: 'cloud.connection.connected',
      ipAddress,
      userAgent,
      metadata: {
        provider,
        providerAccountId: account.providerAccountId,
        connectionScope: oauthState.connectionScope,
      },
    });

    return finalizeRedirect({
      cloud_status: 'connected',
      provider,
      message: `${account.displayName || account.email || 'Account'} connected successfully${oauthState.connectionScope === 'workspace' ? ' as a workspace archive destination' : ''}.`,
    });
  } catch (error) {
    console.error('Cloud OAuth callback failed:', error);
    return finalizeRedirect({
      cloud_status: 'error',
      provider,
      message: trimMessage(error instanceof Error ? error.message : 'Unable to finish the cloud connection.'),
    });
  }
}
