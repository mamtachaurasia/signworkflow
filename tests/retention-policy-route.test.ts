import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/retention-admin', () => ({
  verifyRetentionAdmin: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: vi.fn(() =>
    Promise.resolve({ allowed: true, plan: 'business_plus', normalizedTier: 'business_plus' })
  ),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn(),
}));

vi.mock('@/models/RetentionPolicy', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
  },
}));

import { DELETE, PATCH } from '@/app/api/retention/policies/[policyId]/route';
import { getAuthContext } from '@/lib/auth-context';
import { verifyRetentionAdmin } from '@/lib/retention-admin';
import RetentionPolicyModel from '@/models/RetentionPolicy';

const verifyRetentionAdminMock = vi.mocked(verifyRetentionAdmin);
const getAuthContextMock = vi.mocked(getAuthContext);
const retentionPolicyModelMock = RetentionPolicyModel as unknown as {
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  findOneAndDelete: ReturnType<typeof vi.fn>;
};

describe('retention policy mutation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRetentionAdminMock.mockResolvedValue({ authorized: true });
    getAuthContextMock.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
  });

  it('restricts policy updates to the caller organization', async () => {
    retentionPolicyModelMock.findOneAndUpdate.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/retention/policies/policy-global', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated shared policy' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ policyId: 'policy-global' }) });
    const payload = await res.json();

    expect(res.status).toBe(404);
    expect(payload.message).toBe('Policy not found');
    expect(retentionPolicyModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'policy-global', orgId: 'org-1' },
      { name: 'Updated shared policy' },
      { new: true }
    );
  });

  it('restricts policy deletion to the caller organization', async () => {
    retentionPolicyModelMock.findOneAndDelete.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/retention/policies/policy-global', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: Promise.resolve({ policyId: 'policy-global' }) });
    const payload = await res.json();

    expect(res.status).toBe(404);
    expect(payload.message).toBe('Policy not found');
    expect(retentionPolicyModelMock.findOneAndDelete).toHaveBeenCalledWith({
      _id: 'policy-global',
      orgId: 'org-1',
    });
  });
});
