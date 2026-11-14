import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyBillingServerTestDefaults,
  billingServerTestMocks as mocks,
  queryChain,
} from './helpers/billing-server-test-setup';
import {
  manageBillingSubscription,
  startBillingCheckoutForUser,
} from '@/lib/billing-server';

describe('billing-server plan switching', () => {
  beforeEach(() => {
    applyBillingServerTestDefaults();
  });

  it('replaces an unfinished checkout when the user switches to a higher plan before payment completes', async () => {
    mocks.userFindById.mockReturnValue(
      queryChain({
        _id: '507f1f77bcf86cd799439012',
        email: 'owner@example.com',
        firstName: 'Ava',
        lastName: 'Owner',
        name: 'Ava Owner',
      })
    );
    mocks.orgFindById
      .mockReturnValueOnce(
        queryChain({
          _id: '507f1f77bcf86cd799439011',
          name: 'Acme Workspace',
          ownerUserId: '507f1f77bcf86cd799439012',
          plan: 'trial',
          status: 'active',
          billing: {
            provider: 'razorpay',
            market: 'india',
            subscriptionId: 'sub_pending_123',
            subscriptionStatus: 'created',
            targetPlan: 'business',
            billingCycle: 'annually',
          },
        })
      )
      .mockReturnValueOnce(
        queryChain({
          _id: '507f1f77bcf86cd799439011',
          name: 'Acme Workspace',
          ownerUserId: '507f1f77bcf86cd799439012',
          plan: 'trial',
          status: 'active',
          billing: {
            provider: 'razorpay',
            market: 'india',
            subscriptionId: 'sub_pending_123',
            subscriptionStatus: 'created',
            targetPlan: 'business',
            billingCycle: 'annually',
          },
        })
      )
      .mockReturnValueOnce(
        queryChain({
          _id: '507f1f77bcf86cd799439011',
          name: 'Acme Workspace',
          ownerUserId: '507f1f77bcf86cd799439012',
          plan: 'trial',
          status: 'active',
          billing: {
            provider: 'razorpay',
            market: 'india',
            subscriptionId: 'sub_pending_123',
            subscriptionStatus: 'cancelled',
          },
        })
      );
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_pending_123',
      status: 'created',
      plan_id: 'plan_business_annual',
      notes: {
        userId: 'user-1',
        targetPlan: 'business',
        billingCycle: 'annually',
      },
    });
    mocks.createBillingCheckoutSession.mockResolvedValueOnce({
      sessionId: 'sub_switched_123',
      checkout: {
        key: 'rzp_test_123',
        subscriptionId: 'sub_switched_123',
        name: 'SignWorkflow',
        description: 'Business Plus subscription',
        prefill: { email: 'owner@example.com' },
        notes: {},
        theme: { color: '#0f172a' },
      },
      subscription: {
        id: 'sub_switched_123',
        status: 'created',
        plan_id: 'plan_business_plus_annual',
      },
    });
    mocks.extractBillingStateFromRazorpaySubscription.mockReturnValueOnce({
      provider: 'razorpay',
      subscriptionId: 'sub_switched_123',
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

    expect(mocks.cancelBillingSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_pending_123',
      atCycleEnd: false,
    });
    expect(mocks.createBillingCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPlan: 'business_plus',
        billingCycle: 'annually',
      })
    );
    expect(result.mode).toBe('checkout');
    expect(result.sessionId).toBe('sub_switched_123');
    expect(result.message).toBe(
      'We replaced the unfinished Business checkout with Business Plus. Your workspace data, documents, and trial history stay intact.'
    );
  });

  it('clears an expired Razorpay checkout before opening the replacement plan checkout', async () => {
    mocks.userFindById.mockReturnValue(
      queryChain({
        _id: '507f1f77bcf86cd799439012',
        email: 'owner@example.com',
        firstName: 'Ava',
        lastName: 'Owner',
        name: 'Ava Owner',
      })
    );
    mocks.orgFindById
      .mockReturnValueOnce(
        queryChain({
          _id: '507f1f77bcf86cd799439011',
          name: 'Acme Workspace',
          ownerUserId: '507f1f77bcf86cd799439012',
          plan: 'trial',
          status: 'active',
          billing: {
            provider: 'razorpay',
            market: 'india',
            subscriptionId: 'sub_expired_123',
            subscriptionStatus: 'created',
            targetPlan: 'business',
            billingCycle: 'annually',
          },
        })
      )
      .mockReturnValueOnce(
        queryChain({
          _id: '507f1f77bcf86cd799439011',
          name: 'Acme Workspace',
          ownerUserId: '507f1f77bcf86cd799439012',
          plan: 'trial',
          status: 'active',
          billing: {
            provider: 'razorpay',
            market: 'india',
            subscriptionId: 'sub_expired_123',
            subscriptionStatus: 'created',
            targetPlan: 'business',
            billingCycle: 'annually',
          },
        })
      )
      .mockReturnValueOnce(
        queryChain({
          _id: '507f1f77bcf86cd799439011',
          name: 'Acme Workspace',
          ownerUserId: '507f1f77bcf86cd799439012',
          plan: 'trial',
          status: 'active',
          billing: {},
        })
      );
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_expired_123',
      status: 'expired',
      plan_id: 'plan_business_annual',
      notes: {
        userId: 'user-1',
        targetPlan: 'business',
        billingCycle: 'annually',
      },
    });
    mocks.cancelBillingSubscription.mockRejectedValueOnce(
      new Error('Subscription is not cancellable in expired status.')
    );
    mocks.createBillingCheckoutSession.mockResolvedValueOnce({
      sessionId: 'sub_switched_456',
      checkout: {
        key: 'rzp_test_123',
        subscriptionId: 'sub_switched_456',
        name: 'SignWorkflow',
        description: 'Business Plus subscription',
        prefill: { email: 'owner@example.com' },
        notes: {},
        theme: { color: '#0f172a' },
      },
      subscription: {
        id: 'sub_switched_456',
        status: 'created',
        plan_id: 'plan_business_plus_annual',
      },
    });
    mocks.extractBillingStateFromRazorpaySubscription.mockReturnValueOnce({
      provider: 'razorpay',
      subscriptionId: 'sub_switched_456',
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

    expect(mocks.cancelBillingSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_expired_123',
      atCycleEnd: false,
    });
    expect(mocks.createBillingCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPlan: 'business_plus',
      })
    );
    expect(result.sessionId).toBe('sub_switched_456');
    expect(result.message).toBe(
      'We replaced the unfinished Business checkout with Business Plus. Your workspace data, documents, and trial history stay intact.'
    );
    expect(mocks.orgUpdateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      expect.objectContaining({
        $unset: expect.objectContaining({
          'billing.subscriptionId': 1,
          'billing.subscriptionStatus': 1,
        }),
      })
    );
  });

  it('clears an unfinished Razorpay checkout without changing the current workspace plan', async () => {
    mocks.orgFindById.mockReturnValue(
      queryChain({
        _id: '507f1f77bcf86cd799439011',
        name: 'Acme Workspace',
        ownerUserId: '507f1f77bcf86cd799439012',
        plan: 'business',
        status: 'active',
        billing: {
          provider: 'razorpay',
          market: 'india',
          subscriptionId: 'sub_pending_upgrade_123',
          subscriptionStatus: 'created',
          targetPlan: 'business_plus',
          billingCycle: 'annually',
          planId: 'plan_business_plus_annual',
        },
      })
    );
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_pending_upgrade_123',
      status: 'created',
      plan_id: 'plan_business_plus_annual',
      notes: {
        userId: 'user-1',
        targetPlan: 'business_plus',
        billingCycle: 'annually',
      },
    });
    mocks.cancelBillingSubscription.mockResolvedValueOnce({
      id: 'sub_pending_upgrade_123',
      status: 'cancelled',
      plan_id: 'plan_business_plus_annual',
    });

    const result = await manageBillingSubscription({
      orgId: '507f1f77bcf86cd799439011',
      action: 'cancel',
      timing: 'now',
    });

    const update = mocks.orgUpdateOne.mock.calls.at(-1)?.[1] as
      | { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }
      | undefined;

    expect(result.subscriptionStatus).toBeNull();
    expect(result.message).toBe(
      'Checkout was cancelled. Your current workspace plan did not change.'
    );
    expect(update?.$set).not.toHaveProperty('plan');
    expect(update?.$set).not.toHaveProperty('seatLimit');
    expect(update?.$set).not.toHaveProperty('status');
    expect(update?.$unset).toMatchObject({
      'billing.subscriptionId': 1,
      'billing.subscriptionStatus': 1,
      'billing.targetPlan': 1,
      'billing.planId': 1,
    });
  });

  it('clears stale Razorpay pending billing when Razorpay already cancelled it', async () => {
    mocks.orgFindById.mockReturnValue(
      queryChain({
        _id: '507f1f77bcf86cd799439011',
        name: 'Acme Workspace',
        ownerUserId: '507f1f77bcf86cd799439012',
        plan: 'trial',
        status: 'active',
        billing: {
          provider: 'razorpay',
          market: 'india',
          subscriptionId: 'sub_already_cancelled_123',
          subscriptionStatus: 'authenticated',
          targetPlan: 'business',
          billingCycle: 'annually',
          planId: 'plan_business_annual',
        },
      })
    );
    mocks.cancelBillingSubscription.mockRejectedValueOnce(
      new Error('Subscription is not cancellable in cancelled status.')
    );

    const result = await manageBillingSubscription({
      orgId: '507f1f77bcf86cd799439011',
      action: 'cancel',
      timing: 'now',
    });

    const update = mocks.orgUpdateOne.mock.calls.at(-1)?.[1] as
      | { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }
      | undefined;

    expect(mocks.cancelBillingSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_already_cancelled_123',
      atCycleEnd: false,
    });
    expect(result.subscriptionStatus).toBeNull();
    expect(result.message).toBe(
      'Checkout was cancelled. Your current workspace plan did not change.'
    );
    expect(update?.$set).not.toHaveProperty('plan');
    expect(update?.$unset).toMatchObject({
      'billing.subscriptionId': 1,
      'billing.subscriptionStatus': 1,
      'billing.targetPlan': 1,
      'billing.planId': 1,
    });
  });

  it('explains that a plan cannot be switched once payment is already being confirmed', async () => {
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
        billing: {
          provider: 'razorpay',
          market: 'india',
          subscriptionId: 'sub_pending_123',
          subscriptionStatus: 'authenticated',
          targetPlan: 'business',
          billingCycle: 'annually',
        },
      })
    );
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_pending_123',
      status: 'authenticated',
      plan_id: 'plan_business_annual',
      notes: {
        userId: 'user-1',
        targetPlan: 'business',
        billingCycle: 'annually',
      },
    });

    await expect(
      startBillingCheckoutForUser({
        userId: 'user-1',
        orgId: '507f1f77bcf86cd799439011',
        targetPlan: 'business_plus',
        billingCycle: 'annually',
        billingMarket: 'india',
      })
    ).rejects.toThrow(
      'An annual Business checkout is already processing for this workspace, so it cannot be switched yet. Wait for activation, or cancel pending activation if it appears stuck. Your workspace data, documents, and trial history stay intact.'
    );
  });
});
