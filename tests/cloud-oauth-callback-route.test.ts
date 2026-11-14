import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  readCloudOAuthState: vi.fn(),
  clearCloudOAuthStateCookie: vi.fn(),
  completeCloudProviderAuthorization: vi.fn(),
  upsertCloudConnectionForUser: vi.fn(),
  upsertWorkspaceCloudConnection: vi.fn(),
  writeAuditEvent: vi.fn(),
  connectDB: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/lib/cloud/common', () => ({
  getCloudBaseUrl: vi.fn(() => 'https://example.com'),
}));

vi.mock('@/lib/cloud/oauth-state', () => ({
  readCloudOAuthState: mocks.readCloudOAuthState,
  clearCloudOAuthStateCookie: mocks.clearCloudOAuthStateCookie,
}));

vi.mock('@/lib/cloud/providers', () => ({
  completeCloudProviderAuthorization: mocks.completeCloudProviderAuthorization,
}));

vi.mock('@/lib/cloud/connections', () => ({
  upsertCloudConnectionForUser: mocks.upsertCloudConnectionForUser,
  upsertWorkspaceCloudConnection: mocks.upsertWorkspaceCloudConnection,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature,
}));

import { GET } from '@/app/api/cloud/oauth/[provider]/callback/route';

describe('cloud oauth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.readCloudOAuthState.mockReturnValue({
      state: 'state-1',
      provider: 'google_drive',
      userId: 'user-1',
      redirectPath: '/dashboard/account/integrations',
      expiresAt: Date.now() + 60_000,
    });
    mocks.getPlanGateForOrgFeature.mockResolvedValue({
      allowed: true,
      status: 200,
      message: null,
    });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.completeCloudProviderAuthorization.mockResolvedValue({
      providerAccountId: 'acct-1',
      email: 'owner@example.com',
      displayName: 'Owner Account',
      refreshToken: 'refresh-1',
      scopes: ['drive.file'],
      metadata: {},
    });
  });

  it('completes the connection and redirects back to integrations', async () => {
    const req = new NextRequest(
      'https://example.com/api/cloud/oauth/google_drive/callback?state=state-1&code=code-1'
    );

    const res = await GET(req, {
      params: Promise.resolve({ provider: 'google_drive' }),
    });

    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/dashboard/account/integrations');
    expect(location).toContain('cloud_status=connected');
    expect(location).toContain('message=Owner+Account+connected+successfully.');
    expect(mocks.upsertCloudConnectionForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'google_drive',
      account: expect.objectContaining({
        providerAccountId: 'acct-1',
      }),
    });
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cloud.connection.connected',
      })
    );
  });

  it('rejects the callback if the workspace no longer has cloud library access', async () => {
    mocks.getPlanGateForOrgFeature.mockResolvedValue({
      allowed: false,
      status: 403,
      message: 'Business is required to manage cloud-backed signed document storage.',
    });

    const req = new NextRequest(
      'https://example.com/api/cloud/oauth/google_drive/callback?state=state-1&code=code-1'
    );

    const res = await GET(req, {
      params: Promise.resolve({ provider: 'google_drive' }),
    });

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('cloud_status=error');
    expect(mocks.completeCloudProviderAuthorization).not.toHaveBeenCalled();
    expect(mocks.upsertCloudConnectionForUser).not.toHaveBeenCalled();
  });

  it('stores an administrator OAuth completion as a workspace-owned connection', async () => {
    mocks.readCloudOAuthState.mockReturnValue({
      state: 'state-1',
      provider: 'google_drive',
      userId: 'user-1',
      connectionScope: 'workspace',
      orgId: 'org-1',
      redirectPath: '/dashboard/account/cloud-storages',
      expiresAt: Date.now() + 60_000,
    });
    const req = new NextRequest(
      'https://example.com/api/cloud/oauth/google_drive/callback?state=state-1&code=code-1'
    );

    const res = await GET(req, { params: Promise.resolve({ provider: 'google_drive' }) });

    expect(res.status).toBe(307);
    expect(mocks.upsertWorkspaceCloudConnection).toHaveBeenCalledWith({
      orgId: 'org-1',
      connectedBy: 'user-1',
      provider: 'google_drive',
      account: expect.objectContaining({ providerAccountId: 'acct-1' }),
    });
    expect(mocks.upsertCloudConnectionForUser).not.toHaveBeenCalled();
  });
});
