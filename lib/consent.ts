import type {
  CookieCategoryConfig,
  CookieConsent,
  CookieConsentPreferences,
} from '@/types/cookie';
import {
  CONSENT_REGION_COOKIE_NAME,
  isConsentRequiredRegion,
} from '@/lib/consent-regions';

export const COOKIE_CONSENT_COOKIE_NAME = 'sw_cookie_consent';
export const COOKIE_CONSENT_STORAGE_KEY = COOKIE_CONSENT_COOKIE_NAME;
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_MAX_AGE_DAYS = 365;

export const DEFAULT_COOKIE_PREFERENCES: CookieConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  functional: true,
};

export const ACCEPT_ALL_COOKIE_PREFERENCES: CookieConsentPreferences = {
  necessary: true,
  analytics: true,
  marketing: true,
  functional: true,
};

export const REJECT_ALL_COOKIE_PREFERENCES: CookieConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  functional: false,
};

export const COOKIE_CATEGORIES: CookieCategoryConfig[] = [
  {
    id: 'necessary',
    title: 'Necessary cookies',
    description:
      'Required for secure sign-in, session protection, signing flows, and core application behavior.',
    alwaysEnabled: true,
  },
  {
    id: 'analytics',
    title: 'Analytics cookies',
    description:
      'Help us understand product usage and session quality with Google Analytics measurement.',
  },
  {
    id: 'marketing',
    title: 'Marketing cookies',
    description:
      'Prepare consent for advertising and attribution tools such as Google Ads, Meta Pixel, and LinkedIn Insight.',
  },
  {
    id: 'functional',
    title: 'Functional cookies',
    description:
      'Remember product preferences and support optional tools such as chat widgets or personalization helpers.',
  },
];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function normalizeBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function normalizeConsent(value: unknown): CookieConsent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const consent = value as Record<string, unknown>;
  const version = typeof consent.version === 'number' ? consent.version : null;
  const acceptedAt = typeof consent.acceptedAt === 'string' ? consent.acceptedAt : null;
  const analytics = normalizeBoolean(consent.analytics);
  const marketing = normalizeBoolean(consent.marketing);
  const functional = normalizeBoolean(consent.functional);

  if (
    version === null ||
    acceptedAt === null ||
    analytics === null ||
    marketing === null ||
    functional === null
  ) {
    return null;
  }

  return {
    version,
    acceptedAt,
    source: consent.source === 'regional-default' ? 'regional-default' : 'explicit',
    necessary: true,
    analytics,
    marketing,
    functional,
  };
}

function parseConsent(rawValue: string | null | undefined): CookieConsent | null {
  if (!rawValue) {
    return null;
  }

  try {
    return normalizeConsent(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function readLocalStorageConsent(): CookieConsent | null {
  try {
    return parseConsent(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function readCookieValue(): string | null {
  const cookiePrefix = `${COOKIE_CONSENT_COOKIE_NAME}=`;
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(cookiePrefix));

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(cookiePrefix.length));
  } catch {
    return null;
  }
}

function readCookieConsent(): CookieConsent | null {
  return parseConsent(readCookieValue());
}

function writeLocalStorageConsent(consent: CookieConsent) {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }
}

function writeCookieConsent(consent: CookieConsent) {
  const expiresAt = new Date(Date.now() + COOKIE_CONSENT_MAX_AGE_DAYS * MILLISECONDS_PER_DAY);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';

  document.cookie = [
    `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(consent))}`,
    `Expires=${expiresAt.toUTCString()}`,
    'Path=/',
    'SameSite=Lax',
    secure.trim(),
  ]
    .filter(Boolean)
    .join('; ');
}

export function createConsent(preferences: CookieConsentPreferences): CookieConsent {
  return {
    version: COOKIE_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    source: 'explicit',
    necessary: true,
    analytics: preferences.analytics,
    marketing: preferences.marketing,
    functional: preferences.functional,
  };
}

export function validateVersion(consent: CookieConsent | null): consent is CookieConsent {
  return Boolean(consent && consent.version === COOKIE_CONSENT_VERSION);
}

export function saveConsent(consent: CookieConsent): CookieConsent {
  if (!isBrowser()) {
    return consent;
  }

  const normalizedConsent = createConsent(consent);

  writeLocalStorageConsent(normalizedConsent);
  writeCookieConsent(normalizedConsent);
  window.__swCookieConsent = normalizedConsent;

  return normalizedConsent;
}

export function clearConsent() {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }

  document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
  window.__swCookieConsent = undefined;
}

function readCookie(name: string): string | null {
  const cookiePrefix = `${name}=`;
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(cookiePrefix));

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(cookiePrefix.length));
  } catch {
    return null;
  }
}

export function getConsent(): CookieConsent | null {
  if (!isBrowser()) {
    return null;
  }

  const localStorageConsent = readLocalStorageConsent();

  if (validateVersion(localStorageConsent)) {
    return localStorageConsent;
  }

  const cookieConsent = readCookieConsent();

  if (validateVersion(cookieConsent)) {
    writeLocalStorageConsent(cookieConsent);
    return cookieConsent;
  }

  if (localStorageConsent || cookieConsent) {
    clearConsent();
  }

  return null;
}

export function getRegionalDefaultConsent(): CookieConsent | null {
  if (!isBrowser()) {
    return null;
  }

  const region = readCookie(CONSENT_REGION_COOKIE_NAME);

  if (isConsentRequiredRegion(region)) {
    return null;
  }

  return {
    version: COOKIE_CONSENT_VERSION,
    acceptedAt: 'regional-default',
    source: 'regional-default',
    necessary: true,
    analytics: true,
    marketing: true,
    functional: true,
  };
}

export function initializeConsent(): CookieConsent | null {
  const consent = getConsent();

  if (consent && isBrowser()) {
    window.__swCookieConsent = consent;
  }

  return consent;
}
