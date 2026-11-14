import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LegalHold', () => ({
  default: {
    find: vi.fn(),
  },
}));
vi.mock('@/models/Document', () => ({ default: {} }));
vi.mock('@/lib/audit', () => ({ writeAuditEvent: vi.fn() }));
vi.mock('@/lib/retention-admin', () => ({ verifyRetentionAdmin: vi.fn() }));
vi.mock('@/lib/auth-context', () => ({ getAuthContext: vi.fn() }));
vi.mock('@/lib/subscription-server', () => ({ getPlanGateForOrgFeature: vi.fn() }));

import { GET } from '@/app/api/retention/holds/route';
import { getAuthContext } from '@/lib/auth-context';
import { verifyRetentionAdmin } from '@/lib/retention-admin';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import LegalHoldModel from '@/models/LegalHold';

describe('legal hold workspace scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyRetentionAdmin).mockResolvedValue({ authorized: true });
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: 'admin-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
    vi.mocked(getPlanGateForOrgFeature).mockResolvedValue({
      allowed: true,
      status: 200,
      message: '',
    });
  });

  it('lists only holds assigned to the active workspace', async () => {
    const lean = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ lean });
    const find = vi.mocked(LegalHoldModel.find);
    find.mockReturnValue({ sort } as never);

    const response = await GET(new NextRequest('http://localhost/api/retention/holds'));

    expect(response.status).toBe(200);
    expect(find).toHaveBeenCalledWith({ orgId: 'org-1' });
    expect(find).not.toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.anything(),
      }),
    );
  });
});
