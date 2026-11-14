import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/lib/org-settings-server', () => ({
  getOrganizationSettingsByOrgId: vi.fn(),
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: vi.fn(() => Promise.resolve({ allowed: true, plan: 'business_plus', normalizedTier: 'business_plus' })),
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn(),
}));

vi.mock('@/models/Organization', () => ({
  default: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));

import { GET, PATCH } from '@/app/api/orgs/settings/route';
import { getAuthContext } from '@/lib/auth-context';
import { writeAuditEvent } from '@/lib/audit';
import { getOrganizationSettingsByOrgId } from '@/lib/org-settings-server';
import OrganizationModel from '@/models/Organization';

type QueryMock = {
  select: ReturnType<typeof vi.fn>;
  lean: ReturnType<typeof vi.fn>;
};

type UpdateMock = {
  exec: ReturnType<typeof vi.fn>;
};

const getAuthContextMock = vi.mocked(getAuthContext);
const writeAuditEventMock = vi.mocked(writeAuditEvent);
const getOrganizationSettingsByOrgIdMock = vi.mocked(getOrganizationSettingsByOrgId);
const organizationModelMock = OrganizationModel as unknown as {
  findById: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
};

function createFindByIdMock(value: unknown): QueryMock {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

function createUpdateOneMock(): UpdateMock {
  return {
    exec: vi.fn().mockResolvedValue({}),
  };
}

describe('organization settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns current organization settings for active members', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'user',
    });
    getOrganizationSettingsByOrgIdMock.mockResolvedValue({
      organizationId: 'org-1',
      organizationName: 'Acme Org',
      brandName: 'Acme Sign',
      settings: {
        branding: {
          brandName: 'Acme Sign',
          primaryColor: '#0f766e',
          supportEmail: 'support@acme.test',
        },
        documentDefaults: {
          defaultSigningMode: 'parallel',
          defaultExpirationDays: 14,
          autoReminders: true,
          reminderIntervalDays: 3,
        },
        notificationRules: {
          emailDigest: 'immediate',
          notifyOnViewed: true,
          notifyOnSigned: true,
          notifyOnCompleted: true,
          notifyOnDeclined: true,
          inviteSubject: 'Org subject',
          inviteMessage: 'Org message',
        },
        defaultRetention: {
          enabled: false,
          triggerEvent: 'completedAt',
          durationDays: 365,
          regime: '',
        },
      },
    });

    const req = new NextRequest('http://localhost/api/orgs/settings', { method: 'GET' });
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.organizationName).toBe('Acme Org');
    expect(payload.brandName).toBe('Acme Sign');
    expect(payload.orgRole).toBe('user');
    expect(getOrganizationSettingsByOrgIdMock).toHaveBeenCalledWith('org-1');
  });

  it('blocks non-admin users from updating org settings', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'user',
    });

    const req = new NextRequest('http://localhost/api/orgs/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branding: { brandName: 'Blocked' } }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.message).toMatch(/insufficient permissions/i);
  });

  it('persists normalized settings updates for admins', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'admin-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
    organizationModelMock.findById.mockReturnValue(
      createFindByIdMock({
        _id: 'org-1',
        name: 'Acme Org',
        settings: {
          branding: {
            brandName: 'Acme Org',
            primaryColor: '#2563eb',
            supportEmail: '',
          },
          defaultRetention: {
            enabled: false,
            triggerEvent: 'completedAt',
            durationDays: 365,
            regime: '',
          },
        },
      })
    );
    const updateExec = createUpdateOneMock();
    organizationModelMock.updateOne.mockReturnValue(updateExec);

    const req = new NextRequest('http://localhost/api/orgs/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branding: {
          brandName: 'Acme Sign',
          primaryColor: '#0f766e',
          supportEmail: 'support@acme.test',
        },
        defaultRetention: {
          enabled: true,
          durationDays: 90,
          triggerEvent: 'finalizedAt',
        },
      }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(organizationModelMock.updateOne).toHaveBeenCalledWith(
      { _id: 'org-1' },
      {
        $set: {
          settings: expect.objectContaining({
            branding: expect.objectContaining({
              brandName: 'Acme Sign',
              primaryColor: '#0f766e',
              supportEmail: 'support@acme.test',
            }),
            defaultRetention: expect.objectContaining({
              enabled: true,
              durationDays: 90,
              triggerEvent: 'finalizedAt',
            }),
          }),
        },
      }
    );
    expect(updateExec.exec).toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'org.settings.updated',
        orgId: 'org-1',
        userId: 'admin-1',
      })
    );
  });
});
