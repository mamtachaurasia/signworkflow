'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowUpRight, Building2, Check, CreditCard, PlayCircle, Rocket, ShieldCheck } from 'lucide-react';

import { Button } from '@ui';
import { useAuth } from '@/components/auth/AuthProvider';
import useContextStore from '@/hooks/useContextStore';
import { useAutoBillingMarket } from '@/hooks/useAutoBillingMarket';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { getDashboardAccountPath } from '@/lib/account-routing';
import { resolveAccountContactEmail, resolveAccountContactName } from '@/lib/account-contact';
import {
  getBillingProviderForMarket,
  getBillingProviderLabel,
  type PayPalCardCheckoutSession,
} from '@/lib/billing';
import { canContinuePendingCheckout, isBillingInProgressStatus } from '@/lib/billing-status';
import PayPalCardCheckoutModal from '@/components/account/PayPalCardCheckoutModal';
import {
  CURRENT_PACKAGE_MAPPING,
  PRICING_PLANS,
  formatPlanPrice,
  getPricingMarketDefinition,
} from '@/lib/pricing';
import {
  CHECKOUT_CANCELLED_MESSAGE,
  cancelPendingSubscriptionCheckout,
  clearPendingPayPalSubscriptionId,
  completeHostedSubscriptionCheckout,
  continuePendingSubscriptionCheckout,
  getPendingPayPalSubscriptionId,
  manageSubscription,
  openSubscriptionCheckout,
  startSubscriptionCheckout,
} from '@/lib/subscription-client';
import { getOrganizationPlanLabel, type OrganizationTierId, type PricingTierId } from '@/lib/subscription-plans';

const planIcons = {
  trial: Rocket,
  business: Building2,
  business_plus: ShieldCheck,
  enterprise: CreditCard,
} as const;

const TIER_ORDER: Record<PricingTierId, number> = {
  trial: 0,
  business: 1,
  business_plus: 2,
  enterprise: 3,
};

function getPriceCaption(tier: PricingTierId, price: string) {
  if (tier === 'trial' || price === 'Free') return 'Free during the trial period';
  return 'Current billing cycle list price';
}

function getBillingInProgressMessage(args: {
  subscriptionStatus?: string | null;
  pendingPlan?: OrganizationTierId | null;
}) {
  const planLabel = args.pendingPlan ? getOrganizationPlanLabel(args.pendingPlan) : 'pending upgrade';
  const normalized = (args.subscriptionStatus || '').toLowerCase();

  if (normalized === 'approval_pending') {
    return `Your ${planLabel} checkout draft is ready. Resume checkout or switch plans.`;
  }

  if (normalized === 'created') {
    return `Your ${planLabel} checkout draft is not finished yet. Resume checkout or switch plans.`;
  }

  if (normalized === 'authenticated') {
    return `Your ${planLabel} payment is being confirmed. Activation should complete shortly.`;
  }

  if (normalized === 'pending' || normalized === 'halted') {
    return `Your ${planLabel} setup is in progress. Wait for activation before starting another upgrade.`;
  }

  return 'A billing step is already in progress for this workspace.';
}

function getBillingStatusLabel(subscriptionStatus?: string | null) {
  const normalized = (subscriptionStatus || '').toLowerCase();

  switch (normalized) {
    case 'approval_pending':
      return 'Checkout ready';
    case 'created':
      return 'Checkout started';
    case 'authenticated':
      return 'Payment received, activation in progress';
    case 'pending':
      return 'Billing setup in progress';
    case 'halted':
      return 'Billing needs attention';
    case 'active':
      return 'Active';
    case 'paused':
    case 'suspended':
      return 'Paused';
    case 'cancelled':
    case 'completed':
    case 'expired':
      return 'Not active';
    default:
      return 'Trial only';
  }
}

