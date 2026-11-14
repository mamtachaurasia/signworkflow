'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ACCOUNT_CONFIG, AccountSection } from '@/config/account.config';
import useContextStore from '@/hooks/useContextStore';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { isAdminRole } from '@/lib/role-utils';
import { useRouter } from 'next/navigation';
import {
  canAccessAccountSectionWithoutOrg,
  getDashboardAccountPath,
} from '@/lib/account-routing';
import { getRequiredTierLabelForFeature, type PlanFeatureKey } from '@/lib/subscription-plans';

type Props = {
  active: AccountSection;
  onChange: (section: AccountSection) => void;
};

export default function AccountSidebar({ active, onChange }: Props) {
  const { user } = useContextStore();
  const isAdmin = isAdminRole(user?.role);
  const hasOrgAccess = Boolean(user?.orgId);
  const { status: subscriptionStatus } = useSubscriptionStatus({ enabled: true });
  const router = useRouter();
  const itemRefs = useRef<Partial<Record<AccountSection, HTMLDivElement | null>>>({});
  const [openTooltip, setOpenTooltip] = useState<{
    id: AccountSection;
    badgeLabel: string;
    message: string;
  } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const visibleItems = ACCOUNT_CONFIG.filter((item) => {
    if (item.hidden) {
      return false;
    }
    return item.id === 'admin-governance' ? isAdmin : true;
  });

  useEffect(() => {
    if (!openTooltip) return;

    const updateTooltipPosition = () => {
      const anchor = itemRefs.current[openTooltip.id];
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 12,
      });
    };

    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);

    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [openTooltip]);

  const closeTooltip = () => {
    setOpenTooltip(null);
  };

  return (
    <nav className="space-y-1">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">My Account</h2> 
      {visibleItems.map(({ id, label, icon: Icon }) => {
        const requiresOrg = !canAccessAccountSectionWithoutOrg(id);
        const requiredFeature = getPlanFeatureForSection(id);
        const isPlanLocked =
          hasOrgAccess &&
          subscriptionStatus.organization !== null &&
          requiredFeature !== null &&
          !hasFeatureFromSubscription(requiredFeature, subscriptionStatus.entitlements);
        const isDisabled = (!hasOrgAccess && requiresOrg) || isPlanLocked;
        const badgeLabel = !hasOrgAccess && requiresOrg
          ? 'Requires workspace'
          : isPlanLocked && requiredFeature
            ? `Requires ${getRequiredTierLabelForFeature(requiredFeature)}`
            : null;
        const tooltipMessage = !hasOrgAccess && requiresOrg
          ? `${label} requires active workspace access.`
          : isPlanLocked && requiredFeature
            ? `${label} requires ${getRequiredTierLabelForFeature(requiredFeature)}.`
            : null;
        const showTooltip =
          isDisabled &&
          openTooltip?.id === id &&
          Boolean(badgeLabel) &&
          Boolean(tooltipMessage);

        return (
          <div
            key={id}
            className="relative"
            ref={(node) => {
              itemRefs.current[id] = node;
            }}
            tabIndex={isDisabled && badgeLabel ? 0 : undefined}
            aria-describedby={showTooltip ? `${id}-tooltip` : undefined}
            onMouseEnter={() => {
              if (isDisabled && badgeLabel && tooltipMessage) {
                setOpenTooltip({ id, badgeLabel, message: tooltipMessage });
              }
            }}
            onMouseLeave={closeTooltip}
            onFocus={() => {
              if (isDisabled && badgeLabel && tooltipMessage) {
                setOpenTooltip({ id, badgeLabel, message: tooltipMessage });
              }
            }}
            onBlur={closeTooltip}
          >
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                onChange(id);
                router.push(getDashboardAccountPath(id));
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border-l-4 transition
                ${
                  active === id
                    ? 'bg-slate-100 border-brand-600 text-slate-900'
                    : 'border-transparent text-slate-700 hover:bg-slate-50'
                }
                ${isDisabled ? 'cursor-not-allowed opacity-60 hover:bg-transparent' : ''}`}
            >
              <Icon className="w-5 h-5 text-slate-600" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          </div>
        );
      })}
      {openTooltip && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={`${openTooltip.id}-tooltip`}
              role="tooltip"
              className="pointer-events-none fixed z-80 w-64 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg"
              style={{
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transform: 'translateY(-50%)',
              }}
            >
              <p className="text-xs font-semibold uppercase text-slate-500">
                {openTooltip.badgeLabel}
              </p>
              <p className="mt-1 text-sm leading-5 text-slate-700">{openTooltip.message}</p>
            </div>,
            document.body
          )
        : null}
    </nav>
  );
}

function getPlanFeatureForSection(section: AccountSection): PlanFeatureKey | null {
  switch (section) {
    case 'my-teams':
      return 'teams';
    case 'audit-trail':
      return 'audit_trail';
    case 'admin-governance':
      return 'admin_governance';
    default:
      return null;
  }
}

function hasFeatureFromSubscription(
  feature: PlanFeatureKey,
  entitlements: {
    teams: boolean;
    multipleTeams: boolean;
    auditTrail: boolean;
    adminGovernance: boolean;
    orgSettings: boolean;
    retentionPolicies: boolean;
    legalHolds: boolean;
    auditExport: boolean;
    cloudLibrary: boolean;
    inviteLinks: boolean;
    templateCollaboration: boolean;
    bulkSend: boolean;
    paymentRequests: boolean;
  }
) {
  switch (feature) {
    case 'teams':
      return entitlements.teams;
    case 'audit_trail':
      return entitlements.auditTrail;
    case 'admin_governance':
      return entitlements.adminGovernance;
    default:
      return false;
  }
}
