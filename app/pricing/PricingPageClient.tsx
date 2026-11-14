'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';

import { Badge } from '@ui';

import {
  PRICING_FEATURE_GROUPS,
  PRICING_PLANS,
  getFeatureAvailabilityLabel,
  getMaximumAnnualSavingsPercent,
  type FeatureAvailability,
} from '@/lib/pricing';
import type { OrganizationTierId } from '@/lib/subscription-plans';
import { AnimatePresence, motion } from 'motion/react';
import BillingToggle from '@/components/BillingToggle';
import Reveal from '@/components/common/Reveal';
import { PricingCard } from '@/components/common/PricingCard';
import FAQ from '@/components/common/FAQ';
import { BillingCycle, BillingMarket } from '@/lib/billing';
import { PRICING_PAGE_FAQS } from '@/app/pricing/pricingFaqs';
import { useAutoBillingMarket } from '@/hooks/useAutoBillingMarket';

const availabilityStyles: Record<FeatureAvailability, string> = {
  included: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  not_included: 'border-slate-200 bg-slate-50 text-slate-500',
  contact_sales: 'border-amber-200 bg-amber-50 text-amber-700',
  roadmap: 'border-sky-200 bg-sky-50 text-sky-700',
};

function AvailabilityPill({ value }: { value: FeatureAvailability }) {
  const label = getFeatureAvailabilityLabel(value);

  if (value === 'included' || value === 'not_included') {
    const Icon = value === 'included' ? Check : X;

    return (
      <span
        title={label}
        aria-label={label}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${availabilityStyles[value]}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-medium ${availabilityStyles[value]}`}
    >
      {label}
    </span>
  );
}

export default function PricingPageClient({
  initialBillingMarket = 'international',
}: {
  initialBillingMarket?: BillingMarket;
}) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annually');
  const { billingMarket } = useAutoBillingMarket(initialBillingMarket);
  const annualSavings = getMaximumAnnualSavingsPercent(billingMarket);
  const paidPlans = PRICING_PLANS.filter((plan) => plan.id !== 'trial');
  const comparablePlanIds: OrganizationTierId[] = ['business', 'business_plus', 'enterprise'];
  const comparablePlans = comparablePlanIds
    .map((planId) => PRICING_PLANS.find((plan) => plan.id === planId))
    .filter((plan): plan is (typeof PRICING_PLANS)[number] => plan !== undefined);
  const paidFeatureGroups = PRICING_FEATURE_GROUPS.map((group) => ({
    ...group,
    rows: group.rows.filter((row) =>
      comparablePlanIds.some((planId) => row.availability[planId] !== 'not_included')
    ),
  })).filter((group) => group.rows.length > 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef6ff_42%,#ffffff_100%)]">
      <section id="paid-plans" className="pt-28 p-4">
        <Reveal className="mb-0 text-center">
          <Badge className="mb-4 border-brand/20 bg-brand/10 text-xs font-semibold uppercase tracking-wider text-brand">
            Pricing
          </Badge>
          <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
            Simple, Transparent Pricing
          </h2>

          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-4 py-2 text-xs font-semibold uppercase text-sky-700 shadow-sm backdrop-blur">
            <Sparkles className="h-4 w-4" />
            AI review included • Business and above for long-term workspaces.
          </div>
          <p className="my-4 text-sm">Compare plan prices, included features, and billing options before you start.</p>
          <BillingToggle
            value={billingCycle}
            onChange={setBillingCycle}
            annualSavingsLabel={annualSavings ? `Save up to ${annualSavings}%` : null}
          />
          <p className="mx-auto mt-3 max-w-5xl text-sm text-slate-600">
            Start with a 30-day free trial that requires no credit card. The trial includes
            Business Plus features during evaluation. Paid plans renew on the billing cycle
            you select; review plan limits and renewal details before checkout.
          </p>
        </Reveal>

        <div className="mx-auto mt-16 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-4"
          >
            {paidPlans.map((plan, idx) => (
              <AnimatePresence key={plan.id} mode="wait">
                <div id={plan.id}>
                  <PricingCard
                    key={`${plan.id}-${billingCycle}-${billingMarket}`}
                    plan={plan}
                    billingCycle={billingCycle}
                    billingMarket={billingMarket}
                    index={idx + 1}
                  />
                </div>
              </AnimatePresence>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-7xl p-4">
        <div className="p-4 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">Compare Pricing & Feature Matrix</h2>
          <div className="mt-3 text-sm leading-6 text-slate-600">
            This comparison focuses on paid plans only.
            <p>
              Trial is the entry path, not a steady-state package, so the matrix below compares
              Business, Business Plus, and Enterprise for steady-state subscription packaging,
              including AI document intelligence.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:hidden">
          {paidFeatureGroups.map((group) => (
            <section key={group.title} className="rounded-xl border border-slate-200 bg-white/85 p-4 text-left">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {group.title}
              </h3>
              <div className="mt-4 space-y-4">
                {group.rows.map((row) => (
                  <article key={row.feature} className="rounded-lg border border-slate-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-slate-900">{row.feature}</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{row.description}</p>
                    <div className="mt-4 grid gap-2">
                      {comparablePlans.map((plan, index) => (
                        <div
                          key={`${row.feature}-${plan.id}`}
                          className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                        >
                          <span className="min-w-0 text-sm font-medium text-slate-700">{plan.name}</span>
                          <AvailabilityPill value={row.availability[comparablePlanIds[index]]} />
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6 hidden max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white/85 md:block">
          <div className="overflow-x-auto">
            <table className="min-w-190 border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-70 border-b border-slate-200 bg-white/95 px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Capability
                </th>
                {comparablePlans.map((plan) => (
                  <th
                    key={plan.id}
                    className="min-w-40 border-b border-slate-200 px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paidFeatureGroups.map((group) => (
                <FragmentGroup key={group.title} title={group.title} columns={comparablePlans.length + 1}>
                  {group.rows.map((row) => (
                    <tr key={row.feature}>
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-4 align-top">
                        <div className="text-sm font-medium text-slate-900">{row.feature}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{row.description}</div>
                      </td>
                      {comparablePlanIds.map((planId) => (
                        <td key={`${row.feature}-${planId}`} className="border-b border-slate-100 px-4 py-4 align-top">
                          <AvailabilityPill value={row.availability[planId]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </FragmentGroup>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col gap-10 px-4 pb-20 pt-16 sm:px-6 lg:px-8">
        <FAQ faqs={[...PRICING_PAGE_FAQS]} />
      </section>
    </main>
  );
}

function FragmentGroup({
  children,
  columns,
  title,
}: {
  children: ReactNode;
  columns: number;
  title: string;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={columns}
          className="bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
        >
          {title}
        </td>
      </tr>
      {children}
    </>
  );
}
