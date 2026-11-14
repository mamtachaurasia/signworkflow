import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AUTH_LOGIN_USER_SELECT } from '@/lib/auth-user-select';

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  withSecurityHeaders: vi.fn((_req, res) => res),
  issueSessionForUser: vi.fn(),
  resolveAuthOrgState: vi.fn(),
  toClientAuthUser: vi.fn((safeUser, authOrgState) => ({
    ...safeUser,
    role: authOrgState.effectiveRole,
    orgId: authOrgState.orgContext ? String(authOrgState.orgContext.orgId) : null,
    orgRole: authOrgState.orgContext?.role ?? null,
  })),
  consumeRateLimit: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: mocks.compare,
  },
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  withSecurityHeaders: mocks.withSecurityHeaders,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/lib/auth-session', () => ({
  applyAuthSessionCookies: vi.fn(),
  issueSessionForUser: mocks.issueSessionForUser,
  resolveAuthOrgState: mocks.resolveAuthOrgState,
  toClientAuthUser: mocks.toClientAuthUser,
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/jwt', () => ({
  isJwtConfigurationError: vi.fn(() => false),
}));

vi.mock('@/lib/email', () => ({
  sendLoginAlertEmail: vi.fn(),
}));

vi.mock('@/lib/mfa', () => ({
  isMfaConfigurationError: vi.fn(() => false),
  verifyTotpCode: vi.fn(() => true),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

vi.mock('@/lib/user-status', () => ({
  isUserAllowed: vi.fn(() => true),
}));

vi.mock('@/lib/user-settings', () => ({
  normalizeUserSettings: vi.fn(() => ({ loginAlerts: false })),
}));

vi.mock('@/models/Session', () => ({
  default: {
    exists: vi.fn(),
  },
}));

vi.mock('@/models/Users', () => ({
  default: {
    findOne: mocks.findOne,
    updateOne: mocks.updateOne,
  },
}));

vi.mock('@/lib/user-deletion', () => ({
  getDeletionWindowState: vi.fn(() => ({
    canRestore: false,
    deletionScheduledAt: null,
  })),
}));

import { POST } from '@/app/api/auth/login/route';

function createExecResult(value: unknown) {
  return {
    exec: vi.fn().mockResolvedValue(value),
  };
}

describe('auth login route without org access', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.consumeRateLimit.mockResolvedValue({ allowed: true });
    mocks.compare.mockResolvedValue(true);
    mocks.updateOne.mockReturnValue(createExecResult({ acknowledged: true }));
    mocks.resolveAuthOrgState.mockResolvedValue({
      orgContext: null,
      effectiveRole: 'user',
    });
    mocks.issueSessionForUser.mockImplementation(async ({ user }) => ({
      sessionId: 'session-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshExpiresAt: new Date('2026-04-01T00:00:00.000Z'),
      accessTokenTtl: '15m',
      safeUser: {
        id: 'user-1',
        email: user.email,
        role: user.role,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        picture: user.picture || '',
      },
    }));

    const userRecord = {
      _id: 'user-1',
      email: 'member@example.com',
      firstName: 'Member',
      lastName: 'User',
      picture: '',
      tokenVersion: 0,
      primaryOrgId: 'org-1',
      passwordHash: 'stored-hash',
      password: 'stored-hash',
      mfaEnabled: false,
      settings: {},
      isDeleted: false,
      failedLoginAttempts: 0,
      lockUntil: null,
    };

    const query = {
      select: vi.fn(() => query),
      exec: vi.fn().mockResolvedValue(userRecord),
    };

    mocks.findOne.mockReturnValue(query);
  });

  it('returns a valid session with a null org context for removed members', async () => {
    const req = new NextRequest('https://example.com/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'secret123',
        deviceInfo: 'web',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.user).toEqual(
      expect.objectContaining({
        id: 'user-1',
        email: 'member@example.com',
        role: 'user',
        orgId: null,
        orgRole: null,
      })
    );
    expect(mocks.issueSessionForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          _id: 'user-1',
          role: 'user',
        }),
      })
    );
    expect(mocks.resolveAuthOrgState).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'user-1',
        primaryOrgId: 'org-1',
      }),
      { bootstrapIfMissing: true }
    );
    expect(mocks.findOne.mock.results[0]?.value.select).toHaveBeenCalledWith(
      AUTH_LOGIN_USER_SELECT
    );
  });
});
