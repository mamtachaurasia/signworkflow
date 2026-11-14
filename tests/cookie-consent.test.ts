// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCEPT_ALL_COOKIE_PREFERENCES,
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  REJECT_ALL_COOKIE_PREFERENCES,
  createConsent,
  getConsent,
  saveConsent,
} from '@/lib/consent';
import {
  DEFAULT_CONSENT_MODE_STATE,
  GRANTED_CONSENT_MODE_STATE,
  getConsentModeState,
  getGoogleAnalyticsConfigScript,
  getConsentModeInitializationScript,
  initializeConsentMode,
  trackAnalyticsEvent,
  updateConsentMode,
} from '@/lib/gtag';
import {
  CONSENT_REGION_UNKNOWN,
  DEFAULT_CONSENT_REQUIRED_REGIONS,
  isConsentRequiredRegion,
  normalizeConsentRegion,
} from '@/lib/consent-regions';

function expireConsentCookie() {
  document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/`;
}

describe('cookie consent management', () => {
  beforeEach(() => {
    window.localStorage.clear();
    expireConsentCookie();
    window.dataLayer = undefined;
    window.gtag = undefined;
    window.__swCookieConsent = undefined;
    window.__swConsentModeInitialized = undefined;
    window.__swGaConfigured = undefined;
    window.__swGaMeasurementId = undefined;
    window.__swGaPageViewSent = undefined;
    vi.unstubAllEnvs();
  });

  it('stores consent in localStorage and a cookie', () => {
    const consent = saveConsent(createConsent(ACCEPT_ALL_COOKIE_PREFERENCES));
    const localStorageValue = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);

    expect(localStorageValue).not.toBeNull();
    expect(JSON.parse(localStorageValue ?? '{}')).toMatchObject({
      version: COOKIE_CONSENT_VERSION,
      necessary: true,
      analytics: true,
      marketing: true,
      functional: true,
    });
    expect(document.cookie).toContain(`${COOKIE_CONSENT_COOKIE_NAME}=`);
    expect(getConsent()).toMatchObject(consent);
  });

  it('falls back to cookie consent and hydrates localStorage', () => {
    const consent = createConsent({
      necessary: true,
      analytics: true,
      marketing: false,
      functional: true,
    });

    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(
      JSON.stringify(consent)
    )}; Path=/`;

    expect(getConsent()).toMatchObject({
      analytics: true,
      marketing: false,
      functional: true,
    });
    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toContain(
      '"analytics":true'
    );
  });

  it('clears stale consent when the stored version does not match', () => {
    const staleConsent = {
      version: COOKIE_CONSENT_VERSION - 1,
      acceptedAt: new Date().toISOString(),
      necessary: true,
      analytics: true,
      marketing: true,
      functional: true,
    };

    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(staleConsent));
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(
      JSON.stringify(staleConsent)
    )}; Path=/`;

    expect(getConsent()).toBeNull();
    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(`${COOKIE_CONSENT_COOKIE_NAME}=`);
  });

  it('initializes Google Consent Mode with denied optional storage defaults', () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    initializeConsentMode();

    expect(gtag).toHaveBeenCalledWith('consent', 'default', {
      ...DEFAULT_CONSENT_MODE_STATE,
      region: DEFAULT_CONSENT_REQUIRED_REGIONS,
    });
    expect(gtag).toHaveBeenCalledWith('consent', 'default', GRANTED_CONSENT_MODE_STATE);
  });

  it('normalizes visitor regions and treats unknown regions conservatively', () => {
    expect(normalizeConsentRegion('us', 'ca')).toBe('US-CA');
    expect(normalizeConsentRegion('in', null)).toBe('IN');
    expect(normalizeConsentRegion(null, null)).toBe(CONSENT_REGION_UNKNOWN);
    expect(isConsentRequiredRegion('US-CA')).toBe(true);
    expect(isConsentRequiredRegion('IN')).toBe(true);
    expect(isConsentRequiredRegion('SG')).toBe(false);
    expect(isConsentRequiredRegion(CONSENT_REGION_UNKNOWN)).toBe(true);
  });

  it('emits region-scoped denied defaults and broader granted defaults', () => {
    const script = getConsentModeInitializationScript();

    expect(script).toContain('"region":');
    expect(script).toContain('"IN"');
    expect(script).toContain('"US-CA"');
    expect(script).toContain('"analytics_storage":"denied"');
    expect(script).toContain('"analytics_storage":"granted"');
  });

  it('maps consent preferences to Google Consent Mode v2 updates', () => {
    expect(getConsentModeState(createConsent(ACCEPT_ALL_COOKIE_PREFERENCES))).toMatchObject({
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      functionality_storage: 'granted',
      security_storage: 'granted',
      personalization_storage: 'denied',
    });

    expect(getConsentModeState(createConsent(REJECT_ALL_COOKIE_PREFERENCES))).toMatchObject({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'denied',
      security_storage: 'granted',
      personalization_storage: 'denied',
    });
  });

  it('does not configure or fire GA events without analytics consent', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST');
    const gtag = vi.fn();
    const consent = createConsent(REJECT_ALL_COOKIE_PREFERENCES);
    window.gtag = gtag;
    window.__swCookieConsent = consent;

    updateConsentMode(consent);

    expect(gtag).toHaveBeenCalledWith('consent', 'update', expect.any(Object));
    expect(gtag).not.toHaveBeenCalledWith('config', 'G-TEST', expect.any(Object));
    expect(trackAnalyticsEvent('signworkflow_test')).toBe(false);
    expect(gtag).not.toHaveBeenCalledWith('event', 'signworkflow_test', undefined);
  });

  it('registers the Google tag for Tag Assistant without sending a page view before consent', () => {
    const script = getGoogleAnalyticsConfigScript('G-TEST');

    expect(script).toContain("window.gtag('config', measurementId");
    expect(script).toContain('"send_page_view":false');
    expect(script).toContain("storedConsent && storedConsent.analytics === true");
    expect(script).toContain("window.gtag('event', 'page_view'");
  });

  it('configures GA only after analytics consent is granted', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST');
    const gtag = vi.fn();
    const consent = createConsent(ACCEPT_ALL_COOKIE_PREFERENCES);
    window.gtag = gtag;

    updateConsentMode(consent);

    expect(gtag).toHaveBeenCalledWith('consent', 'update', expect.any(Object));
    expect(gtag).toHaveBeenCalledWith('js', expect.any(Date));
    expect(gtag).toHaveBeenCalledWith('config', 'G-TEST', {
      anonymize_ip: true,
      send_page_view: false,
    });
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', expect.any(Object));
  });
});
