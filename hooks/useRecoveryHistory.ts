'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type HistoryFilters = { status: string; from: string; to: string };

export function useRecoveryHistory<T extends { id: string }>(
  endpoint: string,
  collection: string,
  onRefresh?: (payload: Record<string, unknown>) => void,
) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<HistoryFilters>({ status: '', from: '', to: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const hasLoaded = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { hasLoaded.current = false; }, [collection, endpoint]);

  const load = useCallback(async (cursor?: string, refreshDetails = false) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: '25' });
    if (filters.status) params.set('status', filters.status);
    if (filters.from) params.set('from', `${filters.from}T00:00:00.000Z`);
    if (filters.to) params.set('to', `${filters.to}T23:59:59.999Z`);
    if (cursor) params.set('cursor', cursor);
    try {
      const response = await fetch(`${endpoint}?${params}`, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Unable to load history.');
      if (version !== requestVersion.current) return;
      const incoming: T[] = Array.isArray(payload[collection]) ? payload[collection] : [];
      setItems((current) => cursor ? [...current, ...incoming.filter((item) => !current.some((existing) => existing.id === item.id))] : incoming);
      setNextCursor(payload.nextCursor || null);
      // Settings and history share one endpoint. Consume its settings on the
      // first successful load and explicit refreshes, but never overwrite an
      // unsaved settings draft when paging or changing history filters.
      if (!hasLoaded.current || refreshDetails) onRefreshRef.current?.(payload);
      hasLoaded.current = true;
      return true;
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : 'Unable to load history.');
      return false;
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [collection, endpoint, filters]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  return { items, nextCursor, filters, setFilters, loading, error, refresh: () => load(undefined, true), loadMore: () => nextCursor ? load(nextCursor) : Promise.resolve() };
}
