'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ACCEPT_ALL_COOKIE_PREFERENCES,
  DEFAULT_COOKIE_PREFERENCES,
  REJECT_ALL_COOKIE_PREFERENCES,
  createConsent,
  getRegionalDefaultConsent,
  initializeConsent,
  saveConsent,
} from '@/lib/consent';
import { initializeConsentMode, updateConsentMode } from '@/lib/gtag';
import type {
  CookieConsent,
  CookieConsentContextValue,
  CookieConsentPreferences,
} from '@/types/cookie';

export const CookieConsentContext = createContext<CookieConsentContextValue | undefined>(
  undefined
);

function normalizePreferences(preferences: CookieConsentPreferences): CookieConsentPreferences {
  return {
    necessary: true,
    analytics: preferences.analytics,
    marketing: preferences.marketing,
    functional: preferences.functional,
  };
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  useEffect(() => {
    const storedConsent = initializeConsent();
    const effectiveConsent = storedConsent ?? getRegionalDefaultConsent();
    let active = true;

    initializeConsentMode(storedConsent);
    queueMicrotask(() => {
      if (!active) return;
      setConsent(effectiveConsent);
      setIsLoaded(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const persistPreferences = useCallback((preferences: CookieConsentPreferences) => {
    const nextConsent = saveConsent(createConsent(normalizePreferences(preferences)));

    setConsent(nextConsent);
    updateConsentMode(nextConsent);
    setIsPreferencesOpen(false);
  }, []);

  const acceptAll = useCallback(() => {
    persistPreferences(ACCEPT_ALL_COOKIE_PREFERENCES);
  }, [persistPreferences]);

  const rejectAll = useCallback(() => {
    persistPreferences(REJECT_ALL_COOKIE_PREFERENCES);
  }, [persistPreferences]);

  const savePreferences = useCallback(
    (preferences: CookieConsentPreferences) => {
      persistPreferences(preferences);
    },
    [persistPreferences]
  );

  const openPreferences = useCallback(() => {
    setIsPreferencesOpen(true);
  }, []);

  const closePreferences = useCallback(() => {
    setIsPreferencesOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      acceptAll,
      rejectAll,
      savePreferences,
      openPreferences,
      closePreferences,
      consent,
      isLoaded,
      isPreferencesOpen,
    }),
    [
      acceptAll,
      closePreferences,
      consent,
      isLoaded,
      isPreferencesOpen,
      openPreferences,
      rejectAll,
      savePreferences,
    ]
  );

  return (
    <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>
  );
}

export function useCookieConsentContext() {
  const context = useContext(CookieConsentContext);

  if (!context) {
    throw new Error('useCookieConsent must be used within CookieConsentProvider');
  }

  return context;
}

export { DEFAULT_COOKIE_PREFERENCES };
