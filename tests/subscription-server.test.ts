import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  getActiveOrgContextForUser: vi.fn(),
  getBillingConfig: vi.fn(),
  getBillingConfigForMarket: vi.fn(),
  getBillingConfigForProvider: vi.fn(),
  getBillingProviderForMarket: vi.fn((market: string) =>
    market === 'india' ? 'razorpay' : 'paypal'
  ),
  getDefaultBillingMarket: vi.fn((country?: string) =>
    String(country || '').toLowerCase() === 'india' ? 'india' : 'international'
  ),
  getTierFromRazorpayPlanId: vi.fn(),
  getTierFromPayPalPlanId: vi.fn(),
  supportsSelfServeBilling: vi.fn((plan: string) =>
    ['business', 'business_plus', 'enterprise'].includes(plan)
  ),
  findOrganizationById: vi.fn(),
  countMemberships: vi.fn(),
  countTeams: vi.fn(),
  updateUser: vi.fn(),
  findUserById: vi.fn(),
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

vi.mock('@/lib/orgs', () => ({
  getActiveOrgContextForUser: mocks.getActiveOrgContextForUser,
}));

vi.mock('@/lib/billing', () => ({
  getBillingConfig: mocks.getBillingConfig,
  getBillingConfigForMarket: mocks.getBillingConfigForMarket,
  getBillingConfigForProvider: mocks.getBillingConfigForProvider,
  getBillingProviderForMarket: mocks.getBillingProviderForMarket,
  getDefaultBillingMarket: mocks.getDefaultBillingMarket,
  getTierFromRazorpayPlanId: mocks.getTierFromRazorpayPlanId,
  getTierFromPayPalPlanId: mocks.getTierFromPayPalPlanId,
  supportsSelfServeBilling: mocks.supportsSelfServeBilling,
}));

vi.mock('@/models/Organization', () => ({
  default: {
    findById: mocks.findOrganizationById,
  },
}));

vi.mock('@/models/Membership', () => ({
  default: {
    countDocuments: mocks.countMemberships,
  },
}));

vi.mock('@/models/Team', () => ({
  default: {
    countDocuments: mocks.countTeams,
  },
}));

vi.mock('@/models/Users', () => ({
  default: {
    updateOne: mocks.updateUser,
    findById: mocks.findUserById,
  },
}));

function mockOrganizationSnapshot(snapshot: Record<string, unknown> | null) {
  mocks.findOrganizationById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(snapshot),
    }),
  });
}

describe('subscription server plan normalization', () => {
  const orgId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.getActiveOrgContextForUser.mockResolvedValue({
      orgId,
      role: 'owner',
    });
    mocks.getBillingConfig.mockReturnValue({
      configured: true,
      provider: 'razorpay',
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage: null,
    });
    mocks.getBillingConfigForMarket.mockReturnValue({
      configured: true,
      provider: 'razorpay',
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage: null,
    });
    mocks.getBillingConfigForProvider.mockReturnValue({
      configured: true,
      provider: 'razorpay',
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage: null,
    });
    mocks.getTierFromRazorpayPlanId.mockReturnValue(null);
    mocks.getTierFromPayPalPlanId.mockReturnValue(null);
    mocks.countMemberships.mockResolvedValue(2);
    mocks.countTeams.mockResolvedValue(1);
    mocks.findUserById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          address: {
            country: 'India',
          },
        }),
      }),
    });
  });

  it('treats older unknown stored plan codes as business for summary entitlements', async () => {
    mockOrganizationSnapshot({
      _id: orgId,
      name: 'Acme Workspace',
      plan: 'growth',
      status: 'active',
      seatLimit: 5,
      billing: {},
    });

    const { getSubscriptionSummaryForUser } = await import('@/lib/subscription-server');
    const summary = await getSubscriptionSummaryForUser('user-1');

    expect(summary.workspaceTier).toBe('business');
    expect(summary.organization?.plan).toBe('business');
    expect(summary.organization?.normalizedTier).toBe('business');
    expect(summary.entitlements.cloudLibrary).toBe(true);
    expect(summary.entitlements.auditTrail).toBe(true);
  });

  it('allows business plan gates when an older unknown stored plan code should resolve to business', async () => {
    mockOrganizationSnapshot({
      _id: orgId,
      name: 'Acme Workspace',
      plan: 'growth',
      status: 'active',
      seatLimit: 5,
      billing: {},
    });

    const { getPlanGateForOrgFeature } = await import('@/lib/subscription-server');
    const result = await getPlanGateForOrgFeature({
      orgId,
      feature: 'cloud_library',
    });

    expect(result).toEqual({
      allowed: true,
      plan: 'business',
      normalizedTier: 'business',
    });
  });

  it('marks an expired trial workspace as restricted in the subscription summary', async () => {
    mockOrganizationSnapshot({
      _id: orgId,
      name: 'Trial Workspace',
      plan: 'trial',
      status: 'active',
      seatLimit: 5,
      trialEndsAt: new Date('2026-03-01T00:00:00.000Z'),
      billing: {},
    });

    const { getSubscriptionSummaryForUser } = await import('@/lib/subscription-server');
    const summary = await getSubscriptionSummaryForUser('user-1');

    expect(summary.workspaceTier).toBe('trial');
    expect(summary.trialAccess).toEqual({
      isExpired: true,
      hasRestrictedControls: true,
      message:
        'Your free trial has ended. Upgrade to keep creating, editing, and sending in this workspace. You can still review existing records and perform cleanup actions.',
    });
  });

  it('blocks write access for expired trial workspaces', async () => {
    mockOrganizationSnapshot({
      _id: orgId,
      name: 'Trial Workspace',
      plan: 'trial',
      status: 'active',
      seatLimit: 5,
      trialEndsAt: new Date('2026-03-01T00:00:00.000Z'),
      billing: {},
    });

    const { getExpiredTrialWriteGuard } = await import('@/lib/subscription-server');
    const result = await getExpiredTrialWriteGuard({ orgId });

    expect(result).toEqual({
      allowed: false,
      status: 403,
      message:
        'Your free trial has expired. Upgrade to continue creating, editing, or sending documents, templates, and contacts in this workspace.',
      reason: 'trial_expired',
    });
  });

  it('fails closed when the workspace record cannot be found', async () => {
    mockOrganizationSnapshot(null);

    const { getExpiredTrialWriteGuard } = await import('@/lib/subscription-server');
    const result = await getExpiredTrialWriteGuard({ orgId });

    expect(result).toEqual({
      allowed: false,
      status: 404,
      message: 'Workspace not found.',
      reason: 'workspace_not_found',
    });
  });
});
