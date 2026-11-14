import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  getBillingConfigForProvider: vi.fn(),
  completeBillingCheckoutForUser: vi.fn(),
  writeAuditEvent: vi.fn(),
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

vi.mock('@/lib/billing', () => ({
  getBillingConfigForProvider: mocks.getBillingConfigForProvider,
}));

vi.mock('@/lib/billing-server', () => ({
  completeBillingCheckoutForUser: mocks.completeBillingCheckoutForUser,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

import { POST } from '@/app/api/subscription/checkout/complete/route';

describe('subscription checkout complete route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBillingConfigForProvider.mockReturnValue({
      provider: 'razorpay',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
    });
  });

  it('verifies a successful checkout and returns the redirect target', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });
    mocks.completeBillingCheckoutForUser.mockResolvedValue({
      redirectPath: '/dashboard/account/subscription?checkout=success',
      message: 'Subscription payment was successful. Your workspace billing is now active.',
      organizationId: 'org-1',
      subscriptionId: 'sub_123',
      subscriptionStatus: 'active',
    });

    const req = new NextRequest('https://example.com/api/subscription/checkout/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'razorpay',
        razorpay_payment_id: 'pay_123',
        razorpay_subscription_id: 'sub_123',
        razorpay_signature: 'sig_123',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.completeBillingCheckoutForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: null,
      checkout: {
        provider: 'razorpay',
        razorpay_payment_id: 'pay_123',
        razorpay_subscription_id: 'sub_123',
        razorpay_signature: 'sig_123',
      },
    });
    expect(payload.redirectPath).toBe('/dashboard/account/subscription?checkout=success');
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.checkout_verified',
      })
    );
  });

  it('returns billing verification errors to the client', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });
    mocks.completeBillingCheckoutForUser.mockRejectedValue(
      new Error('Razorpay checkout signature verification failed.')
    );

    const req = new NextRequest('https://example.com/api/subscription/checkout/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'razorpay',
        razorpay_payment_id: 'pay_123',
        razorpay_subscription_id: 'sub_123',
        razorpay_signature: 'sig_123',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.message).toBe('Razorpay checkout signature verification failed.');
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });

  it('accepts PayPal card-order completion payloads', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getBillingConfigForProvider.mockReturnValue({
      provider: 'paypal',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'PayPal advanced card checkout, vault sync, and merchant-managed recurring renewals are available.',
    });
    mocks.completeBillingCheckoutForUser.mockResolvedValue({
      redirectPath: '/dashboard/account/subscription?checkout=success',
      message: 'Subscription payment was successful. Your workspace billing is now active.',
      organizationId: 'org-1',
      subscriptionId: 'ppchk_123',
      subscriptionStatus: 'ACTIVE',
    });

    const req = new NextRequest('https://example.com/api/subscription/checkout/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'paypal',
        paypal_order_id: 'ORDER-123',
        paypal_checkout_session_id: 'ppchk_123',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.completeBillingCheckoutForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
      checkout: {
        provider: 'paypal',
        paypal_order_id: 'ORDER-123',
        paypal_checkout_session_id: 'ppchk_123',
      },
    });
    expect(payload.redirectPath).toBe('/dashboard/account/subscription?checkout=success');
  });
});
