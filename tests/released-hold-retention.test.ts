import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/retention', () => ({
  computeRetentionFields: vi.fn(),
  buildRetentionUpdatePayload: vi.fn(),
}));

vi.mock('@/models/RetentionPolicy', () => ({
  default: {
    findById: vi.fn(),
  },
}));

import { buildReleasedHoldRetentionUpdate } from '@/lib/released-hold-retention';
import { buildRetentionUpdatePayload, computeRetentionFields } from '@/lib/retention';
import RetentionPolicyModel from '@/models/RetentionPolicy';

const computeRetentionFieldsMock = vi.mocked(computeRetentionFields);
const buildRetentionUpdatePayloadMock = vi.mocked(buildRetentionUpdatePayload);

const retentionPolicyModelMock = RetentionPolicyModel as unknown as {
  findById: ReturnType<typeof vi.fn>;
};

describe('released hold retention override handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    computeRetentionFieldsMock.mockResolvedValue({
      policy: { name: 'Pinned Policy' },
      triggerEvent: 'completedAt',
      triggerAt: new Date('2026-01-01T00:00:00.000Z'),
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      endAt: new Date('2027-01-01T00:00:00.000Z'),
      status: 'active',
    });
    buildRetentionUpdatePayloadMock.mockReturnValue({
      'retention.status': 'active',
      'retention.policy': { name: 'Pinned Policy' },
    });
  });

  it('reuses the stored manual override policy document during hold release recompute', async () => {
    const pinnedPolicy = {
      _id: 'policy-1',
      orgId: 'org-1',
      name: 'Pinned Policy',
      docType: '*',
      jurisdiction: '*',
      triggerEvent: 'completedAt',
      durationDays: 365,
      priority: 50,
      active: true,
    };
    retentionPolicyModelMock.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(pinnedPolicy),
    });

    await buildReleasedHoldRetentionUpdate(
      {
        _id: 'doc-1',
        orgId: 'org-1',
        retention: {
          status: 'on_hold',
          docType: 'msa',
          jurisdiction: 'IN',
          policySelection: 'manual',
          policyOverrideId: 'policy-1',
          policy: {
            policyId: 'policy-1',
            name: 'Pinned Policy',
            triggerEvent: 'completedAt',
            durationDays: 365,
          },
        },
      } as never,
      new Date('2026-02-01T00:00:00.000Z')
    );

    expect(computeRetentionFieldsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: pinnedPolicy,
      })
    );
  });

  it('falls back to the stored policy snapshot when the manual override row no longer exists', async () => {
    retentionPolicyModelMock.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    await buildReleasedHoldRetentionUpdate(
      {
        _id: 'doc-1',
        orgId: 'org-1',
        retention: {
          status: 'on_hold',
          docType: 'msa',
          jurisdiction: 'IN',
          policySelection: 'manual',
          policyOverrideId: 'policy-1',
          policy: {
            policyId: 'policy-1',
            name: 'Pinned Policy',
            docType: '*',
            jurisdiction: '*',
            triggerEvent: 'completedAt',
            durationDays: 365,
            priority: 50,
          },
        },
      } as never,
      new Date('2026-02-01T00:00:00.000Z')
    );

    expect(computeRetentionFieldsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({
          name: 'Pinned Policy',
          triggerEvent: 'completedAt',
          durationDays: 365,
          priority: 50,
        }),
      })
    );
  });
});
