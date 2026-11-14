import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBillingCheckoutSession } from '@/lib/billing';

const ORIGINAL_ENV = {
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY: process.env.RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY,
};

const originalFetch = global.fetch;

describe('Razorpay checkout errors', () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_live_example';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_live_secret';
    process.env.RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY = 'plan_live_business_plus_annual';
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

  it('includes the exact plan id and billing cycle when Razorpay cannot find the plan', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () =>
        JSON.stringify({
          error: {
            description: 'Requested resource ID was not found.',
          },
        }),
    }) as unknown as typeof fetch;

    await expect(
      createBillingCheckoutSession({
        userId: 'user-1',
        userEmail: 'owner@example.com',
        targetPlan: 'business_plus',
        billingCycle: 'annually',
        orgId: 'org-1',
        orgName: 'Acme Workspace',
      })
    ).rejects.toThrow(
      'Razorpay could not find plan plan_live_business_plus_annual for business_plus (annually) using live credentials.'
    );
  });
});
