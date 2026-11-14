'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_USER_SETTINGS, normalizeUserSettings, type UserSettings } from '@/lib/user-settings';

type UserSettingsSnapshot = {
  settings: UserSettings;
  loaded: boolean;
};

const EMPTY_SNAPSHOT: UserSettingsSnapshot = {
  settings: DEFAULT_USER_SETTINGS,
  loaded: false,
};

const settingsSnapshots = new Map<string, UserSettingsSnapshot>();
const inflightRequests = new Map<string, Promise<UserSettings>>();
const listeners = new Map<string, Set<() => void>>();

function normalizeAccountKey(accountKey?: string | null): string | null {
  const normalized = accountKey?.trim();
  return normalized || null;
}

function getSettingsSnapshot(accountKey: string | null): UserSettingsSnapshot {
  if (!accountKey) return EMPTY_SNAPSHOT;
  return settingsSnapshots.get(accountKey) ?? EMPTY_SNAPSHOT;
}

function getServerSnapshot(): UserSettingsSnapshot {
  return EMPTY_SNAPSHOT;
}

function subscribe(accountKey: string | null, listener: () => void): () => void {
  if (!accountKey) return () => undefined;

  const accountListeners = listeners.get(accountKey) ?? new Set<() => void>();
  accountListeners.add(listener);
  listeners.set(accountKey, accountListeners);

  return () => {
    accountListeners.delete(listener);
    if (accountListeners.size === 0) {
      listeners.delete(accountKey);
    }
  };
}

function publishSettings(accountKey: string, settings: UserSettings): void {
  settingsSnapshots.set(accountKey, { settings, loaded: true });
  listeners.get(accountKey)?.forEach((listener) => listener());
}

async function fetchUserSettings(
  accountKey: string,
  options?: { force?: boolean },
): Promise<UserSettings> {
  const inflightRequest = inflightRequests.get(accountKey);
  if (inflightRequest) return inflightRequest;

  const cachedSnapshot = settingsSnapshots.get(accountKey);
  if (!options?.force && cachedSnapshot?.loaded) return cachedSnapshot.settings;

  const request = fetch('/api/user/settings', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })
    .then(async (res) => {
      if (!res.ok) {
        return DEFAULT_USER_SETTINGS;
      }
      const payload = await res.json().catch(() => ({}));
      return normalizeUserSettings(payload);
    })
    .catch(() => DEFAULT_USER_SETTINGS)
    .then((settings) => {
      publishSettings(accountKey, settings);
      return settings;
    })
    .finally(() => {
      inflightRequests.delete(accountKey);
    });

  inflightRequests.set(accountKey, request);
  return request;
}

export function useUserSettings(options?: { enabled?: boolean; accountKey?: string | null }) {
  const enabled = options?.enabled ?? true;
  const accountKey = normalizeAccountKey(options?.accountKey);

  const subscribeToAccount = useCallback(
    (listener: () => void) => subscribe(accountKey, listener),
    [accountKey],
  );
  const getAccountSnapshot = useCallback(() => getSettingsSnapshot(accountKey), [accountKey]);
  const snapshot = useSyncExternalStore(subscribeToAccount, getAccountSnapshot, getServerSnapshot);

  const refresh = useCallback(async () => {
    if (!accountKey) return DEFAULT_USER_SETTINGS;
    return fetchUserSettings(accountKey, { force: true });
  }, [accountKey]);

  useEffect(() => {
    if (!enabled || !accountKey || snapshot.loaded) return;
    void fetchUserSettings(accountKey);
  }, [accountKey, enabled, snapshot.loaded]);

  return {
    settings: snapshot.settings,
    loading: enabled && Boolean(accountKey) && !snapshot.loaded,
    refresh,
  };
}
