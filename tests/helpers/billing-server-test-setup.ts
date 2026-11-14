import { vi } from 'vitest';

const hoistedBillingServerTestMocks = vi.hoisted(() => ({
  activatePayPalSubscription: vi.fn(),
  connectDB: vi.fn(),
  capturePayPalOrder: vi.fn(),
  cancelPayPalSubscription: vi.fn(),
  verifyRazorpayCheckoutSignature: vi.fn(),
  createPayPalBillingCheckoutSession: vi.fn(),
  createPayPalCardCheckoutOrder: vi.fn(),
  createPayPalRecurringOrder: vi.fn(),
  deletePayPalVaultToken: vi.fn(),
  extractBillingStateFromPayPalOrder: vi.fn(),
  extractBillingStateFromPayPalSubscription: vi.fn(),
  fetchBillingSubscription: vi.fn(),
  fetchPayPalSubscription: vi.fn(),
  getBillingCycleFromPayPalPlanId: vi.fn(),
  getBillingCycleFromRazorpayPlanId: vi.fn(),
  getPayPalOrderCustomId: vi.fn(),
  getPayPalPlanId: vi.fn(),
  getPayPalPrimaryCapture: vi.fn(),
  getPayPalVaultTokenFromOrder: vi.fn(),
  getTierFromPayPalPlanId: vi.fn(),
  getTierFromRazorpayPlanId: vi.fn(),
  canProvisionOrgFromPayPalStatus: vi.fn(),
  canProvisionOrgFromSubscriptionStatus: vi.fn(),
  isLegacyPayPalSubscriptionId: vi.fn(() => false),
  mapPayPalSubscriptionStatusToOrganizationStatus: vi.fn(),
  shouldApplyPlanFromSubscriptionStatus: vi.fn(),
  shouldApplyPlanFromPayPalStatus: vi.fn(),
  parsePayPalCustomId: vi.fn(() => ({})),
  parsePayPalMerchantCustomerId: vi.fn(() => ({})),
  mapRazorpaySubscriptionStatusToOrganizationStatus: vi.fn(),
  resolvePayPalSubscriptionIdFromWebhookEvent: vi.fn(),
  resolvePayPalWebhookEventId: vi.fn(),
  extractBillingStateFromRazorpaySubscription: vi.fn(),
  buildRazorpayCheckoutSession: vi.fn(),
  cancelBillingSubscription: vi.fn(),
  createBillingCheckoutSession: vi.fn(),
  getBillingProviderForMarket: vi.fn((market: string) =>
    market === 'india' ? 'razorpay' : 'paypal'
  ),
  getActiveOrgContextForUser: vi.fn(),
  createOrganizationWorkspaceForUser: vi.fn(),
  sendSubscriptionPlanChangedEmail: vi.fn(),
  orgFindById: vi.fn(),
  orgFindOne: vi.fn(),
  orgUpdateOne: vi.fn(),
  userFindById: vi.fn(),
}));

export const billingServerTestMocks = hoistedBillingServerTestMocks;

export function queryChain<T>(result: T) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(result),
    }),
  };
}

vi.mock('@/utils/db', () => ({
  default: billingServerTestMocks.connectDB,
}));

