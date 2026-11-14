import { CheckCircle2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader } from "@ui";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";
import useContextStore from "@/hooks/useContextStore";
import { useAuth } from "../auth/AuthProvider";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { resolveAccountContactEmail, resolveAccountContactName } from '@/lib/account-contact';
import { getOrganizationPlanLabel, type OrganizationTierId } from '@/lib/subscription-plans';
import {
  getAnnualSavingsPercent,
  formatPlanDisplayPrice,
  getPlanDisplayBillingCaption,
  getPlanDisplayBillingUnitLabel,
  getPricingMarketDefinition,
  type PricingPlan,
} from "@/lib/pricing";
import {
  CHECKOUT_CANCELLED_MESSAGE,
  cancelPendingSubscriptionCheckout,
  continuePendingSubscriptionCheckout,
  manageSubscription,
  openSubscriptionCheckout,
  startSubscriptionCheckout,
} from "@/lib/subscription-client";
import toast from "react-hot-toast";
import { useState } from "react";
import Link from "next/link";
import type { BillingCycle, BillingMarket, PayPalCardCheckoutSession } from "@/lib/billing";
import PayPalCardCheckoutModal from "@/components/account/PayPalCardCheckoutModal";
import { canContinuePendingCheckout, isBillingInProgressStatus } from '@/lib/billing-status';

interface PricingCardProps {
  plan: PricingPlan;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  index: number;
}

function getPendingCheckoutProcessingLabel(args: {
  planLabel: string;
  subscriptionStatus?: string | null;
}) {
  const normalized = (args.subscriptionStatus || '').toLowerCase();

  if (normalized === 'authenticated') {
    return `${args.planLabel} payment processing`;
  }

  if (normalized === 'pending') {
    return `${args.planLabel} setup in progress`;
  }

  if (normalized === 'halted') {
    return `${args.planLabel} checkout needs attention`;
  }

  return `${args.planLabel} checkout in progress`;
}

