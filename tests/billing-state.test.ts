import { describe, expect, it } from 'vitest';

import {
  canProvisionOrgFromSubscriptionStatus,
  mapRazorpaySubscriptionStatusToOrganizationStatus,
  shouldApplyPlanFromSubscriptionStatus,
} from '@/lib/billing';

describe('Razorpay billing state rules', () => {
  it('does not activate org status for pre-activation subscription states', () => {
    expect(mapRazorpaySubscriptionStatusToOrganizationStatus('created')).toBeNull();
    expect(mapRazorpaySubscriptionStatusToOrganizationStatus('authenticated')).toBeNull();
  });

  it('only applies paid-plan entitlements after the subscription reaches a provisioned state', () => {
    expect(shouldApplyPlanFromSubscriptionStatus('created')).toBe(false);
    expect(shouldApplyPlanFromSubscriptionStatus('authenticated')).toBe(true);
    expect(shouldApplyPlanFromSubscriptionStatus('active')).toBe(true);
    expect(shouldApplyPlanFromSubscriptionStatus('pending')).toBe(true);
  });

  it('provisions a new org once Razorpay has a verified checkout state', () => {
    expect(canProvisionOrgFromSubscriptionStatus('created')).toBe(false);
    expect(canProvisionOrgFromSubscriptionStatus('authenticated')).toBe(true);
    expect(canProvisionOrgFromSubscriptionStatus('cancelled')).toBe(false);
    expect(canProvisionOrgFromSubscriptionStatus('active')).toBe(true);
    expect(canProvisionOrgFromSubscriptionStatus('paused')).toBe(true);
  });
});
