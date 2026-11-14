import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPayPalBillingCheckoutSession,
  createPayPalCardCheckoutOrder,
  getBillingConfigForProvider,
} from '@/lib/billing';

const ORIGINAL_ENV = {
  PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT,
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
};

const originalFetch = global.fetch;

describe('PayPal billing configuration', () => {
  beforeEach(() => {
    process.env.PAYPAL_ENVIRONMENT = 'sandbox';
    process.env.PAYPAL_CLIENT_ID = 'paypal-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'paypal-client-secret';
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TESTWEBHOOKID';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) {
        delete process.env[key as keyof typeof ORIGINAL_ENV];
      } else {
        process.env[key as keyof typeof ORIGINAL_ENV] = value;
      }
    }

    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fails fast when the PayPal client secret matches the client id', async () => {
    process.env.PAYPAL_CLIENT_ID = 'same-paypal-value';
    process.env.PAYPAL_CLIENT_SECRET = 'same-paypal-value';
    global.fetch = vi.fn() as unknown as typeof fetch;

    await expect(
      createPayPalBillingCheckoutSession({
        baseUrl: 'https://example.com',
        userId: 'user-1',
        userEmail: 'owner@example.com',
        targetPlan: 'business',
        billingCycle: 'monthly',
        billingMarket: 'international',
        orgId: 'org-1',
      })
    ).rejects.toThrow(
      'PayPal credentials are invalid: PAYPAL_CLIENT_SECRET must be the secret from your PayPal app, not the same value as PAYPAL_CLIENT_ID.'
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns an inline card-fields checkout session without requiring PayPal plan ids', async () => {
    const checkout = await createPayPalBillingCheckoutSession({
      baseUrl: 'https://example.com',
      userId: 'user-1',
      userEmail: 'owner@example.com',
      targetPlan: 'business',
      billingCycle: 'monthly',
      billingMarket: 'international',
      orgId: 'org-1',
    });

    expect(checkout.checkout).toEqual(
      expect.objectContaining({
        provider: 'paypal',
        flow: 'card_fields',
        customerEmail: 'owner@example.com',
        targetPlan: 'business',
        billingCycle: 'monthly',
        billingMarket: 'international',
        currencyCode: 'USD',
        sdkClientId: 'paypal-client-id',
        amount: '7.00',
      })
    );
  });

  it('calculates the annual checkout amount as the full yearly charge', async () => {
    const checkout = await createPayPalBillingCheckoutSession({
      baseUrl: 'https://example.com',
      userId: 'user-1',
      userEmail: 'owner@example.com',
      targetPlan: 'business',
      billingCycle: 'annually',
      billingMarket: 'international',
      orgId: 'org-1',
    });

    expect(checkout.checkout).toEqual(
      expect.objectContaining({
        billingCycle: 'annually',
        amount: '60.00',
      })
    );
  });

  it('reports the smaller PayPal config surface for direct card checkout', () => {
    const config = getBillingConfigForProvider('paypal');

    expect(config.configured).toBe(true);
    expect(config.missing).toEqual([]);
    expect(config.statusMessage).toContain('advanced card checkout');
  });

  it('returns a clear error when PayPal rejects the client credentials during order creation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'invalid_client',
        error_description: 'Client Authentication failed',
      }),
    }) as unknown as typeof fetch;

    await expect(
      createPayPalCardCheckoutOrder({
        checkoutSessionId: 'ppchk_123',
        userId: 'user-1',
        targetPlan: 'business',
        billingCycle: 'monthly',
        billingMarket: 'international',
        orgId: 'org-1',
      })
    ).rejects.toThrow(
      'PayPal authentication failed. Verify PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for the selected PAYPAL_ENVIRONMENT, and make sure you are not mixing sandbox credentials with live mode or vice versa.'
    );
  });

  it('sends a PayPal request id when creating a card order', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token_123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 'ORDER-123',
            status: 'CREATED',
          }),
      }) as unknown as typeof fetch;

    await createPayPalCardCheckoutOrder({
      checkoutSessionId: 'ppchk_123',
      userId: 'user-1',
      targetPlan: 'business',
      billingCycle: 'monthly',
      billingMarket: 'international',
      orgId: 'org-1',
    });

    const orderCall = vi.mocked(global.fetch).mock.calls[1];
    expect(orderCall?.[0]).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    expect((orderCall?.[1] as RequestInit | undefined)?.headers).toEqual(
      expect.objectContaining({
        'PayPal-Request-Id': expect.stringContaining('pp-card-order-ppchk_123-'),
      })
    );

    const body = JSON.parse(String((orderCall?.[1] as RequestInit | undefined)?.body || '{}'));
    expect(body.payment_source?.card?.attributes?.customer?.merchant_customer_id).toMatch(
      /^s_[0-9A-Za-z_-]+$/
    );
  });

  it('creates a PayPal wallet order when the wallet option is selected', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token_123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 'ORDER-PAYPAL',
            status: 'PAYER_ACTION_REQUIRED',
            payment_source: { paypal: {} },
          }),
      }) as unknown as typeof fetch;

    await createPayPalCardCheckoutOrder({
      checkoutSessionId: 'ppchk_wallet',
      userId: 'user-1',
      targetPlan: 'business_plus',
      billingCycle: 'monthly',
      billingMarket: 'international',
      orgId: 'org-1',
      paymentMethod: 'paypal',
      baseUrl: 'https://example.com',
    });

    const orderCall = vi.mocked(global.fetch).mock.calls[1];
    const body = JSON.parse(String((orderCall?.[1] as RequestInit | undefined)?.body || '{}'));

    expect(body.payment_source?.paypal?.attributes?.vault?.store_in_vault).toBe('ON_SUCCESS');
    expect(body.payment_source?.paypal?.attributes?.vault?.usage_pattern).toBe(
      'SUBSCRIPTION_PREPAID'
    );
    expect(body.payment_source?.paypal?.experience_context).toEqual(
      expect.objectContaining({
        payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
        brand_name: 'SignWorkflow',
        locale: 'en-US',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
      })
    );
    expect(body.payment_source?.paypal?.attributes?.customer?.merchant_customer_id).toMatch(
      /^s_[0-9A-Za-z_-]+$/
    );
    expect(body.payment_source?.card).toBeUndefined();
  });
});
