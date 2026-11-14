import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  getSubscriptionSummaryForUser: vi.fn(),
  startBillingCheckoutForUser: vi.fn(),
  writeAuditEvent: vi.fn(),
  getBillingConfig: vi.fn(),
  getBillingConfigForMarket: vi.fn(),
  supportsSelfServeBilling: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/lib/subscription-server', () => ({
  getSubscriptionSummaryForUser: mocks.getSubscriptionSummaryForUser,
}));

vi.mock('@/lib/billing-server', () => ({
  startBillingCheckoutForUser: mocks.startBillingCheckoutForUser,
}));

vi.mock('@/lib/billing', () => ({
  getBillingConfig: mocks.getBillingConfig,
  getBillingConfigForMarket: mocks.getBillingConfigForMarket,
  supportsSelfServeBilling: mocks.supportsSelfServeBilling,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

import { GET, PATCH } from '@/app/api/subscription/route';

describe('subscription route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the current trial summary for a user without an organization', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });
    mocks.getSubscriptionSummaryForUser.mockResolvedValue({
      workspaceTier: 'trial',
      organization: null,
      entitlements: {
        teams: false,
        multipleTeams: false,
        auditTrail: false,
        adminGovernance: false,
        orgSettings: false,
        retentionPolicies: false,
        legalHolds: false,
        auditExport: false,
      },
      availablePlans: [],
    });

    const req = new NextRequest('https://example.com/api/subscription', { method: 'GET' });
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.workspaceTier).toBe('trial');
    expect(payload.organization).toBeNull();
  });

  it('creates or upgrades the workspace plan for eligible users', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });
    mocks.getBillingConfig.mockReturnValue({
      provider: 'razorpay',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
    });
    mocks.getBillingConfigForMarket.mockReturnValue({
      provider: 'razorpay',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
    });
    mocks.supportsSelfServeBilling.mockReturnValue(true);
    mocks.startBillingCheckoutForUser.mockResolvedValue({
      mode: 'checkout',
      sessionId: 'sub_123',
      checkout: {
        key: 'rzp_test_123',
        subscriptionId: 'sub_123',
        name: 'SignWorkflow',
        description: 'Business subscription',
        prefill: { email: 'user@example.com' },
        notes: {},
        theme: { color: '#0f172a' },
      },
      organizationId: null,
      message: null,
    });

    const req = new NextRequest('https://example.com/api/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlan: 'business', billingCycle: 'annually', billingMarket: 'india' }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.startBillingCheckoutForUser).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      userId: 'user-1',
      targetPlan: 'business',
      billingCycle: 'annually',
      billingMarket: 'india',
      orgId: null,
    });
    expect(payload.checkout.subscriptionId).toBe('sub_123');
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.checkout_started',
      })
    );
  });

  it('allows enterprise checkout when Razorpay is configured for self-serve plans', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getBillingConfig.mockReturnValue({
      provider: 'razorpay',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
    });
    mocks.getBillingConfigForMarket.mockReturnValue({
      provider: 'razorpay',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
    });
    mocks.startBillingCheckoutForUser.mockResolvedValue({
      mode: 'checkout',
      sessionId: 'sub_ent_123',
      checkout: {
        key: 'rzp_test_123',
        subscriptionId: 'sub_ent_123',
        name: 'SignWorkflow',
        description: 'Enterprise subscription',
        prefill: { email: 'user@example.com' },
        notes: {},
        theme: { color: '#0f172a' },
      },
      organizationId: 'org-1',
      message: null,
    });

    const req = new NextRequest('https://example.com/api/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlan: 'enterprise', billingCycle: 'annually', billingMarket: 'india' }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.startBillingCheckoutForUser).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      userId: 'user-1',
      targetPlan: 'enterprise',
      billingCycle: 'annually',
      billingMarket: 'india',
      orgId: 'org-1',
    });
    expect(payload.checkout.subscriptionId).toBe('sub_ent_123');
  });

  it('returns a configuration response when Razorpay billing is incomplete', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });
    mocks.getBillingConfigForMarket.mockReturnValue({
      provider: 'razorpay',
      configured: false,
      missing: ['RAZORPAY_KEY_ID'],
      supportsCheckout: false,
      supportsManagement: false,
      statusMessage: 'Razorpay is selected for billing, but required billing configuration is incomplete.',
    });

    const req = new NextRequest('https://example.com/api/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlan: 'business', billingCycle: 'annually', billingMarket: 'india' }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(503);
    expect(payload.message).toMatch(/Billing checkout is not configured/i);
    expect(mocks.startBillingCheckoutForUser).not.toHaveBeenCalled();
  });

  it('returns the Razorpay checkout error message instead of a generic failure', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });
    mocks.getBillingConfigForMarket.mockReturnValue({
      provider: 'razorpay',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
    });
    mocks.supportsSelfServeBilling.mockReturnValue(true);
    mocks.startBillingCheckoutForUser.mockRejectedValue(
      new Error('Plan provided does not exist.')
    );

    const req = new NextRequest('https://example.com/api/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlan: 'business', billingCycle: 'annually', billingMarket: 'india' }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(502);
    expect(payload.message).toBe('Plan provided does not exist.');
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });

  it('returns a friendly conflict message when an earlier billing flow is still open', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getBillingConfigForMarket.mockReturnValue({
      provider: 'razorpay',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
    });
    mocks.supportsSelfServeBilling.mockReturnValue(true);
    mocks.startBillingCheckoutForUser.mockRejectedValue(
      new Error(
        'An annual Business checkout is already processing for this workspace, so it cannot be switched yet. Wait for activation, or cancel pending activation if it appears stuck. Your workspace data, documents, and trial history stay intact.'
      )
    );

    const req = new NextRequest('https://example.com/api/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlan: 'business_plus', billingCycle: 'annually', billingMarket: 'india' }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.message).toContain('cannot be switched yet');
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });

  it('returns a configuration response when PayPal authentication fails', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getBillingConfigForMarket.mockReturnValue({
      provider: 'paypal',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'PayPal advanced card checkout, vault sync, and merchant-managed recurring renewals are available.',
    });
    mocks.supportsSelfServeBilling.mockReturnValue(true);
    mocks.startBillingCheckoutForUser.mockRejectedValue(
      new Error(
        'PayPal authentication failed. Verify PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for the selected PAYPAL_ENVIRONMENT, and make sure you are not mixing sandbox credentials with live mode or vice versa.'
      )
    );

    const req = new NextRequest('https://example.com/api/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlan: 'business', billingCycle: 'monthly', billingMarket: 'international' }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(503);
    expect(payload.message).toContain('PayPal authentication failed');
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });

  it('returns an upstream checkout error when PayPal checkout creation fails unexpectedly', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getBillingConfigForMarket.mockReturnValue({
      provider: 'paypal',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'PayPal advanced card checkout, vault sync, and merchant-managed recurring renewals are available.',
    });
    mocks.supportsSelfServeBilling.mockReturnValue(true);
    mocks.startBillingCheckoutForUser.mockRejectedValue(
      new Error('PayPal card fields are not eligible for this account.')
    );

    const req = new NextRequest('https://example.com/api/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlan: 'business', billingCycle: 'annually', billingMarket: 'international' }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(502);
    expect(payload.message).toContain('card fields are not eligible');
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });
});
