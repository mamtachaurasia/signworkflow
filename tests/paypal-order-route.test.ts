import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  getBillingConfigForProvider: vi.fn(),
  createPayPalCardOrderForUser: vi.fn(),
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
  createPayPalCardOrderForUser: mocks.createPayPalCardOrderForUser,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

import { POST } from '@/app/api/subscription/paypal/order/route';

describe('paypal order route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBillingConfigForProvider.mockReturnValue({
      provider: 'paypal',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'PayPal advanced card checkout, vault sync, and merchant-managed recurring renewals are available.',
    });
  });

  it('creates a PayPal card order for an owner', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.createPayPalCardOrderForUser.mockResolvedValue({
      orderId: 'ORDER-123',
    });

    const req = new NextRequest('https://example.com/api/subscription/paypal/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutSessionId: 'ppchk_123',
        targetPlan: 'business',
        billingCycle: 'monthly',
        billingMarket: 'international',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({ orderId: 'ORDER-123' });
    expect(mocks.createPayPalCardOrderForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
      checkoutSessionId: 'ppchk_123',
      targetPlan: 'business',
      billingCycle: 'monthly',
      billingMarket: 'international',
      paymentMethod: 'card',
    });
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.checkout_order_created',
        metadata: expect.objectContaining({
          provider: 'paypal',
          orderId: 'ORDER-123',
        }),
      })
    );
  });

  it('returns missing PayPal config details when checkout is disabled', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getBillingConfigForProvider.mockReturnValue({
      provider: 'paypal',
      configured: false,
      missing: ['PAYPAL_WEBHOOK_ID'],
      supportsCheckout: false,
      supportsManagement: false,
      statusMessage: 'PayPal is selected for billing, but required billing configuration is incomplete.',
    });

    const req = new NextRequest('https://example.com/api/subscription/paypal/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutSessionId: 'ppchk_123',
        targetPlan: 'business',
        billingCycle: 'monthly',
        billingMarket: 'international',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(503);
    expect(payload.message).toContain('PayPal checkout is not configured');
    expect(payload.missingConfig).toEqual(['PAYPAL_WEBHOOK_ID']);
  });

  it('accepts the PayPal wallet payment method choice', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.createPayPalCardOrderForUser.mockResolvedValue({
      orderId: 'ORDER-PAYPAL',
    });

    const req = new NextRequest('https://example.com/api/subscription/paypal/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutSessionId: 'ppchk_123',
        targetPlan: 'business_plus',
        billingCycle: 'monthly',
        billingMarket: 'international',
        paymentMethod: 'paypal',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({ orderId: 'ORDER-PAYPAL' });
    expect(mocks.createPayPalCardOrderForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
      checkoutSessionId: 'ppchk_123',
      targetPlan: 'business_plus',
      billingCycle: 'monthly',
      billingMarket: 'international',
      paymentMethod: 'paypal',
    });
  });
});
