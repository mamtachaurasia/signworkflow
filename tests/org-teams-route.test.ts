import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  ensureBusinessPlanRoomForNewTeam: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  isSecureRequest: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/Team', () => ({
  default: {
    create: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Users', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/models/Membership', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/lib/subscription-server', () => ({
  ensureBusinessPlanRoomForNewTeam: mocks.ensureBusinessPlanRoomForNewTeam,
  getOrganizationPlanSnapshot: vi.fn(),
}));

import { POST } from '@/app/api/orgs/teams/route';

describe('org teams route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks creating a second team when the plan limit has been reached', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'owner-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.ensureBusinessPlanRoomForNewTeam.mockResolvedValue({
      allowed: false,
      status: 403,
      message: 'Business Plus is required to create more than one team.',
    });

    const req = new NextRequest('https://example.com/api/orgs/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second Team' }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.message).toMatch(/business plus/i);
  });
});