vi.mock('@/lib/billing', () => ({
  activatePayPalSubscription: billingServerTestMocks.activatePayPalSubscription,
  canProvisionOrgFromPayPalStatus: billingServerTestMocks.canProvisionOrgFromPayPalStatus,
  verifyRazorpayCheckoutSignature: billingServerTestMocks.verifyRazorpayCheckoutSignature,
  capturePayPalOrder: billingServerTestMocks.capturePayPalOrder,
  cancelPayPalSubscription: billingServerTestMocks.cancelPayPalSubscription,
  fetchBillingSubscription: billingServerTestMocks.fetchBillingSubscription,
  createPayPalBillingCheckoutSession: billingServerTestMocks.createPayPalBillingCheckoutSession,
  createPayPalCardCheckoutOrder: billingServerTestMocks.createPayPalCardCheckoutOrder,
  createPayPalRecurringOrder: billingServerTestMocks.createPayPalRecurringOrder,
  deletePayPalVaultToken: billingServerTestMocks.deletePayPalVaultToken,
  extractBillingStateFromPayPalOrder: billingServerTestMocks.extractBillingStateFromPayPalOrder,
  extractBillingStateFromPayPalSubscription:
    billingServerTestMocks.extractBillingStateFromPayPalSubscription,
  fetchPayPalSubscription: billingServerTestMocks.fetchPayPalSubscription,
  getBillingCycleFromPayPalPlanId: billingServerTestMocks.getBillingCycleFromPayPalPlanId,
  getBillingCycleFromRazorpayPlanId: billingServerTestMocks.getBillingCycleFromRazorpayPlanId,
  getPayPalOrderCustomId: billingServerTestMocks.getPayPalOrderCustomId,
  getPayPalPlanId: billingServerTestMocks.getPayPalPlanId,
  getPayPalPrimaryCapture: billingServerTestMocks.getPayPalPrimaryCapture,
  getPayPalVaultTokenFromOrder: billingServerTestMocks.getPayPalVaultTokenFromOrder,
  getTierFromPayPalPlanId: billingServerTestMocks.getTierFromPayPalPlanId,
  getTierFromRazorpayPlanId: billingServerTestMocks.getTierFromRazorpayPlanId,
  canProvisionOrgFromSubscriptionStatus: billingServerTestMocks.canProvisionOrgFromSubscriptionStatus,
  isLegacyPayPalSubscriptionId: billingServerTestMocks.isLegacyPayPalSubscriptionId,
  mapPayPalSubscriptionStatusToOrganizationStatus:
    billingServerTestMocks.mapPayPalSubscriptionStatusToOrganizationStatus,
  parsePayPalCustomId: billingServerTestMocks.parsePayPalCustomId,
  parsePayPalMerchantCustomerId: billingServerTestMocks.parsePayPalMerchantCustomerId,
  shouldApplyPlanFromSubscriptionStatus:
    billingServerTestMocks.shouldApplyPlanFromSubscriptionStatus,
  shouldApplyPlanFromPayPalStatus: billingServerTestMocks.shouldApplyPlanFromPayPalStatus,
  mapRazorpaySubscriptionStatusToOrganizationStatus:
    billingServerTestMocks.mapRazorpaySubscriptionStatusToOrganizationStatus,
  resolvePayPalSubscriptionIdFromWebhookEvent:
    billingServerTestMocks.resolvePayPalSubscriptionIdFromWebhookEvent,
  resolvePayPalWebhookEventId: billingServerTestMocks.resolvePayPalWebhookEventId,
  extractBillingStateFromRazorpaySubscription:
    billingServerTestMocks.extractBillingStateFromRazorpaySubscription,
  buildRazorpayCheckoutSession: billingServerTestMocks.buildRazorpayCheckoutSession,
  cancelBillingSubscription: billingServerTestMocks.cancelBillingSubscription,
  createBillingCheckoutSession: billingServerTestMocks.createBillingCheckoutSession,
  getBillingProviderForMarket: billingServerTestMocks.getBillingProviderForMarket,
  pauseBillingSubscription: vi.fn(),
  resolveWebhookEventId: vi.fn(),
  resumeBillingSubscription: vi.fn(),
  supportsSelfServeBilling: vi.fn(() => true),
  updateBillingSubscriptionPlan: vi.fn(),
}));

vi.mock('@/lib/orgs', () => ({
  getActiveOrgContextForUser: billingServerTestMocks.getActiveOrgContextForUser,
  createOrganizationWorkspaceForUser: billingServerTestMocks.createOrganizationWorkspaceForUser,
}));

vi.mock('@/lib/email', () => ({
  sendSubscriptionPlanChangedEmail: billingServerTestMocks.sendSubscriptionPlanChangedEmail,
}));

vi.mock('@/models/Organization', () => ({
  default: {
    findById: billingServerTestMocks.orgFindById,
    findOne: billingServerTestMocks.orgFindOne,
    updateOne: billingServerTestMocks.orgUpdateOne,
  },
}));

vi.mock('@/models/Users', () => ({
  default: {
    findById: billingServerTestMocks.userFindById,
  },
}));

