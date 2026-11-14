'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@ui';
import { getDashboardAccountPath } from '@/lib/account-routing';

export const PERSONAL_WORKSPACE_BANNER_EYEBROW = 'Free Trial';
export const PERSONAL_WORKSPACE_BANNER_TITLE = 'You are on Free Trial';
export const PERSONAL_WORKSPACE_BANNER_SUBTITLE =
  'Your workspace includes Business Plus features during evaluation before you move to a paid plan';
export const PERSONAL_WORKSPACE_BANNER_MESSAGE =
  'Your free trial workspace is active now with Business Plus-style features for evaluation. Upgrade in Subscription when you are ready to move into a paid Business, Business Plus, or Enterprise workspace.';

type PersonalWorkspaceBannerProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  message?: string;
  className?: string;
  actions?: React.ReactNode;
};

export default function PersonalWorkspaceBanner({
  eyebrow = PERSONAL_WORKSPACE_BANNER_EYEBROW,
  title = PERSONAL_WORKSPACE_BANNER_TITLE,
  subtitle = PERSONAL_WORKSPACE_BANNER_SUBTITLE,
  message = PERSONAL_WORKSPACE_BANNER_MESSAGE,
  className = '',
  actions,
}: PersonalWorkspaceBannerProps) {
  const router = useRouter();

  const defaultActions = (
    <>
      <Button size="sm"
        type="button"
        label="View Subscription"
        onClick={() => router.push(getDashboardAccountPath('subscription'))}
        className="mb-0 text-xs"
      />
      <Button size="sm"
        type="button"
        inverted
        label="My Workspaces"
        onClick={() => router.push(getDashboardAccountPath('workspace'))}
        className="mb-0 text-xs"
      />
    </>
  );

  return (
    <section
      className={`rounded-md border border-amber-200 bg-amber-50 p-3 shadow-xs ${className}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.05em] text-amber-700">
            {eyebrow}
          </div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <p className="text-xs font-semibold text-slate-900">{subtitle}</p>
          <p className="mt-1 text-xs text-slate-700">{message}</p>
        </div>

        <div className="flex items-center gap-2">{actions ?? defaultActions}</div>
      </div>
    </section>
  );
}
