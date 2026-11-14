'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { BillingCycle, BillingManagementAction, BillingMarket, BillingProvider } from '@/lib/billing';
import type { OrganizationTierId, PricingTierId } from '@/lib/subscription-plans';
import { useAppSelector } from '@/store/hooks';

type SubscriptionStatus = {
  workspaceTier: PricingTierId;
  trialAccess: {
    isExpired: boolean;
    hasRestrictedControls: boolean;
    message: string | null;
  };
  organization: {
    id: string;
    name: string;
    plan: string;
    normalizedTier: OrganizationTierId;
    status: string;
    seatLimit: number;
    activeMembers: number;
    teamCount: number;
    maxTeams: number | null;
    trialEndsAt: string | null;
    role: string | null;
  } | null;
  billing: {
    providerConfigured: boolean;
    provider: BillingProvider;
    market: BillingMarket | null;
    defaultMarket: BillingMarket;
    supportedMarkets: BillingMarket[];
    missingConfig: string[];
    canStartCheckout: boolean;
    canManageSubscription: boolean;
    managementActions: BillingManagementAction[];
    statusMessage: string | null;
    customerId: string | null;
    subscriptionId: string | null;
    subscriptionStatus: string | null;
    pendingPlan: OrganizationTierId | null;
    billingCycle: BillingCycle | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasScheduledChange: boolean;
    selfServePlans: OrganizationTierId[];
  };
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
    aiSelectionSummary: boolean;
    aiFullDocument: boolean;
    aiTranslation: boolean;
    aiExplanation: boolean;
    aiRiskAnalysis: boolean;
  };
  availablePlans: Array<{
    id: OrganizationTierId;
    seatLimit: number;
    maxTeams: number | null;
  }>;
};

const DEFAULT_STATUS: SubscriptionStatus = {
  workspaceTier: 'trial',
  trialAccess: {
    isExpired: false,
    hasRestrictedControls: false,
    message: null,
  },
  organization: null,
  billing: {
    providerConfigured: false,
    provider: 'razorpay',
    market: null,
    defaultMarket: 'international',
    supportedMarkets: [],
    missingConfig: [],
    canStartCheckout: false,
    canManageSubscription: false,
    managementActions: [],
    statusMessage: null,
    customerId: null,
    subscriptionId: null,
    subscriptionStatus: null,
    pendingPlan: null,
    billingCycle: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    hasScheduledChange: false,
    selfServePlans: [],
  },
  entitlements: {
    teams: false,
    multipleTeams: false,
    auditTrail: false,
    adminGovernance: false,
    orgSettings: false,
    retentionPolicies: false,
    legalHolds: false,
    auditExport: false,
    cloudLibrary: false,
    inviteLinks: false,
    templateCollaboration: false,
    bulkSend: false,
    paymentRequests: false,
    aiSelectionSummary: false,
    aiFullDocument: false,
    aiTranslation: false,
    aiExplanation: false,
    aiRiskAnalysis: false,
  },
  availablePlans: [],
};

type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  loading: boolean;
  updatedAt: number;
};

const EMPTY_SNAPSHOT: SubscriptionSnapshot = {
  status: DEFAULT_STATUS,
  loading: false,
  updatedAt: 0,
};

const cache = new Map<string, SubscriptionSnapshot>();
const inflightRequests = new Map<string, Promise<SubscriptionStatus>>();
const listeners = new Map<string, Set<() => void>>();
const SUBSCRIPTION_CACHE_TTL_MS = 60_000;

function getSnapshot(cacheKey: string): SubscriptionSnapshot {
  return cache.get(cacheKey) ?? EMPTY_SNAPSHOT;
}

function subscribe(cacheKey: string, listener: () => void): () => void {
  const cacheListeners = listeners.get(cacheKey) ?? new Set<() => void>();
  cacheListeners.add(listener);
  listeners.set(cacheKey, cacheListeners);
  return () => {
    cacheListeners.delete(listener);
    if (cacheListeners.size === 0) listeners.delete(cacheKey);
  };
}

function publish(cacheKey: string, snapshot: SubscriptionSnapshot): void {
  cache.set(cacheKey, snapshot);
  listeners.get(cacheKey)?.forEach((listener) => listener());
}

async function fetchSubscriptionStatus(
  cacheKey: string,
  options?: { background?: boolean; force?: boolean },
): Promise<SubscriptionStatus> {
  const cached = cache.get(cacheKey);
  if (
    !options?.force &&
    cached?.updatedAt &&
    Date.now() - cached.updatedAt < SUBSCRIPTION_CACHE_TTL_MS
  ) {
    return cached.status;
  }

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) return inflight;

  publish(cacheKey, {
    status: cached?.status ?? DEFAULT_STATUS,
    loading: options?.background !== true,
    updatedAt: cached?.updatedAt ?? 0,
  });

  const request = fetch('/api/subscription', {
    credentials: 'include',
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) return cached?.status ?? DEFAULT_STATUS;
      return (await response.json().catch(() => cached?.status ?? DEFAULT_STATUS)) as SubscriptionStatus;
    })
    .catch(() => cached?.status ?? DEFAULT_STATUS)
    .then((status) => {
      publish(cacheKey, { status, loading: false, updatedAt: Date.now() });
      return status;
    })
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, request);
  return request;
}

export function useSubscriptionStatus(options?: { enabled?: boolean; scopeKey?: string | null }) {
  const enabled = options?.enabled ?? true;
  const user = useAppSelector((state) => state.session.user);
  const explicitScopeKey = options?.scopeKey?.trim() || null;
  const inferredScopeKey = user?.id ? `${user.id}:${user.orgId ?? 'personal'}` : null;
  const scopeKey = explicitScopeKey ?? inferredScopeKey;
  const cacheKey = `subscription-status:${scopeKey ?? 'unscoped'}`;
  const canLoad = enabled && scopeKey !== null;
  const subscribeToStatus = useCallback(
    (listener: () => void) => subscribe(cacheKey, listener),
    [cacheKey],
  );
  const getStatusSnapshot = useCallback(() => getSnapshot(cacheKey), [cacheKey]);
  const snapshot = useSyncExternalStore(subscribeToStatus, getStatusSnapshot, () => EMPTY_SNAPSHOT);

  const refresh = useCallback(() => {
    if (!scopeKey) return Promise.resolve(DEFAULT_STATUS);
    return fetchSubscriptionStatus(cacheKey, { force: true });
  }, [cacheKey, scopeKey]);

  useEffect(() => {
    if (!canLoad) return;
    const isBackground = snapshot.updatedAt > 0;
    if (!isBackground || Date.now() - snapshot.updatedAt >= SUBSCRIPTION_CACHE_TTL_MS) {
      void fetchSubscriptionStatus(cacheKey, { background: isBackground });
    }
  }, [cacheKey, canLoad, snapshot.updatedAt]);

  return {
    status: scopeKey ? snapshot.status : DEFAULT_STATUS,
    loading: canLoad && (snapshot.loading || snapshot.updatedAt === 0),
    refresh,
  };
}
