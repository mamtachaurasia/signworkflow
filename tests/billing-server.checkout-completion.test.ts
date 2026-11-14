import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyBillingServerTestDefaults,
  billingServerTestMocks as mocks,
  queryChain,
} from './helpers/billing-server-test-setup';
import {
  completeBillingCheckoutForUser,
  startBillingCheckoutForUser,
} from '@/lib/billing-server';

describe('billing-server checkout completion', () => {
  beforeEach(() => {
    applyBillingServerTestDefaults();
  });

  it('retries the subscription fetch after checkout and sends an upgrade email once the plan is provisioned', async () => {
    mocks.fetchBillingSubscription
      .mockResolvedValueOnce({
        id: 'sub_123',
        status: 'created',
        plan_id: 'plan_business_annual',
        customer_id: 'cust_123',
        notes: {
          userId: 'user-1',
          targetPlan: 'business',
        },
      })
      .mockResolvedValueOnce({
        id: 'sub_123',
        status: 'authenticated',
        plan_id: 'plan_business_annual',
        customer_id: 'cust_123',
        notes: {
          userId: 'user-1',
          targetPlan: 'business',
        },
      });

    const result = await completeBillingCheckoutForUser({
      userId: 'user-1',
      orgId: null,
      checkout: {
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'sig_123',
        razorpay_subscription_id: 'sub_123',
      },
    });

    expect(mocks.fetchBillingSubscription).toHaveBeenCalledTimes(2);
    expect(mocks.createOrganizationWorkspaceForUser).toHaveBeenCalledWith('user-1', 'business');
    expect(mocks.sendSubscriptionPlanChangedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.com',
        workspaceName: 'Acme Workspace',
        planLabel: 'Business',
        billingCycle: 'annually',
      })
    );
    expect(mocks.orgUpdateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      expect.objectContaining({
        $set: expect.not.objectContaining({
          name: expect.anything(),
        }),
      })
    );
    expect(result.redirectPath).toBe('/dashboard/account/subscription?checkout=success');
    expect(result.organizationId).toBe('507f1f77bcf86cd799439011');
    expect(result.subscriptionStatus).toBe('authenticated');
  });

  it('does not promote a trial workspace plan when opening a paid checkout', async () => {
    mocks.userFindById.mockReturnValue(
      queryChain({
        _id: '507f1f77bcf86cd799439012',
        email: 'owner@example.com',
        firstName: 'Ava',
        lastName: 'Owner',
        name: 'Ava Owner',
      })
    );
    mocks.orgFindById.mockReturnValue(
      queryChain({
        _id: '507f1f77bcf86cd799439011',
        name: 'Acme Workspace',
        ownerUserId: '507f1f77bcf86cd799439012',
        plan: 'trial',
        status: 'active',
        billing: {},
      })
    );
    mocks.createBillingCheckoutSession.mockResolvedValueOnce({
      sessionId: 'sub_trial_to_paid_123',
      checkout: {
        key: 'rzp_test_123',
        subscriptionId: 'sub_trial_to_paid_123',
        name: 'Acme Workspace',
        description: 'Business Plus subscription',
        prefill: { email: 'owner@example.com' },
        notes: {},
        theme: { color: '#0f172a' },
      },
      subscription: {
        id: 'sub_trial_to_paid_123',
        status: 'created',
        plan_id: 'plan_business_plus_annual',
      },
    });
    mocks.extractBillingStateFromRazorpaySubscription.mockReturnValueOnce({
      provider: 'razorpay',
      subscriptionId: 'sub_trial_to_paid_123',
      subscriptionStatus: 'created',
      planId: 'plan_business_plus_annual',
      billingCycle: 'annually',
    });

    const result = await startBillingCheckoutForUser({
      userId: 'user-1',
      orgId: '507f1f77bcf86cd799439011',
      targetPlan: 'business_plus',
      billingCycle: 'annually',
      billingMarket: 'india',
    });

    const update = mocks.orgUpdateOne.mock.calls.at(-1)?.[1] as
      | { $set?: Record<string, unknown> }
      | undefined;

    expect(result.mode).toBe('checkout');
    expect(result.sessionId).toBe('sub_trial_to_paid_123');
    expect(update?.$set).not.toHaveProperty('plan');
    expect(update?.$set).not.toHaveProperty('seatLimit');
    expect(update?.$set).toMatchObject({
      'billing.subscriptionId': 'sub_trial_to_paid_123',
      'billing.subscriptionStatus': 'created',
      'billing.targetPlan': 'business_plus',
    });
  });
});
