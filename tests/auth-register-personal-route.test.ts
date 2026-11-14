import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  hash: vi.fn(),
  ensureUserOrg: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: mocks.hash,
  },
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  isSecureRequest: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

vi.mock('@/lib/orgs', () => ({
  ensureUserOrg: mocks.ensureUserOrg,
}));

vi.mock('@/models/Users', () => ({
  default: {
    findOne: mocks.findOne,
    create: mocks.create,
  },
}));

vi.mock('@/lib/user-deletion', () => ({
  getDeletionWindowState: vi.fn(() => ({
    canRestore: false,
    deletionScheduledAt: null,
  })),
}));

import { POST } from '@/app/api/auth/register/route';

function createLeanQuery(value: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

describe('auth register route trial bootstrap behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true });
    mocks.hash.mockResolvedValue('hashed-password');
    mocks.findOne.mockReturnValue(createLeanQuery(null));
    mocks.ensureUserOrg.mockResolvedValue({
      orgId: 'org-1',
      role: 'owner',
    });
    mocks.create.mockResolvedValue({
      _id: 'user-1',
      email: 'new@example.com',
    });
  });

  it('creates a trial workspace for a newly registered user', async () => {
    const req = new NextRequest('https://example.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New User',
        email: 'new@example.com',
        password: 'secret123',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        role: 'user',
      })
    );
    expect(payload.user).toEqual({
      id: 'user-1',
      email: 'new@example.com',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    expect(mocks.ensureUserOrg).toHaveBeenCalledWith('user-1');
  });
});
