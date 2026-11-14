import type { BillingProvider } from '@/lib/billing';

export function isBillingInProgressStatus(subscriptionStatus?: string | null) {
  const normalized = (subscriptionStatus || '').toLowerCase();
  return (
    normalized === 'approval_pending' ||
    normalized === 'created' ||
    normalized === 'authenticated' ||
    normalized === 'pending' ||
    normalized === 'halted'
  );
}

export function canContinuePendingCheckout(args: {
  provider?: BillingProvider | null;
  subscriptionStatus?: string | null;
}) {
  if (args.provider === 'paypal') {
    return (args.subscriptionStatus || '').toUpperCase() === 'APPROVAL_PENDING';
  }

  return (args.subscriptionStatus || '').toLowerCase() === 'created';
}
