import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyBillingServerTestDefaults,
  billingServerTestMocks as mocks,
  queryChain,
} from './helpers/billing-server-test-setup';
import {
  resumePendingBillingCheckoutForUser,
  startBillingCheckoutForUser,
} from '@/lib/billing-server';

describe('billing-server pending Razorpay checkout handling', () => {
  beforeEach(() => {
    applyBillingServerTestDefaults();
  });

  it('reopens a matching pending checkout using the saved billing plan even before the workspace plan updates', async () => {
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
          subscriptionId: 'sub_pending_123',
          subscriptionStatus: 'created',
          planId: 'plan_business_annual',
          billingCycle: 'annually',
        },
      })
    );
    mocks.getTierFromRazorpayPlanId.mockReturnValue('business');
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_pending_123',
      status: 'created',
      plan_id: 'plan_business_annual',
      notes: {
        userId: 'user-1',
        targetPlan: 'business',
      },
    });
    mocks.buildRazorpayCheckoutSession.mockReturnValue({
      key: 'rzp_test_123',
      subscriptionId: 'sub_pending_123',
      name: 'Acme Workspace',
      description: 'Business subscription',
      prefill: { email: 'owner@example.com' },
      notes: {
        targetPlan: 'business',
      },
      theme: { color: '#0f172a' },
    });

    const result = await startBillingCheckoutForUser({
      userId: 'user-1',
      orgId: '507f1f77bcf86cd799439011',
      targetPlan: 'business',
      billingCycle: 'annually',
      billingMarket: 'india',
    });

    expect(mocks.fetchBillingSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_pending_123',
    });
    expect(mocks.createBillingCheckoutSession).not.toHaveBeenCalled();
    expect(result.mode).toBe('checkout');
    expect(result.sessionId).toBe('sub_pending_123');
    expect(result.checkout).toEqual(
      expect.objectContaining({
        subscriptionId: 'sub_pending_123',
      })
    );
  });

  it('reopens a matching pending checkout when targetPlan metadata exists but planId is missing', async () => {
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
          subscriptionId: 'sub_pending_456',
          subscriptionStatus: 'created',
          targetPlan: 'business',
          billingCycle: 'annually',
        },
      })
    );
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_pending_456',
      status: 'created',
      notes: {
        userId: 'user-1',
        targetPlan: 'business',
      },
    });
    mocks.buildRazorpayCheckoutSession.mockReturnValue({
      key: 'rzp_test_123',
      subscriptionId: 'sub_pending_456',
      name: 'Acme Workspace',
      description: 'Business subscription',
      prefill: { email: 'owner@example.com' },
      notes: {
        targetPlan: 'business',
      },
      theme: { color: '#0f172a' },
    });

    const result = await startBillingCheckoutForUser({
      userId: 'user-1',
      orgId: '507f1f77bcf86cd799439011',
      targetPlan: 'business',
      billingCycle: 'annually',
      billingMarket: 'india',
    });

    expect(mocks.fetchBillingSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_pending_456',
    });
    expect(mocks.createBillingCheckoutSession).not.toHaveBeenCalled();
    expect(result.mode).toBe('checkout');
    expect(result.sessionId).toBe('sub_pending_456');
    expect(result.checkout).toEqual(
      expect.objectContaining({
        subscriptionId: 'sub_pending_456',
      })
    );
  });

  it('reopens a matching pending checkout when the saved billing snapshot is missing plan details', async () => {
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
          subscriptionId: 'sub_pending_789',
          subscriptionStatus: 'created',
        },
      })
    );
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_pending_789',
      status: 'created',
      plan_id: 'plan_business_annual',
      notes: {
        userId: 'user-1',
        targetPlan: 'business',
        billingCycle: 'annually',
      },
    });
    mocks.buildRazorpayCheckoutSession.mockReturnValue({
      key: 'rzp_test_123',
      subscriptionId: 'sub_pending_789',
      name: 'Acme Workspace',
      description: 'Business subscription',
      prefill: { email: 'owner@example.com' },
      notes: {
        targetPlan: 'business',
      },
      theme: { color: '#0f172a' },
    });

    const result = await startBillingCheckoutForUser({
      userId: 'user-1',
      orgId: '507f1f77bcf86cd799439011',
      targetPlan: 'business',
      billingCycle: 'annually',
      billingMarket: 'india',
    });

    expect(mocks.fetchBillingSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_pending_789',
    });
    expect(mocks.createBillingCheckoutSession).not.toHaveBeenCalled();
    expect(result.mode).toBe('checkout');
    expect(result.sessionId).toBe('sub_pending_789');
    expect(result.checkout).toEqual(
      expect.objectContaining({
        subscriptionId: 'sub_pending_789',
      })
    );
  });

  it('resumes a pending checkout using live Razorpay subscription details when saved billing details are incomplete', async () => {
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
          subscriptionId: 'sub_pending_resume_123',
          subscriptionStatus: 'created',
          targetPlan: 'business_plus',
        },
      })
    );
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_pending_resume_123',
      status: 'created',
      plan_id: 'plan_business_plus_monthly',
      notes: {
        userId: 'user-1',
        targetPlan: 'business_plus',
        billingCycle: 'monthly',
      },
    });
    mocks.getBillingCycleFromRazorpayPlanId.mockImplementation((planId) =>
      planId === 'plan_business_plus_monthly' ? 'monthly' : 'annually'
    );
    mocks.getTierFromRazorpayPlanId.mockImplementation((planId) =>
      planId === 'plan_business_plus_monthly' ? 'business_plus' : 'business'
    );
    mocks.buildRazorpayCheckoutSession.mockReturnValue({
      key: 'rzp_test_123',
      subscriptionId: 'sub_pending_resume_123',
      name: 'Acme Workspace',
      description: 'Business Plus subscription',
      prefill: { email: 'owner@example.com' },
      notes: {
        targetPlan: 'business_plus',
      },
      theme: { color: '#0f172a' },
    });

    const result = await resumePendingBillingCheckoutForUser({
      userId: 'user-1',
      orgId: '507f1f77bcf86cd799439011',
    });

    expect(mocks.fetchBillingSubscription).toHaveBeenCalledWith({
      subscriptionId: 'sub_pending_resume_123',
    });
    expect(mocks.buildRazorpayCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPlan: 'business_plus',
        billingCycle: 'monthly',
      })
    );
    expect(result.sessionId).toBe('sub_pending_resume_123');
  });

  it('syncs the workspace billing snapshot when a pending checkout has already moved into authentication', async () => {
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
          subscriptionId: 'sub_pending_auth_123',
          subscriptionStatus: 'created',
          market: 'india',
        },
      })
    );
    mocks.fetchBillingSubscription.mockResolvedValue({
      id: 'sub_pending_auth_123',
      status: 'authenticated',
      plan_id: 'plan_business_annual',
      customer_id: 'cust_123',
      notes: {
        userId: 'user-1',
        targetPlan: 'business',
      },
    });
    mocks.extractBillingStateFromRazorpaySubscription.mockReturnValue({
      provider: 'razorpay',
      subscriptionId: 'sub_pending_auth_123',
      subscriptionStatus: 'authenticated',
      planId: 'plan_business_annual',
      billingCycle: 'annually',
    });

    await expect(
      resumePendingBillingCheckoutForUser({
        userId: 'user-1',
        orgId: '507f1f77bcf86cd799439011',
      })
    ).rejects.toThrow(
      'This payment was already received and is still being confirmed. Refresh the page, or cancel it if it stays stuck.'
    );

    expect(mocks.orgUpdateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      expect.objectContaining({
        $set: expect.objectContaining({
          plan: 'business',
          'billing.market': 'india',
          'billing.subscriptionStatus': 'authenticated',
        }),
      })
    );
  });
});
