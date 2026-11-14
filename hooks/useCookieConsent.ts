'use client';

import { useCookieConsentContext } from '@/contexts/CookieConsentContext';

export function useCookieConsent() {
  return useCookieConsentContext();
}

