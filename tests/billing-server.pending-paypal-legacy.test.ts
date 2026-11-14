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

describe('billing-server legacy PayPal pending checkout handling', () => {
  beforeEach(() => {
    applyBillingServerTestDefaults();
  });

  it('clears a stale legacy PayPal pending record and starts a fresh checkout', async () => {
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
            provider: 'paypal',
            market: 'international',
            subscriptionId: 'I-LEGACY123',
            subscriptionStatus: 'APPROVAL_PENDING',
            lastCheckoutReference: 'https://paypal.example/approve',
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
    mocks.isLegacyPayPalSubscriptionId.mockImplementation((value) =>
      String(value || '').startsWith('I-')
    );
    mocks.fetchPayPalSubscription.mockRejectedValue(
      new Error('Requested resource ID was not found.')
    );

    const result = await startBillingCheckoutForUser({
      userId: 'user-1',
      orgId: '507f1f77bcf86cd799439011',
      targetPlan: 'business',
      billingCycle: 'annually',
      billingMarket: 'international',
    });

    expect(mocks.fetchPayPalSubscription).toHaveBeenCalledWith({
      subscriptionId: 'I-LEGACY123',
    });
    expect(mocks.createPayPalBillingCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPlan: 'business',
        billingCycle: 'annually',
        billingMarket: 'international',
      })
    );
    expect(mocks.orgUpdateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      expect.objectContaining({
        $unset: expect.objectContaining({
          'billing.subscriptionId': 1,
          'billing.lastCheckoutReference': 1,
        }),
      })
    );
    expect(result.mode).toBe('checkout');
    expect(result.sessionId).toBe('ppchk_123');
  });

  it('clears a stale legacy PayPal pending record when the user tries to resume it', async () => {
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
          provider: 'paypal',
          market: 'international',
          subscriptionId: 'I-LEGACY123',
          subscriptionStatus: 'APPROVAL_PENDING',
          lastCheckoutReference: 'https://paypal.example/approve',
        },
      })
    );
    mocks.isLegacyPayPalSubscriptionId.mockImplementation((value) =>
      String(value || '').startsWith('I-')
    );
    mocks.fetchPayPalSubscription.mockRejectedValue(
      new Error('Requested resource ID was not found.')
    );

    await expect(
      resumePendingBillingCheckoutForUser({
        userId: 'user-1',
        orgId: '507f1f77bcf86cd799439011',
      })
    ).rejects.toThrow(
      'This pending billing step can no longer be reopened. Refresh the page, then choose your package again.'
    );

    expect(mocks.orgUpdateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      expect.objectContaining({
        $unset: expect.objectContaining({
          'billing.subscriptionId': 1,
          'billing.lastCheckoutReference': 1,
        }),
      })
    );
  });
});