export function PricingCard({ plan, billingCycle, billingMarket, index }: PricingCardProps) {
  const [busyAction, setBusyAction] = useState<OrganizationTierId | 'cancel' | null>(null);
  const [paypalCheckout, setPayPalCheckout] = useState<PayPalCardCheckoutSession | null>(null);
  const { user } = useContextStore();
  const { refreshAccessToken, user: authUser } = useAuth();
  const { status, refresh } = useSubscriptionStatus({ enabled: Boolean(user) });
  const PlanIcon = plan.icon;
  const price = formatPlanDisplayPrice(plan, billingCycle, billingMarket);
  const billingCaption = getPlanDisplayBillingCaption(billingCycle);
  const billingUnitLabel = getPlanDisplayBillingUnitLabel();
  const annualSavings = getAnnualSavingsPercent(plan, billingMarket);
  const marketDefinition = getPricingMarketDefinition(billingMarket);
  const isBillingInProgress = isBillingInProgressStatus(status.billing.subscriptionStatus);
  const pendingPlan = isBillingInProgress ? status.billing.pendingPlan : null;
  const canResumePendingCheckout =
    Boolean(pendingPlan) &&
    canContinuePendingCheckout({
      provider: status.billing.provider,
      subscriptionStatus: status.billing.subscriptionStatus,
    });
  const canCancelPendingCheckout =
    isBillingInProgress && status.billing.managementActions.includes('cancel');
  const isDraftPendingCheckout = canResumePendingCheckout;
  const pendingCancelLabel = isDraftPendingCheckout ? 'Discard checkout' : 'Clear pending billing';
  const pendingCancelBusyLabel = isDraftPendingCheckout ? 'Discarding checkout...' : 'Clearing pending billing...';

  function showCheckoutCancelledToast(message?: string | null) {
    toast.error(message || CHECKOUT_CANCELLED_MESSAGE);
  }

  async function handleCheckout(targetPlan: OrganizationTierId) {
    setBusyAction(targetPlan);
    try {
      const session = await startSubscriptionCheckout({
        targetPlan,
        billingCycle,
        billingMarket,
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
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start billing checkout.';
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleContinuePendingCheckout() {
    if (!pendingPlan) {
      toast.error('There is no pending billing checkout to continue.');
      return;
    }

    setBusyAction(pendingPlan);
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
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to continue the pending billing checkout.'
      );
    } finally {
      setBusyAction(null);
      void refresh();
    }
  }

  async function handleCancelPendingCheckout() {
    const proceed = window.confirm(
      isDraftPendingCheckout
        ? 'Discard this unfinished checkout? This clears only the pending payment request. Workspace data, documents, and trial history stay intact.'
        : 'Clear this pending billing attempt? Use this only if payment or activation appears stuck. Workspace data, documents, and trial history stay intact.'
    );
    if (!proceed) {
      return;
    }

    setBusyAction('cancel');
    try {
      const result = await manageSubscription({
        action: 'cancel',
        timing: 'now',
      });
      toast.success(result.message);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to cancel pending billing.');
    } finally {
      setBusyAction(null);
      void refresh();
    }
  }
  return (
    <>
      <Card
        className={cn(
          "h-full relative",
          plan.isPopular
            ? "border-brand shadow-lg shadow-brand/15 ring-2 ring-brand/30"
            : '',
        )}
        data-ocid={`pricing.card.${index}`}
      >
        {plan.isPopular && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <Badge className="bg-brand text-white border-0 px-4 py-1 text-xs font-bold shadow-lg">
              Most Popular
            </Badge>
          </div>
        )}
        {/* Icon + Name */}
        <CardHeader>
          <div className="flex items-start gap-2">
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                plan.isPopular
                  ? "bg-brand-200/50 text-brand-600"
                  : "bg-slate-100 text-muted-foreground",
              )}
            >
              <PlanIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground leading-tight">
                {plan.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {plan.tagline}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Price */}
          <p className="text-xs text-muted-foreground">{plan.description}</p>
          <div className="border-t border-gray-300 pt-4">
            {plan.isCustom ? (
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground tracking-tight">
                  Custom
                </span>
              </div>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-foreground tracking-tight">
                  {price}
                </span>
                <span className="text-sm text-muted-foreground">{billingUnitLabel}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5 h-4">
              {!plan.isCustom ? billingCaption : null}
            </p>
            {!plan.isCustom && billingCycle === 'annually' && annualSavings ? (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                Save {annualSavings}% with annual billing
              </p>
            ) : null}
          </div>

          {/* Stats */}
          {plan.stats.length > 0 && (
            <div className="flex flex-col gap-1">
              {plan.stats.map((stat) => (
                <div key={stat} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">{stat}</span>
                </div>
              ))}
            </div>
          )}

        {/* CTA */}
        {user && plan.id !== 'site_license' ? (
          (() => {
            const checkoutPlanId = plan.id as OrganizationTierId;
            const pendingPlanLabel = pendingPlan
              ? getOrganizationPlanLabel(pendingPlan)
              : null;
            const isPendingPlanCard = pendingPlan === checkoutPlanId;

            if (pendingPlan && isPendingPlanCard) {
              return (
                <div className="space-y-2">
                  {canResumePendingCheckout ? (
                    <Button
                      size="sm"
                      type="button"
                      variant={plan.isPopular ? 'brand' : 'outlineBrand'}
                      disabled={busyAction === pendingPlan}
                      onClick={handleContinuePendingCheckout}
                    >
                      {busyAction === pendingPlan
                        ? `Reopening ${plan.name} checkout...`
                        : `Resume ${plan.name} checkout`}
                    </Button>
                  ) : (
                    <Button size="sm" type="button" variant="outlineBrand" disabled>
                      {getPendingCheckoutProcessingLabel({
                        planLabel: plan.name,
                        subscriptionStatus: status.billing.subscriptionStatus,
                      })}
                    </Button>
                  )}
                  {canCancelPendingCheckout ? (
                    <Button
                      size="sm"
                      type="button"
                      variant="outlineBrand"
                      disabled={busyAction === 'cancel'}
                      onClick={handleCancelPendingCheckout}
                    >
                      {busyAction === 'cancel'
                        ? pendingCancelBusyLabel
                        : pendingCancelLabel}
                    </Button>
                  ) : null}
                  {canResumePendingCheckout ? null : (
                    <p className="text-xs leading-5 text-amber-700">
                      Payment is processing. Activation should complete shortly.
                    </p>
                  )}
                </div>
              );
            }

            if (pendingPlan && pendingPlanLabel) {
              const isCurrentPackage = status.workspaceTier === checkoutPlanId;
              if (!isCurrentPackage && canResumePendingCheckout) {
                return (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      type="button"
                      variant={plan.isPopular ? 'brand' : 'outlineBrand'}
                      disabled={busyAction === checkoutPlanId}
                      onClick={() => handleCheckout(checkoutPlanId)}
                    >
                      {busyAction === checkoutPlanId
                        ? `Switching to ${plan.name}...`
                        : `Switch to ${plan.name}`}
                    </Button>
                    <p className="text-xs leading-5 text-emerald-700">
                      {`Switching plans will replace the ${pendingPlanLabel} checkout draft.`}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  <Button size="sm" type="button" variant="outlineBrand" disabled>
                    {isCurrentPackage ? 'Current package' : `Finish ${pendingPlanLabel} checkout first`}
                  </Button>
                  <p className="text-xs leading-5 text-amber-700">
                    {isCurrentPackage
                      ? `This workspace already has a ${pendingPlanLabel} checkout in progress.`
                      : `This workspace already has a ${pendingPlanLabel} checkout in progress. Wait for activation before switching to ${plan.name}.`}
                  </p>
                </div>
              );
            }

            return status.billing.canStartCheckout &&
                status.billing.selfServePlans.includes(checkoutPlanId) ? (
              <Button size="sm"
                type="button"
                variant={plan.isPopular ? 'brand' : 'outlineBrand'}
                disabled={busyAction === checkoutPlanId || status.workspaceTier === checkoutPlanId}
                onClick={() => handleCheckout(checkoutPlanId)}
              >
                {status.workspaceTier === checkoutPlanId
                  ? 'Current package'
                  : busyAction === checkoutPlanId
                    ? billingMarket === 'india'
                      ? 'Opening Razorpay checkout...'
                      : 'Opening secure card checkout...'
                    : plan.ctaLabel}
              </Button>
            ) : (
              <Button size="sm" asChild variant={status.workspaceTier === plan.id ? 'brand' : 'outlineBrand'}>
                <Link href="/dashboard/account/subscription">
                  {status.workspaceTier === plan.id
                    ? 'Current package'
                    : 'View subscription details'}
                </Link>
              </Button>
            );
            })()
          ) : (
            <Button size="sm" asChild variant="outlineBrand">
              <Link href={plan.ctaHref}>
                {plan.ctaLabel}
              </Link>
            </Button>
          )}

          {/* Divider */}
          <div className="border-t border-gray-300" />

          {/* Features */}
          <ul className="flex flex-col gap-2">
            {plan.features.map((feature, inx) => (
              <li key={feature.text} className="flex items-start gap-2.5">
                { inx > 0 && (
                  feature.included ? (
                    <Check className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                  ) : (
                    <Minus className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                  )

                )}
                <span className={`text-xs leading-relaxed ${inx > 0 ? '' : 'font-bold'}`}>
                  {feature.text}
                </span>
              </li>
            ))}
          </ul>
          {!plan.isCustom ? (
            <p className="text-xs text-slate-500">
              {marketDefinition.description}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <PayPalCardCheckoutModal
        open={Boolean(paypalCheckout)}
        checkout={paypalCheckout}
        customerName={resolveAccountContactName(user, authUser)}
        customerEmail={resolveAccountContactEmail(user, authUser)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPayPalCheckout(null);
            setBusyAction(null);
          }
        }}
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
        onComplete={async (result) => {
          await refreshAccessToken().catch(() => false);
          await refresh();
          window.location.assign(result.redirectPath);
        }}
      />
    </>
  );
}
