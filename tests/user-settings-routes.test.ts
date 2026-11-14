import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/models/Users', () => ({
  default: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('@/middleware/authMiddleware', () => ({
  authenticateRequest: vi.fn(),
}));

import { GET, PATCH } from '@/app/api/user/settings/route';
import { authenticateRequest } from '@/middleware/authMiddleware';
import { writeAuditEvent } from '@/lib/audit';
import UserModel from '@/models/Users';

type QueryMock = {
  select: ReturnType<typeof vi.fn>;
  lean: ReturnType<typeof vi.fn>;
};

type UpdateMock = {
  exec: ReturnType<typeof vi.fn>;
};

const authenticateRequestMock = vi.mocked(authenticateRequest);
const writeAuditEventMock = vi.mocked(writeAuditEvent);
const userModelMock = UserModel as unknown as {
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

describe('user settings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normalized settings with defaults', async () => {
    authenticateRequestMock.mockResolvedValue({
      ok: true,
      context: {
        user: {
          _id: 'user-1',
          email: 'user@example.com',
          role: 'user',
          tokenVersion: 1,
          mfaEnabled: false,
          mfaSecret: null,
        },
        sessionId: 'session-1',
        token: {},
      },
    } as Awaited<ReturnType<typeof authenticateRequest>>);

    userModelMock.findById.mockReturnValue(
      createFindByIdMock({
        settings: {
          displayEsignId: false,
          timeZone: '',
          dateFormat: 'DD/MM/YYYY (EU)',
        },
      })
    );

    const req = new NextRequest('http://localhost/api/user/settings', { method: 'GET' });
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.displayEsignId).toBe(false);
    expect(payload.timeZone).toBe('UTC');
    expect(payload.dateFormat).toBe('DD/MM/YYYY (EU)');
    expect(payload.defaultExpirationDays).toBe(14);
    expect(payload.autoReminders).toBe(true);
  });

  it('merges and persists updated settings', async () => {
    authenticateRequestMock.mockResolvedValue({
      ok: true,
      context: {
        user: {
          _id: 'user-1',
          email: 'user@example.com',
          role: 'user',
          tokenVersion: 1,
          mfaEnabled: false,
          mfaSecret: null,
        },
        sessionId: 'session-1',
        token: {},
      },
    } as Awaited<ReturnType<typeof authenticateRequest>>);

    userModelMock.findById.mockReturnValue(
      createFindByIdMock({
        settings: {
          displayEsignId: false,
          notifyOnViewed: true,
          defaultExpirationDays: 14,
          autoReminders: true,
        },
      })
    );

    const updateExec = createUpdateOneMock();
    userModelMock.updateOne.mockReturnValue(updateExec);

    const req = new NextRequest('http://localhost/api/user/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultSigningMode: 'sequential',
        defaultExpirationDays: 30,
        autoReminders: false,
        reminderIntervalDays: 5,
        timeZone: 'America/New_York',
        locale: 'fr-FR',
        notifyOnViewed: false,
        loginAlerts: false,
      }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.settings.defaultSigningMode).toBe('sequential');
    expect(payload.settings.defaultExpirationDays).toBe(30);
    expect(payload.settings.autoReminders).toBe(false);
    expect(payload.settings.reminderIntervalDays).toBe(5);
    expect(payload.settings.locale).toBe('fr-FR');
    expect(payload.settings.timeZone).toBe('America/New_York');
    expect(payload.settings.displayEsignId).toBe(false);

    expect(userModelMock.updateOne).toHaveBeenCalledWith(
      { _id: 'user-1' },
      {
        $set: {
          settings: expect.objectContaining({
            defaultSigningMode: 'sequential',
            defaultExpirationDays: 30,
            autoReminders: false,
            reminderIntervalDays: 5,
            timeZone: 'America/New_York',
            locale: 'fr-FR',
            notifyOnViewed: false,
            displayEsignId: false,
          }),
        },
      }
    );
    expect(updateExec.exec).toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.settings.updated',
        userId: 'user-1',
        metadata: { sessionId: 'session-1' },
      })
    );
  });
});
