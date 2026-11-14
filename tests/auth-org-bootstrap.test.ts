import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureUserOrg: vi.fn(),
  getActiveOrgContextForUser: vi.fn(),
}));

vi.mock('@/lib/orgs', () => ({
  ensureUserOrg: mocks.ensureUserOrg,
  getActiveOrgContextForUser: mocks.getActiveOrgContextForUser,
}));

import { resolveAuthOrgState } from '@/lib/auth-session';

describe('resolveAuthOrgState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not bootstrap a workspace unless explicitly requested', async () => {
    mocks.getActiveOrgContextForUser.mockResolvedValue(null);

    const result = await resolveAuthOrgState({
      _id: 'user-1',
      primaryOrgId: null,
    });

    expect(mocks.getActiveOrgContextForUser).toHaveBeenCalledWith('user-1');
    expect(mocks.ensureUserOrg).not.toHaveBeenCalled();
    expect(result).toEqual({
      orgContext: null,
      effectiveRole: 'user',
    });
  });

  it('still supports explicit org bootstrap when requested', async () => {
    mocks.ensureUserOrg.mockResolvedValue({
      orgId: 'org-1',
      role: 'owner',
    });

    const result = await resolveAuthOrgState(
      {
        _id: 'user-1',
        primaryOrgId: null,
      },
      { bootstrapIfMissing: true }
    );

    expect(mocks.ensureUserOrg).toHaveBeenCalledWith('user-1');
    expect(mocks.getActiveOrgContextForUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      orgContext: {
        orgId: 'org-1',
        role: 'owner',
      },
      effectiveRole: 'owner',
    });
  });
});
