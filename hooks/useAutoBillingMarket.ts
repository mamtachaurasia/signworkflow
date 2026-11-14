'use client';

import { useEffect, useState } from 'react';

import type { BillingMarket } from '@/lib/billing';

function isBillingMarket(value: unknown): value is BillingMarket {
  return value === 'india' || value === 'international';
}

function getBillingMarketEndpointPath(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return `/api/billing-market${window.location.search || ''}`;
}

export function useAutoBillingMarket(initialMarket: BillingMarket = 'international') {
  const [resolvedMarket, setResolvedMarket] = useState<{
    cacheKey: string;
    billingMarket: BillingMarket;
  } | null>(null);

  useEffect(() => {
    const endpointPath = getBillingMarketEndpointPath();
    if (!endpointPath || typeof window.fetch !== 'function') {
      return;
    }

    const cacheKey = `${initialMarket}:${endpointPath}`;
    const controller = new AbortController();

    void window.fetch(endpointPath, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        const nextMarket =
          payload && typeof payload === 'object'
            ? (payload as { billingMarket?: unknown }).billingMarket
            : null;

        if (isBillingMarket(nextMarket)) {
          setResolvedMarket({
            cacheKey,
            billingMarket: nextMarket,
          });
        }
      })
      .catch((error: unknown) => {
        if ((error as { name?: string } | null)?.name === 'AbortError') {
          return;
        }
      });

    return () => {
      controller.abort();
    };
  }, [initialMarket]);

  const activeEndpointPath = getBillingMarketEndpointPath();
  const activeCacheKey = activeEndpointPath ? `${initialMarket}:${activeEndpointPath}` : null;
  const billingMarket =
    resolvedMarket?.cacheKey === activeCacheKey
      ? resolvedMarket.billingMarket
      : initialMarket;

  return {
    billingMarket,
  };
}
