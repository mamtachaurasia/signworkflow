import { beforeEach, describe, expect, it, vi } from 'vitest';

const { retentionPolicyFindMock, organizationFindByIdMock } = vi.hoisted(() => ({
  retentionPolicyFindMock: vi.fn(),
  organizationFindByIdMock: vi.fn(),
}));

vi.mock('@/models/RetentionPolicy', () => ({
  default: {
    find: retentionPolicyFindMock,
  },
}));

vi.mock('@/models/Organization', () => ({
  default: {
    findById: organizationFindByIdMock,
  },
}));

import { resolveRetentionPolicy } from '@/lib/retention';

describe('resolveRetentionPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes retention policy lookup to the document organization', async () => {
    retentionPolicyFindMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'policy-1',
          name: 'Org policy',
          docType: '*',
          jurisdiction: '*',
          triggerEvent: 'completedAt',
          durationDays: 365,
          active: true,
          orgId: 'org-1',
        },
      ]),
    });

    const policy = await resolveRetentionPolicy({
      orgId: 'org-1',
      retention: {},
    } as never);

    expect(retentionPolicyFindMock).toHaveBeenCalledWith({ active: true, orgId: 'org-1' });
    expect(policy?.name).toBe('Org policy');
  });

  it('falls back to organization default retention when no explicit policy matches', async () => {
    retentionPolicyFindMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    organizationFindByIdMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          settings: {
            defaultRetention: {
              enabled: true,
              triggerEvent: 'finalizedAt',
              durationDays: 90,
              regime: 'Internal policy',
            },
          },
        }),
      }),
    });

    const policy = await resolveRetentionPolicy({
      orgId: 'org-1',
      retention: {},
    } as never);

    expect(policy?.name).toBe('Workspace default retention');
    expect(policy?.triggerEvent).toBe('finalizedAt');
    expect(policy?.durationDays).toBe(90);
    expect(policy?.regime).toBe('Internal policy');
  });
});
