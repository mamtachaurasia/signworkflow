'use client';

import Link from 'next/link';
import { ArrowUpRight, Clock3, Rocket, ShieldAlert } from 'lucide-react';

import { getTrialStatusInfo } from '@/lib/trial-status';

type TrialStatusCalloutProps = {
  trialEndsAt?: string | null;
  workspaceName?: string | null;
  className?: string;
  showActions?: boolean;
  variant?: 'default' | 'header';
};

const wrapperClasses = {
  active: 'border-brand-200 bg-brand-50/80',
  ending_soon: 'border-amber-200 bg-amber-50/90',
  expired: 'border-rose-200 bg-rose-50/90',
} as const;

const buttonClasses = {
  active:
    'border-brand-500 bg-[linear-gradient(135deg,#8b5cf6_0%,#7c3aed_100%)] text-white shadow-[0_16px_40px_-22px_rgba(124,58,237,0.9)] hover:brightness-105',
  ending_soon:
    'border-amber-500 bg-[linear-gradient(135deg,#f59e0b_0%,#ea580c_100%)] text-white shadow-[0_16px_40px_-22px_rgba(234,88,12,0.9)] hover:brightness-105',
  expired:
    'border-rose-500 bg-[linear-gradient(135deg,#f43f5e_0%,#be123c_100%)] text-white shadow-[0_16px_40px_-22px_rgba(190,24,93,0.9)] hover:brightness-105',
} as const;

function getUpgradeLabel(status: NonNullable<ReturnType<typeof getTrialStatusInfo>>) {
  if (status.state === 'expired') {
    return 'Upgrade Plan: Trial Expired';
  }

  const dayLabel = status.daysRemaining === 1 ? '1 Day Left' : `${status.daysRemaining} Days Left`;
  return `Upgrade Plan: ${dayLabel}`;
}

export default function TrialStatusCallout({
  trialEndsAt,
  workspaceName,
  className = '',
  showActions = true,
  variant = 'default',
}: TrialStatusCalloutProps) {
  const status = getTrialStatusInfo(trialEndsAt);

  if (!status) return null;

  if (!showActions) {
    return null;
  }

  const Icon = status.state === 'expired' ? ShieldAlert : status.state === 'ending_soon' ? Clock3 : Rocket;
  const ctaLabel = getUpgradeLabel(status);
  const srLabel = workspaceName
    ? `${workspaceName}. ${ctaLabel}. Trial ends ${status.formattedEndDate}.`
    : `${ctaLabel}. Trial ends ${status.formattedEndDate}.`;
  const isHeader = variant === 'header';

  return (
    <div className={`${isHeader ? '' : 'flex justify-end'} ${className}`}>
      <div
        className={`rounded-md border shadow-xs p-1  ${wrapperClasses[status.state]}`}
      >
        <Link
          href="/pricing"
          aria-label={srLabel}
          className={`inline-flex items-center gap-2 rounded-md p-2  text-xs font-semibold transition ${buttonClasses[status.state]}`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{ctaLabel}</span>
          <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
