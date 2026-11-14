import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  getBillingConfig: vi.fn(),
  manageBillingSubscription: vi.fn(),
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
  getBillingConfig: mocks.getBillingConfig,
}));

vi.mock('@/lib/billing-server', () => ({
  manageBillingSubscription: mocks.manageBillingSubscription,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

import { POST } from '@/app/api/subscription/manage/route';

describe('subscription manage route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBillingConfig.mockReturnValue({
      provider: 'razorpay',
      configured: true,
      missing: [],
      supportsCheckout: true,
      supportsManagement: true,
      statusMessage:
        'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
    });
  });

  it('lets an owner schedule cancellation through the management route', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.manageBillingSubscription.mockResolvedValue({
      orgId: 'org-1',
      subscriptionId: 'sub_123',
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: true,
      message: 'Subscription will cancel at the end of the current billing cycle.',
    });

    const req = new NextRequest('https://example.com/api/subscription/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', timing: 'cycle_end' }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.manageBillingSubscription).toHaveBeenCalledWith({
      orgId: 'org-1',
      action: 'cancel',
      timing: 'cycle_end',
    });
    expect(payload.cancelAtPeriodEnd).toBe(true);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.cancel_requested',
      })
    );
  });
});
