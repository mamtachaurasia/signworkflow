import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  writeAuditEvent: vi.fn(),
  createCloudStateToken: vi.fn(),
  buildCloudProviderAuthorizationUrl: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

vi.mock('@/lib/cloud/common', () => ({
  createCloudStateToken: mocks.createCloudStateToken,
}));

vi.mock('@/lib/cloud/providers', () => ({
  buildCloudProviderAuthorizationUrl: mocks.buildCloudProviderAuthorizationUrl,
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature,
}));

import { POST } from '@/app/api/cloud/connections/[provider]/connect/route';

describe('cloud connect route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getPlanGateForOrgFeature.mockResolvedValue({
      allowed: true,
      status: 200,
      message: null,
    });
    mocks.createCloudStateToken.mockReturnValue('state-1');
    mocks.buildCloudProviderAuthorizationUrl.mockReturnValue(
      'https://accounts.example.test/oauth?state=state-1'
    );
  });

  it('starts a delegated OAuth connection for an eligible workspace member', async () => {
    const req = new NextRequest('https://example.com/api/cloud/connections/google_drive/connect', {
      method: 'POST',
    });

    const res = await POST(req, {
      params: Promise.resolve({ provider: 'google_drive' }),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.authorizationUrl).toBe('https://accounts.example.test/oauth?state=state-1');
    expect(res.headers.get('set-cookie')).toContain('cloud_oauth_state=');
    expect(mocks.getPlanGateForOrgFeature).toHaveBeenCalledWith({
      orgId: 'org-1',
      feature: 'cloud_library',
    });
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cloud.connection.connect_started',
        metadata: { provider: 'google_drive', connectionScope: 'user' },
      })
    );
  });

  it('returns a provider configuration error instead of throwing', async () => {
    mocks.buildCloudProviderAuthorizationUrl.mockImplementation(() => {
      throw new Error('Google Drive is not configured. Missing: GOOGLE_DRIVE_CLIENT_ID');
    });

    const req = new NextRequest('https://example.com/api/cloud/connections/google_drive/connect', {
      method: 'POST',
    });

    const res = await POST(req, {
      params: Promise.resolve({ provider: 'google_drive' }),
    });
    const payload = await res.json();

    expect(res.status).toBe(503);
    expect(payload.message).toMatch(/google drive is not configured/i);
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });
});