vi.mock('@/models/BillingWebhookEvent', () => ({
  default: {
    updateOne: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: vi.fn(),
}));

export function applyBillingServerTestDefaults() {
  vi.clearAllMocks();

  billingServerTestMocks.verifyRazorpayCheckoutSignature.mockImplementation((payload) => payload);
  billingServerTestMocks.getBillingCycleFromRazorpayPlanId.mockReturnValue('annually');
  billingServerTestMocks.getTierFromRazorpayPlanId.mockReturnValue('business');
  billingServerTestMocks.canProvisionOrgFromSubscriptionStatus.mockImplementation((status) =>
    ['authenticated', 'active', 'pending', 'halted', 'paused'].includes(
      String(status || '').toLowerCase()
    )
  );
  billingServerTestMocks.shouldApplyPlanFromSubscriptionStatus.mockImplementation((status) =>
    ['authenticated', 'active', 'pending', 'halted', 'paused'].includes(
      String(status || '').toLowerCase()
    )
  );
  billingServerTestMocks.mapRazorpaySubscriptionStatusToOrganizationStatus.mockReturnValue(null);
  billingServerTestMocks.extractBillingStateFromRazorpaySubscription.mockReturnValue({
    provider: 'razorpay',
    subscriptionId: 'sub_123',
    subscriptionStatus: 'authenticated',
    planId: 'plan_business_annual',
    billingCycle: 'annually',
  });
  billingServerTestMocks.buildRazorpayCheckoutSession.mockReturnValue({
    key: 'rzp_test_123',
    subscriptionId: 'sub_123',
    name: 'SignWorkflow',
    description: 'Business subscription',
    prefill: { email: 'owner@example.com' },
    notes: {},
    theme: { color: '#0f172a' },
  });
  billingServerTestMocks.createBillingCheckoutSession.mockResolvedValue({
    sessionId: 'sub_123',
    checkout: {
      key: 'rzp_test_123',
      subscriptionId: 'sub_123',
      name: 'SignWorkflow',
      description: 'Business subscription',
      prefill: { email: 'owner@example.com' },
      notes: {},
      theme: { color: '#0f172a' },
    },
    subscription: {
      id: 'sub_123',
      status: 'created',
      plan_id: 'plan_business_annual',
    },
  });
  billingServerTestMocks.cancelBillingSubscription.mockResolvedValue({
    id: 'sub_123',
    status: 'cancelled',
    plan_id: 'plan_business_annual',
  });
  billingServerTestMocks.createPayPalBillingCheckoutSession.mockResolvedValue({
    sessionId: 'ppchk_123',
    checkout: {
      provider: 'paypal',
      flow: 'card_fields',
      checkoutSessionId: 'ppchk_123',
      targetPlan: 'business',
      billingCycle: 'annually',
      billingMarket: 'international',
      amount: '60.00',
      currencyCode: 'USD',
      sdkClientId: 'paypal-client-id',
      description: 'Business subscription',
      planLabel: 'Business',
      organizationId: '507f1f77bcf86cd799439011',
    },
  });
  billingServerTestMocks.getPayPalPlanId.mockReturnValue('P-BUSINESS-ANNUAL');
  billingServerTestMocks.getActiveOrgContextForUser.mockResolvedValue(null);
  billingServerTestMocks.createOrganizationWorkspaceForUser.mockResolvedValue({
    orgId: '507f1f77bcf86cd799439011',
    role: 'owner',
  });
  billingServerTestMocks.orgFindOne.mockReturnValue(queryChain(null));
  billingServerTestMocks.orgFindById.mockReturnValue(
    queryChain({
      _id: '507f1f77bcf86cd799439011',
      name: 'Acme Workspace',
      ownerUserId: '507f1f77bcf86cd799439012',
      plan: 'business',
      status: 'active',
      billing: {},
    })
  );
  billingServerTestMocks.orgUpdateOne.mockReturnValue({
    exec: vi.fn().mockResolvedValue({}),
  });
  billingServerTestMocks.userFindById.mockReturnValue(
    queryChain({
      email: 'owner@example.com',
      firstName: 'Ava',
      lastName: 'Owner',
      name: 'Ava Owner',
    })
  );
  billingServerTestMocks.sendSubscriptionPlanChangedEmail.mockResolvedValue({ success: true });
}
