import { beforeEach, describe, expect, it, vi } from 'vitest';

const modelMocks = vi.hoisted(() => ({
  userUpdateExec: vi.fn(),
  sessionUpdateExec: vi.fn(),
  membershipUpdateExec: vi.fn(),
  userUpdateOne: vi.fn(),
  sessionUpdateMany: vi.fn(),
  membershipUpdateMany: vi.fn(),
}));

vi.mock('@/models/Users', () => ({
  default: {
    updateOne: modelMocks.userUpdateOne,
  },
}));

vi.mock('@/models/Session', () => ({
  default: {
    updateMany: modelMocks.sessionUpdateMany,
  },
}));

vi.mock('@/models/Membership', () => ({
  default: {
    updateMany: modelMocks.membershipUpdateMany,
  },
}));

import { softDeleteUserAndRevokeSessions } from '@/lib/auth-session';

describe('softDeleteUserAndRevokeSessions', () => {
  beforeEach(() => {
    modelMocks.userUpdateExec.mockResolvedValue({});
    modelMocks.sessionUpdateExec.mockResolvedValue({});
    modelMocks.membershipUpdateExec.mockResolvedValue({});
    modelMocks.userUpdateOne.mockReturnValue({ exec: modelMocks.userUpdateExec });
    modelMocks.sessionUpdateMany.mockReturnValue({ exec: modelMocks.sessionUpdateExec });
    modelMocks.membershipUpdateMany.mockReturnValue({ exec: modelMocks.membershipUpdateExec });
  });

  it('only marks active memberships as disabled by account deletion', async () => {
    await softDeleteUserAndRevokeSessions('user-1');

    expect(modelMocks.membershipUpdateMany).toHaveBeenCalledWith(
      { userId: 'user-1', status: 'active' },
      { $set: { status: 'disabled', disabledReason: 'user_deleted' } }
    );
  });
});
