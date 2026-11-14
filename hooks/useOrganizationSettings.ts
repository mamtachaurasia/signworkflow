'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_ORGANIZATION_SETTINGS,
  normalizeOrganizationSettings,
  type OrganizationSettings,
} from '@/lib/org-settings';

type OrganizationSettingsPayload = {
  organizationId: string | null;
  organizationName: string;
  brandName: string;
  orgRole: string | null;
  settings: OrganizationSettings;
};

const settingsCache = new Map<string, OrganizationSettingsPayload>();
const inflightRequests = new Map<string, Promise<OrganizationSettingsPayload>>();

function getCacheKey(orgId?: string | null) {
  return orgId || '__no_org__';
}

function buildDefaultPayload(orgId?: string | null): OrganizationSettingsPayload {
  return {
    organizationId: orgId || null,
    organizationName: '',
    brandName: '',
    orgRole: null,
    settings: DEFAULT_ORGANIZATION_SETTINGS,
  };
}

async function fetchOrganizationSettings(orgId?: string | null): Promise<OrganizationSettingsPayload> {
  const cacheKey = getCacheKey(orgId);
  const cached = settingsCache.get(cacheKey);
  if (cached) return cached;

  const existingRequest = inflightRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = fetch('/api/orgs/settings', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })
    .then(async (res) => {
      if (!res.ok) {
        return buildDefaultPayload(orgId);
      }
      const payload = (await res.json().catch(() => ({}))) as Partial<OrganizationSettingsPayload>;
      return {
        organizationId: typeof payload.organizationId === 'string' ? payload.organizationId : orgId || null,
        organizationName: typeof payload.organizationName === 'string' ? payload.organizationName : '',
        brandName: typeof payload.brandName === 'string' ? payload.brandName : '',
        orgRole: typeof payload.orgRole === 'string' ? payload.orgRole : null,
        settings: normalizeOrganizationSettings(payload.settings),
      };
    })
    .catch(() => buildDefaultPayload(orgId))
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, request);
  const resolved = await request;
  settingsCache.set(cacheKey, resolved);
  return resolved;
}

export function useOrganizationSettings(options?: { enabled?: boolean; orgId?: string | null }) {
  const enabled = options?.enabled ?? true;
  const orgId = options?.orgId ?? null;
  const cacheKey = getCacheKey(orgId);
  const cachedPayload = settingsCache.get(cacheKey) || buildDefaultPayload(orgId);
  const [payload, setPayload] = useState<OrganizationSettingsPayload | null>(() =>
    settingsCache.get(cacheKey) || null
  );
  const [loadedKey, setLoadedKey] = useState<string | null>(() =>
    settingsCache.has(cacheKey) || !orgId ? cacheKey : null
  );
  const resolvedPayload = loadedKey === cacheKey && payload ? payload : cachedPayload;
  const loading = enabled && Boolean(orgId) && !settingsCache.has(cacheKey) && loadedKey !== cacheKey;

  const refresh = useCallback(async () => {
    settingsCache.delete(cacheKey);
    if (!enabled || !orgId) {
      const fallback = buildDefaultPayload(orgId);
      setPayload(fallback);
      setLoadedKey(cacheKey);
      return fallback;
    }
    const next = await fetchOrganizationSettings(orgId);
    setPayload(next);
    setLoadedKey(cacheKey);
    return next;
  }, [cacheKey, enabled, orgId]);

  useEffect(() => {
    let active = true;
    if (!enabled || !orgId || settingsCache.has(cacheKey) || loadedKey === cacheKey) {
      return () => {
        active = false;
      };
    }

    fetchOrganizationSettings(orgId).then((next) => {
      if (!active) return;
      setPayload(next);
      setLoadedKey(cacheKey);
    });

    return () => {
      active = false;
    };
  }, [cacheKey, enabled, loadedKey, orgId]);

  return {
    organizationId: resolvedPayload.organizationId,
    organizationName: resolvedPayload.organizationName,
    brandName: resolvedPayload.brandName,
    orgRole: resolvedPayload.orgRole,
    settings: resolvedPayload.settings,
    loading,
    refresh,
  };
}
