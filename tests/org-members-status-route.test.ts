import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: vi.fn(() =>
    Promise.resolve({ allowed: true, plan: 'business', normalizedTier: 'business' })
  ),
}));

vi.mock('@/models/Membership', () => ({
  default: {
    findOne: vi.fn(),
    countDocuments: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

vi.mock('@/models/Users', () => ({
  default: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('@/models/Team', () => ({
  default: {
    updateMany: vi.fn(),
  },
}));

import { DELETE, PATCH } from '@/app/api/orgs/members/[memberId]/route';
import { getAuthContext } from '@/lib/auth-context';
import { writeAuditEvent } from '@/lib/audit';
import MembershipModel from '@/models/Membership';
import TeamModel from '@/models/Team';
import Users from '@/models/Users';

const getAuthContextMock = vi.mocked(getAuthContext);
const writeAuditEventMock = vi.mocked(writeAuditEvent);

const membershipModelMock = MembershipModel as unknown as {
  findOne: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  deleteOne: ReturnType<typeof vi.fn>;
};

const usersModelMock = Users as unknown as {
  findById: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
};

const teamModelMock = TeamModel as unknown as {
  updateMany: ReturnType<typeof vi.fn>;
};

function createQuery<T>(value: T) {
  const query = {
    select: vi.fn(() => query),
    sort: vi.fn(() => query),
    lean: vi.fn().mockResolvedValue(value),
  };

  return query;
}

function createExecResult() {
  return {
    exec: vi.fn().mockResolvedValue({ acknowledged: true }),
  };
}

describe('org member status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthContextMock.mockResolvedValue({
      userId: '507f1f77bcf86cd799439001',
      orgId: '507f1f77bcf86cd799439010',
      orgRole: 'owner',
    });
  });

  it('disables organization access for a non-owner member', async () => {
    membershipModelMock.findOne
      .mockReturnValueOnce(
        createQuery({
          userId: '507f1f77bcf86cd799439002',
          role: 'user',
          status: 'active',
        })
      )
      .mockReturnValueOnce(createQuery(null));

    const membershipUpdateExec = createExecResult();
    membershipModelMock.updateOne.mockReturnValue(membershipUpdateExec);

    usersModelMock.findById.mockReturnValue(
      createQuery({
        primaryOrgId: '507f1f77bcf86cd799439010',
      })
    );

    const req = new NextRequest('http://localhost/api/orgs/members/507f1f77bcf86cd799439002', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ memberId: '507f1f77bcf86cd799439002' }),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      userId: '507f1f77bcf86cd799439002',
      status: 'disabled',
    });
    expect(membershipModelMock.updateOne).toHaveBeenCalledWith(
      { orgId: '507f1f77bcf86cd799439010', userId: '507f1f77bcf86cd799439002' },
      {
        $set: {
          status: 'disabled',
          disabledReason: 'admin',
        },
      }
    );
    expect(membershipUpdateExec.exec).toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'org_member_access_disabled',
        orgId: '507f1f77bcf86cd799439010',
        userId: '507f1f77bcf86cd799439001',
      })
    );
  });

  it('prevents disabling the last active owner', async () => {
    membershipModelMock.findOne.mockReturnValue(
      createQuery({
        userId: '507f1f77bcf86cd799439002',
        role: 'owner',
        status: 'active',
      })
    );
    membershipModelMock.countDocuments.mockResolvedValue(1);

    const req = new NextRequest('http://localhost/api/orgs/members/507f1f77bcf86cd799439002', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ memberId: '507f1f77bcf86cd799439002' }),
    });
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.message).toBe('At least one active owner is required.');
    expect(membershipModelMock.updateOne).not.toHaveBeenCalled();
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });

  it('removes a disabled member from the organization and team assignments', async () => {
    membershipModelMock.findOne
      .mockReturnValueOnce(
        createQuery({
          userId: '507f1f77bcf86cd799439002',
          role: 'user',
          status: 'disabled',
        })
      )
      .mockReturnValueOnce(createQuery(null));

    const teamUpdateExec = createExecResult();
    const membershipDeleteExec = createExecResult();
    teamModelMock.updateMany.mockReturnValue(teamUpdateExec);
    membershipModelMock.deleteOne = vi.fn().mockReturnValue(membershipDeleteExec);
    usersModelMock.updateOne.mockReturnValue(createExecResult());

    const req = new NextRequest('http://localhost/api/orgs/members/507f1f77bcf86cd799439002', {
      method: 'DELETE',
    });

    const res = await DELETE(req, {
      params: Promise.resolve({ memberId: '507f1f77bcf86cd799439002' }),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      userId: '507f1f77bcf86cd799439002',
      removed: true,
    });
    expect(teamModelMock.updateMany).toHaveBeenCalledWith(
      { orgId: '507f1f77bcf86cd799439010', memberIds: '507f1f77bcf86cd799439002' },
      { $pull: { memberIds: '507f1f77bcf86cd799439002' }, $set: { updatedBy: '507f1f77bcf86cd799439001' } }
    );
    expect(teamUpdateExec.exec).toHaveBeenCalled();
    expect(membershipModelMock.deleteOne).toHaveBeenCalledWith({
      orgId: '507f1f77bcf86cd799439010',
      userId: '507f1f77bcf86cd799439002',
    });
    expect(membershipDeleteExec.exec).toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'org_member_removed',
        orgId: '507f1f77bcf86cd799439010',
        userId: '507f1f77bcf86cd799439001',
      })
    );
  });
});
