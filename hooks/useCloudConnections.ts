'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { listCloudConnections } from '@/lib/cloud-client';
import type { CloudConnectionSummary } from '@/lib/cloud/types';

export function useCloudConnections(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [providers, setProviders] = useState<CloudConnectionSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    if (!enabled) {
      setProviders([]);
      setLoading(false);
      return [] as CloudConnectionSummary[];
    }

    setLoading(true);
    try {
      const next = await listCloudConnections();
      if (requestGeneration.current === generation) {
        setProviders(next);
      }
      return next;
    } catch (error) {
      if (requestGeneration.current === generation) {
        setProviders([]);
      }
      throw error;
    } finally {
      if (requestGeneration.current === generation) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      requestGeneration.current += 1;
      setProviders([]);
      setLoading(false);
      return;
    }

    void refresh().catch(() => undefined);

    return () => {
      requestGeneration.current += 1;
    };
  }, [enabled, refresh]);

  return { providers, loading, refresh };
}