export default function Subscription() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useContextStore();
  const { refreshAccessToken, user: authUser } = useAuth();
  const { status, loading, refresh } = useSubscriptionStatus();
  const [busyAction, setBusyAction] = useState<
    OrganizationTierId | 'resume' | 'cancel' | null
  >(null);
  const [paypalCheckout, setPayPalCheckout] = useState<PayPalCardCheckoutSession | null>(null);
  const isCompletingHostedCheckoutRef = useRef(false);
  const { billingMarket: autoBillingMarket } = useAutoBillingMarket(status.billing.defaultMarket);

  const currentTier = status.workspaceTier;
  const currentPlan = PRICING_PLANS.find((plan) => plan.id === currentTier) ?? PRICING_PLANS[0];
  const currentPackage = CURRENT_PACKAGE_MAPPING.find((item) => item.tier === currentTier) ?? CURRENT_PACKAGE_MAPPING[0];
  const Icon = planIcons[currentTier];
  const checkoutBillingCycle = status.billing.billingCycle ?? 'annually';
  const selectedBillingMarket = status.billing.market || autoBillingMarket;
  const activeBillingMarket = status.billing.market || selectedBillingMarket;
  const price = formatPlanPrice(currentPlan, checkoutBillingCycle, activeBillingMarket);
  const currentPlanSummary = currentPlan.description || currentPackage.summary;
  const providerLabel = getBillingProviderLabel(
    status.billing.subscriptionId
      ? status.billing.provider
      : getBillingProviderForMarket(selectedBillingMarket)
  );
  const marketDefinition = getPricingMarketDefinition(selectedBillingMarket);
  const isBillingInProgress = isBillingInProgressStatus(status.billing.subscriptionStatus);
  const pendingCheckoutPlan =
    isBillingInProgress && status.billing.pendingPlan ? status.billing.pendingPlan : null;
  const canResumePendingCheckout =
    isBillingInProgress &&
    pendingCheckoutPlan &&
    canContinuePendingCheckout({
      provider: status.billing.provider,
      subscriptionStatus: status.billing.subscriptionStatus,
    });
  const isDraftPendingCheckout = Boolean(canResumePendingCheckout);
  const pendingCancelLabel = isDraftPendingCheckout ? 'Discard checkout' : 'Clear pending billing';
  const pendingCancelBusyLabel = isDraftPendingCheckout ? 'Discarding checkout...' : 'Clearing pending billing...';
  const billingInProgressMessage = useMemo(
    () =>
      getBillingInProgressMessage({
        subscriptionStatus: status.billing.subscriptionStatus,
        pendingPlan: pendingCheckoutPlan,
      }),
    [pendingCheckoutPlan, status.billing.subscriptionStatus]
  );
  const showTrialExpiredUpgradeCta = status.trialAccess.isExpired && !isBillingInProgress;
  const showUpgradeButtons =
    status.billing.canStartCheckout &&
    (!isBillingInProgress || canResumePendingCheckout);
  const billingStatusLabel = getBillingStatusLabel(status.billing.subscriptionStatus);
  const currentPeriodEndLabel = useMemo(() => {
    if (!status.billing.currentPeriodEnd) return null;
    return new Date(status.billing.currentPeriodEnd).toLocaleDateString();
  }, [status.billing.currentPeriodEnd]);
  const trialEndsAtLabel = useMemo(() => {
    if (!status.organization?.trialEndsAt) return null;
    return new Date(status.organization.trialEndsAt).toLocaleDateString();
  }, [status.organization?.trialEndsAt]);
  const billingCardSummary = useMemo(() => {
    if (!status.billing.providerConfigured) {
      return 'Billing is not available in this environment yet. Contact support if you need help changing plans.';
    }

    if (showTrialExpiredUpgradeCta) {
      return 'Your trial has expired. Upgrade from the Pricing page to restore full workspace access.';
    }

    if (status.billing.cancelAtPeriodEnd) {
      return `Your paid plan remains active until ${currentPeriodEndLabel || 'the end of the current billing period'}. You can keep using the workspace normally until then.`;
    }

    if (isBillingInProgress) {
      return billingInProgressMessage;
    }

    if ((status.billing.subscriptionStatus || '').toLowerCase() === 'active') {
      return 'Your paid plan is active. You can manage upgrades and cancellation from this page.';
    }

    if ((status.billing.subscriptionStatus || '').toLowerCase() === 'paused') {
      return 'Your subscription is paused. Resume billing to restore your active paid plan.';
    }

    return 'You are currently on the free trial. Upgrade when you are ready to unlock paid workspace features.';
  }, [
    billingInProgressMessage,
    currentPeriodEndLabel,
    isBillingInProgress,
    showTrialExpiredUpgradeCta,
    status.billing.cancelAtPeriodEnd,
    status.billing.providerConfigured,
    status.billing.subscriptionStatus,
  ]);
  const billingPeriodLabel = useMemo(() => {
    if (status.billing.cancelAtPeriodEnd) {
      return 'Access until';
    }
    if ((status.billing.subscriptionStatus || '').toLowerCase() === 'active') {
      return 'Next renewal';
    }
    return 'Billing period';
  }, [status.billing.cancelAtPeriodEnd, status.billing.subscriptionStatus]);

  function showCheckoutCancelledToast(message?: string | null) {
    toast.error(message || CHECKOUT_CANCELLED_MESSAGE);
  }

  const availableUpgradePlans = useMemo(
    () =>
      status.billing.selfServePlans.filter(
        (plan) => TIER_ORDER[plan] > TIER_ORDER[currentTier]
      ),
    [currentTier, status.billing.selfServePlans]
  );
  const currentPlanHighlights = useMemo(() => {
    const seen = new Set<string>();
    return [...currentPlan.stats, ...currentPlan.features.map((feature) => feature.text)]
      .filter((item) => {
        const normalized = item.trim();
        if (!normalized || normalized.endsWith(':')) {
          return false;
        }
        if (seen.has(normalized)) {
          return false;
        }
        seen.add(normalized);
        return true;
      })
      .slice(0, 8);
  }, [currentPlan]);

  useEffect(() => {
    const paypalCheckoutState = searchParams.get('paypal_checkout');
    const checkoutState = searchParams.get('checkout');

    if (paypalCheckoutState === 'cancelled') {
      void (async () => {
        try {
          const result = await cancelPendingSubscriptionCheckout();
          showCheckoutCancelledToast(result.message);
        } catch {
          showCheckoutCancelledToast();
        } finally {
          clearPendingPayPalSubscriptionId();
          await refresh();
          router.replace(getDashboardAccountPath('subscription'));
        }
      })();
      return;
    }

    if (
      paypalCheckoutState === 'approved' &&
      !isCompletingHostedCheckoutRef.current
    ) {
      const subscriptionId =
        searchParams.get('subscription_id') ||
        getPendingPayPalSubscriptionId();

      if (!subscriptionId) {
        toast.error('Unable to resume PayPal checkout. Please start the upgrade again.');
        router.replace(getDashboardAccountPath('subscription'));
        return;
      }

      isCompletingHostedCheckoutRef.current = true;

      void (async () => {
        try {
          const result = await completeHostedSubscriptionCheckout({
            provider: 'paypal',
            subscriptionId,
          });
          clearPendingPayPalSubscriptionId();
          await refreshAccessToken().catch(() => false);
          await refresh();
          window.location.assign(result.redirectPath);
        } catch (error) {
          clearPendingPayPalSubscriptionId();
          toast.error(
            error instanceof Error
              ? error.message
              : 'Unable to complete PayPal checkout.'
          );
          router.replace(getDashboardAccountPath('subscription'));
        } finally {
          isCompletingHostedCheckoutRef.current = false;
        }
      })();

      return;
    }

    if (!checkoutState) return;

    void refresh();
    void refreshAccessToken();

    if (checkoutState === 'success') {
      toast.success('Subscription payment completed successfully.');
    } else if (checkoutState === 'processing') {
      toast.success('Payment completed. Billing activation is still syncing and should appear shortly.');
    }

    router.replace(getDashboardAccountPath('subscription'));
  }, [refresh, refreshAccessToken, router, searchParams]);

  async function handleCheckout(targetPlan: OrganizationTierId) {
    setBusyAction(targetPlan);
    try {
      const session = await startSubscriptionCheckout({
        targetPlan,
        billingCycle: checkoutBillingCycle,
        billingMarket: selectedBillingMarket,
      });
      if (session.message) {
        toast.success(session.message);
      }

      if (session.mode === 'checkout' && session.checkout) {
        if (session.checkout.provider === 'paypal' && session.checkout.flow === 'card_fields') {
          setPayPalCheckout(session.checkout);
          return;
        }

        const result = await openSubscriptionCheckout(session.checkout);
        if (!result) {
          return;
        }
        await refreshAccessToken().catch(() => false);
        await refresh();
        window.location.assign(result.redirectPath);
        return;
      }

      if (session.message) {
        toast.success(session.message);
      }
      await refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to start billing checkout.';
      if (message === CHECKOUT_CANCELLED_MESSAGE) {
        showCheckoutCancelledToast(message);
      } else {
        toast.error(message);
      }
    } finally {
      setBusyAction(null);
      void refresh();
    }
  }

  async function handleContinuePendingCheckout() {
    if (!pendingCheckoutPlan) {
      toast.error('There is no pending billing checkout to continue.');
      return;
    }

    setBusyAction(pendingCheckoutPlan);
    try {
      const session = await continuePendingSubscriptionCheckout();
      if (session.checkout.provider === 'paypal' && session.checkout.flow === 'card_fields') {
        setPayPalCheckout(session.checkout);
        return;
      }

      const result = await openSubscriptionCheckout(session.checkout);
      if (!result) {
        return;
      }
      await refreshAccessToken().catch(() => false);
      await refresh();
      window.location.assign(result.redirectPath);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to continue the pending billing checkout.';
      if (message === CHECKOUT_CANCELLED_MESSAGE) {
        showCheckoutCancelledToast(message);
      } else {
        toast.error(message);
      }
    } finally {
      setBusyAction(null);
      void refresh();
    }
  }

  async function handleManage(action: 'resume' | 'cancel', timing: 'now' | 'cycle_end' = 'cycle_end') {
    setBusyAction(action);
    try {
      const result = await manageSubscription({
        action,
        timing: action === 'cancel' ? timing : 'now',
      });
      toast.success(result.message);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update subscription.');
    } finally {
      setBusyAction(null);
      void refresh();
    }
  }

  return (
    <>
      <h2 className="text-2xl font-bold text-slate-900">Subscription</h2>
      <p className="text-sm text-slate-600 mt-2 mb-6">
        This page shows the package currently active for your account. Full package comparison,
        pricing, and upgrade paths live on the Pricing page.
      </p>
      {status.trialAccess.hasRestrictedControls && status.trialAccess.message ? (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {status.trialAccess.message}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr] mt-6">
        <section className="overflow-hidden rounded-xl border border-slate-200 shadow-sm  bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_48%,#f7fee7_100%)] p-6">
          <div>
          <div className="flex gap-4 mb-4">
            <div className="flex items-start gap-3 min-w-60">
              <div className="flex h-14 min-w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Current package</p>
                <h3 className="text-2xl font-semibold text-slate-900">{currentPlan.name}</h3>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-14 min-w-14 shrink-0 p-2 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
                <span className='font-semibold text-2xl'>{price}</span>
                </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Pricing snapshot</p>
                <span className="mt-1 text-sm text-slate-500">{getPriceCaption(currentTier, price)}</span>
              </div>
            </div>
          </div>

          <p className="max-w-2xl text-sm  text-slate-600 font-bold">
            {status.organization
              ? `${status.organization.name} is currently subscribed to ${getOrganizationPlanLabel(status.organization.plan)}.`
              : `${user?.email ?? 'This account'} is currently in the free trial workspace with Business Plus features during evaluation.`}
          </p>
          <p className="max-w-3xl text-sm  text-slate-700 pb-4">{currentPlanSummary}</p>
 
          <h3 className="text-lg font-semibold text-slate-900">Included in {currentPlan.name}</h3>
          <ul className="mt-4 space-y-3">
            {currentPlanHighlights.map((highlight) => (
              <li key={highlight} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </div>
         <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase  text-slate-500">Workspace</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {status.organization ? status.organization.name : 'Trial workspace'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {status.organization
                  ? 'Workspace features are scoped to this workspace.'
                  : 'Your free trial workspace includes Business Plus features while you evaluate which paid plan fits best.'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Plan status</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {loading ? 'Loading current package...' : currentPackage.status === 'ready' ? 'Ready now' : 'Partially available'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{currentPlan.tagline}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Seats</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {status.organization ? `${status.organization.activeMembers}/${status.organization.seatLimit}` : 'Trial workspace'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {status.organization
                  ? 'Active members versus total seats on the current workspace plan.'
                  : 'Seat-aware limits apply after the trial converts into a paid workspace plan.'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Teams</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {status.organization
                  ? status.organization.maxTeams !== null
                    ? `${status.organization.teamCount}/${status.organization.maxTeams}`
                    : `${status.organization.teamCount}`
                  : 'Included during trial'}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {status.organization
                  ? status.organization.maxTeams !== null
                    ? 'Current teams versus the limit for this package.'
                    : 'This package does not impose a team cap.'
                  : 'Use the trial to evaluate shared workflows before committing to a paid plan.'}
              </p>
            </div>          
        </div>
       
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Plan and billing</h3>
          <p className="mt-3 text-sm leading-5 text-slate-600">{billingCardSummary}</p>
          {status.billing.canStartCheckout ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Checkout market</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {marketDefinition.label} · {marketDefinition.shortLabel} · {marketDefinition.providerLabel}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {marketDefinition.description}
              </p>
            </div>
          ) : null}
          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-800">Plan status</span>
              <span>{billingStatusLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-800">Billing market</span>
              <span>{status.billing.market || marketDefinition.label}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-800">Billing provider</span>
              <span>{providerLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-800">Billing cycle</span>
              <span>{status.billing.billingCycle || 'Not started'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-800">{billingPeriodLabel}</span>
              <span>{currentPeriodEndLabel || 'Not available yet'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-800">Trial end</span>
              <span>{trialEndsAtLabel || 'No trial window'}</span>
            </div>
          </div>

          {!status.billing.providerConfigured && status.billing.statusMessage ? (
            <div
              className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {status.billing.statusMessage}
              {status.billing.missingConfig.length > 0
                ? ` Missing: ${status.billing.missingConfig.join(', ')}`
                : ''}
            </div>
          ) : null}

          {status.billing.cancelAtPeriodEnd ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Cancellation is scheduled for the end of the current billing cycle. The workspace stays active until {currentPeriodEndLabel || 'the current period ends'}.
            </div>
          ) : null}

          {isBillingInProgress && !showTrialExpiredUpgradeCta && !canResumePendingCheckout ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              If the continue checkout option is not available for this billing record, cancel the pending billing first, then choose your package again.
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {showTrialExpiredUpgradeCta ? (
              <Link
                href="/pricing"
                className="inline-flex w-full items-center justify-center rounded-md border border-rose-500 bg-[linear-gradient(135deg,#f43f5e_0%,#be123c_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_40px_-22px_rgba(190,24,93,0.9)] transition hover:brightness-105"
              >
                Upgrade Plan: Trial Expired
              </Link>
            ) : null}

            {!showTrialExpiredUpgradeCta && canResumePendingCheckout && status.billing.canStartCheckout ? (
              <Button
                size="sm"
                type="button"
                className="w-full justify-center"
                disabled={busyAction === pendingCheckoutPlan}
                onClick={handleContinuePendingCheckout}
              >
                {busyAction === pendingCheckoutPlan
                  ? `Reopening ${getOrganizationPlanLabel(pendingCheckoutPlan)} checkout...`
                  : `Resume ${getOrganizationPlanLabel(pendingCheckoutPlan)} checkout`}
              </Button>
            ) : null}

            {!showTrialExpiredUpgradeCta && showUpgradeButtons
              ? availableUpgradePlans
                .slice()
                .reverse()
                .filter((plan) => plan !== pendingCheckoutPlan)
                .map((plan, index) => (
                  <Button size="sm"
                    key={plan}
                    type="button"
                    className="w-full justify-center"
                    inverted={index > 0}
                    disabled={busyAction === plan}
                    onClick={() => handleCheckout(plan)}
                  >
                    {busyAction === plan
                      ? `${canResumePendingCheckout ? 'Switching to' : 'Opening'} ${getOrganizationPlanLabel(plan)} checkout...`
                      : canResumePendingCheckout
                        ? `Switch to ${getOrganizationPlanLabel(plan)}`
                        : `${currentTier === 'trial' ? 'Upgrade to' : 'Move up to'} ${getOrganizationPlanLabel(plan)}`}
                  </Button>
                ))
              : null}

            {!showTrialExpiredUpgradeCta &&
            status.billing.canManageSubscription &&
            status.billing.managementActions.includes('resume') ? (
              <Button size="sm"
                type="button"
                className="w-full justify-center"
                inverted
                disabled={busyAction === 'resume'}
                onClick={() => handleManage('resume')}
              >
                <PlayCircle className="h-4 w-4" />
                {busyAction === 'resume' ? 'Resuming subscription...' : 'Resume subscription'}
              </Button>
            ) : null}

            {!showTrialExpiredUpgradeCta &&
            status.billing.canManageSubscription &&
            status.billing.managementActions.includes('cancel') &&
            !status.billing.cancelAtPeriodEnd ? (
              <Button size="sm"
                type="button"
                className="w-full justify-center"
                inverted
                disabled={busyAction === 'cancel'}
                onClick={() => {
                  if (isBillingInProgress) {
                    const proceed = window.confirm(
                      isDraftPendingCheckout
                        ? 'Discard this unfinished checkout? This clears only the pending payment request. Workspace data, documents, and trial history stay intact.'
                        : 'Clear this pending billing attempt? Use this only if payment or activation appears stuck. Workspace data, documents, and trial history stay intact.'
                    );
                    if (!proceed) {
                      return;
                    }
                  }

                  void handleManage(
                    'cancel',
                    isBillingInProgress || status.billing.provider === 'paypal'
                      ? 'now'
                      : 'cycle_end'
                  );
                }}
              >
                {busyAction === 'cancel'
                  ? isBillingInProgress
                    ? pendingCancelBusyLabel
                    : status.billing.provider === 'paypal'
                      ? 'Cancelling subscription now...'
                      : 'Scheduling cancellation...'
                  : isBillingInProgress
                    ? pendingCancelLabel
                    : status.billing.provider === 'paypal'
                      ? 'Cancel subscription now'
                      : 'Cancel renewal'}
              </Button>
            ) : null}

            {status.billing.providerConfigured ? null : (
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Contact us to change package
              </Link>
            )}
          </div>

          <ul className="mt-5 space-y-3 text-sm  text-slate-600">
            {currentPackage.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <Link
            href="/pricing"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-sky-700 transition hover:text-sky-800"
          >
            Review package details on Pricing
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
        
        </div>
      <PayPalCardCheckoutModal
        open={Boolean(paypalCheckout)}
        checkout={paypalCheckout}
        customerName={resolveAccountContactName(user, authUser)}
        customerEmail={resolveAccountContactEmail(user, authUser)}
        onCancel={async () => {
          try {
            const result = await cancelPendingSubscriptionCheckout();
            showCheckoutCancelledToast(result.message);
          } catch {
            showCheckoutCancelledToast();
          } finally {
            await refresh();
          }
        }}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPayPalCheckout(null);
            setBusyAction(null);
          }
        }}
        onComplete={async (result) => {
          await refreshAccessToken().catch(() => false);
          await refresh();
          window.location.assign(result.redirectPath);
        }}
      />
    </>
  );
}
