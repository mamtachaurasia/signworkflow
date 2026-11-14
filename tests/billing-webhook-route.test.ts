import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getBillingConfigForProvider: vi.fn(),
  verifyPayPalWebhookEvent: vi.fn(),
  verifyRazorpayWebhookEvent: vi.fn(),
  syncBillingWebhookEvent: vi.fn(),
}));

vi.mock('@/lib/billing', () => ({
  getBillingConfigForProvider: mocks.getBillingConfigForProvider,
  verifyPayPalWebhookEvent: mocks.verifyPayPalWebhookEvent,
  verifyRazorpayWebhookEvent: mocks.verifyRazorpayWebhookEvent,
}));

vi.mock('@/lib/billing-server', () => ({
  syncBillingWebhookEvent: mocks.syncBillingWebhookEvent,
}));

import { POST } from '@/app/api/subscription/webhook/route';

describe('subscription webhook route', () => {
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

  it('accepts a verified billing webhook and returns the sync result', async () => {
    const event = {
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_123' } } },
    };
    mocks.verifyRazorpayWebhookEvent.mockReturnValue(event);
    mocks.syncBillingWebhookEvent.mockResolvedValue({
      duplicate: false,
      orgId: 'org-1',
    });

    const req = new NextRequest('https://example.com/api/subscription/webhook', {
      method: 'POST',
      body: JSON.stringify({ any: 'payload' }),
      headers: {
        'x-razorpay-signature': 'abc',
        'x-razorpay-event-id': 'evt_header_123',
      },
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.verifyRazorpayWebhookEvent).toHaveBeenCalled();
    expect(mocks.syncBillingWebhookEvent).toHaveBeenCalledWith({
      provider: 'razorpay',
      event,
      eventIdHeader: 'evt_header_123',
    });
    expect(payload).toEqual({
      received: true,
      duplicate: false,
      orgId: 'org-1',
    });
  });

  it('returns a configuration response when Razorpay webhook config is incomplete', async () => {
    mocks.getBillingConfigForProvider.mockReturnValue({
      provider: 'razorpay',
      configured: false,
      missing: ['RAZORPAY_WEBHOOK_SECRET'],
      supportsCheckout: false,
      supportsManagement: false,
      statusMessage: 'Razorpay is selected for billing, but required billing configuration is incomplete.',
    });

    const req = new NextRequest('https://example.com/api/subscription/webhook', {
      method: 'POST',
      body: JSON.stringify({ any: 'payload' }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(503);
    expect(payload.message).toMatch(/not configured/i);
    expect(mocks.verifyRazorpayWebhookEvent).not.toHaveBeenCalled();
  });
});
