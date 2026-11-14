import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  validateVersion,
} from '@/lib/consent';
import {
  CONSENT_REGION_COOKIE_NAME,
  CONSENT_REGION_UNKNOWN,
  getConsentRequiredRegions,
} from '@/lib/consent-regions';
import type { CookieConsent, GoogleConsentModeState } from '@/types/cookie';

const ANALYTICS_CONFIG = {
  anonymize_ip: true,
  send_page_view: false,
};

export const DEFAULT_CONSENT_MODE_STATE: GoogleConsentModeState = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
  wait_for_update: 500,
};

export const GRANTED_CONSENT_MODE_STATE: GoogleConsentModeState = {
  analytics_storage: 'granted',
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  functionality_storage: 'granted',
  security_storage: 'granted',
  personalization_storage: 'denied',
};

function isBrowser() {
  return typeof window !== 'undefined';
}

function getMeasurementId() {
  if (isBrowser() && window.__swGaMeasurementId) {
    return window.__swGaMeasurementId;
  }

  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
}

function ensureGtag() {
  if (!isBrowser()) {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
}

function permission(enabled: boolean) {
  return enabled ? 'granted' : 'denied';
}

export function getConsentModeState(consent: CookieConsent): GoogleConsentModeState {
  return {
    analytics_storage: permission(consent.analytics),
    ad_storage: permission(consent.marketing),
    ad_user_data: permission(consent.marketing),
    ad_personalization: permission(consent.marketing),
    functionality_storage: permission(consent.functional),
    security_storage: 'granted',
    personalization_storage: 'denied',
  };
}

export function hasAnalyticsConsent(consent: CookieConsent | null | undefined) {
  const currentConsent = consent ?? null;

  return validateVersion(currentConsent) && currentConsent.analytics === true;
}

export function initializeConsentMode(consent?: CookieConsent | null) {
  if (!isBrowser()) {
    return;
  }

  ensureGtag();

  if (!window.__swConsentModeInitialized) {
    const consentRequiredRegions = window.__swConsentRequiredRegions ?? getConsentRequiredRegions();

    window.gtag?.('consent', 'default', {
      ...DEFAULT_CONSENT_MODE_STATE,
      region: consentRequiredRegions,
    });
    window.gtag?.('consent', 'default', GRANTED_CONSENT_MODE_STATE);
    window.__swConsentModeInitialized = true;
  }

  if (consent) {
    updateConsentMode(consent);
  }
}

export function configureGoogleAnalytics(measurementId = getMeasurementId()) {
  if (!isBrowser() || !measurementId || window.__swGaConfigured) {
    return;
  }

  ensureGtag();
  window.gtag?.('js', new Date());
  window.gtag?.('config', measurementId, ANALYTICS_CONFIG);
  window.__swGaConfigured = true;
}

export function sendAnalyticsPageView(measurementId = getMeasurementId()) {
  if (!isBrowser() || !measurementId || !hasAnalyticsConsent(window.__swCookieConsent)) {
    return;
  }

  configureGoogleAnalytics(measurementId);

  if (window.__swGaPageViewSent) {
    return;
  }

  window.gtag?.('event', 'page_view', {
    page_location: window.location.href,
    page_path: `${window.location.pathname}${window.location.search}`,
    page_title: document.title,
    send_to: measurementId,
  });
  window.__swGaPageViewSent = true;
}

export function updateConsentMode(consent: CookieConsent) {
  if (!isBrowser()) {
    return;
  }

  ensureGtag();
  window.__swCookieConsent = consent;
  window.gtag?.('consent', 'update', getConsentModeState(consent));

  if (hasAnalyticsConsent(consent)) {
    configureGoogleAnalytics();
    sendAnalyticsPageView();
  }
}

export function trackAnalyticsEvent(eventName: string, params?: Record<string, unknown>) {
  if (!isBrowser() || !hasAnalyticsConsent(window.__swCookieConsent)) {
    return false;
  }

  ensureGtag();
  window.gtag?.('event', eventName, params);

  return true;
}

export function getConsentModeInitializationScript() {
  const consentRequiredRegions = getConsentRequiredRegions();
  const regionScopedDefaultConsent = {
    ...DEFAULT_CONSENT_MODE_STATE,
    region: consentRequiredRegions,
  };

  return `
    (function() {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
      window.__swConsentRequiredRegions = ${JSON.stringify(consentRequiredRegions)};

      var normalizeRegion = function(value) {
        return value ? String(value).trim().toUpperCase().replace('_', '-') : '';
      };
      var isConsentRequiredRegion = function(region) {
        var normalizedRegion = normalizeRegion(region);
        if (!normalizedRegion || normalizedRegion === ${JSON.stringify(CONSENT_REGION_UNKNOWN.toUpperCase())}) return true;
        var country = normalizedRegion.split('-')[0];
        for (var index = 0; index < window.__swConsentRequiredRegions.length; index += 1) {
          var requiredRegion = normalizeRegion(window.__swConsentRequiredRegions[index]);
          if (requiredRegion === normalizedRegion || requiredRegion === country) return true;
        }
        return false;
      };
      var readNamedCookie = function(name) {
        var cookiePrefix = name + '=';
        var cookies = document.cookie ? document.cookie.split('; ') : [];
        for (var index = 0; index < cookies.length; index += 1) {
          if (cookies[index].indexOf(cookiePrefix) === 0) {
            return decodeURIComponent(cookies[index].slice(cookiePrefix.length));
          }
        }
        return null;
      };

      window.__swConsentRegion = readNamedCookie(${JSON.stringify(CONSENT_REGION_COOKIE_NAME)}) || ${JSON.stringify(CONSENT_REGION_UNKNOWN)};
      window.__swConsentRegionRequiresBanner = isConsentRequiredRegion(window.__swConsentRegion);

      if (!window.__swConsentModeInitialized) {
        window.gtag('consent', 'default', ${JSON.stringify(regionScopedDefaultConsent)});
        window.gtag('consent', 'default', ${JSON.stringify(GRANTED_CONSENT_MODE_STATE)});
        window.__swConsentModeInitialized = true;
      }

      try {
        var storageKey = ${JSON.stringify(COOKIE_CONSENT_STORAGE_KEY)};
        var cookieName = ${JSON.stringify(COOKIE_CONSENT_COOKIE_NAME)};
        var consentVersion = ${COOKIE_CONSENT_VERSION};
        var parseConsent = function(rawValue) {
          if (!rawValue) return null;
          var value = JSON.parse(rawValue);
          if (
            !value ||
            value.version !== consentVersion ||
            typeof value.analytics !== 'boolean' ||
            typeof value.marketing !== 'boolean' ||
            typeof value.functional !== 'boolean'
          ) {
            return null;
          }
          return {
            version: value.version,
            acceptedAt: typeof value.acceptedAt === 'string' ? value.acceptedAt : '',
            necessary: true,
            analytics: value.analytics,
            marketing: value.marketing,
            functional: value.functional
          };
        };
        var storedConsent = parseConsent(window.localStorage && window.localStorage.getItem(storageKey)) || parseConsent(readNamedCookie(cookieName));

        if (storedConsent) {
          window.__swCookieConsent = storedConsent;
          window.gtag('consent', 'update', {
            analytics_storage: storedConsent.analytics ? 'granted' : 'denied',
            ad_storage: storedConsent.marketing ? 'granted' : 'denied',
            ad_user_data: storedConsent.marketing ? 'granted' : 'denied',
            ad_personalization: storedConsent.marketing ? 'granted' : 'denied',
            functionality_storage: storedConsent.functional ? 'granted' : 'denied',
            security_storage: 'granted',
            personalization_storage: 'denied'
          });
        } else if (!window.__swConsentRegionRequiresBanner) {
          window.__swCookieConsent = {
            version: consentVersion,
            acceptedAt: 'regional-default',
            source: 'regional-default',
            necessary: true,
            analytics: true,
            marketing: true,
            functional: true
          };
        }
      } catch (error) {}
    })();
  `;
}

export function getGoogleAnalyticsConfigScript(measurementId: string) {
  return `
    (function() {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };

      try {
        var measurementId = ${JSON.stringify(measurementId)};
        window.__swGaMeasurementId = measurementId;
        var storageKey = ${JSON.stringify(COOKIE_CONSENT_STORAGE_KEY)};
        var cookieName = ${JSON.stringify(COOKIE_CONSENT_COOKIE_NAME)};
        var consentVersion = ${COOKIE_CONSENT_VERSION};
        var regionCookieName = ${JSON.stringify(CONSENT_REGION_COOKIE_NAME)};
        var unknownRegion = ${JSON.stringify(CONSENT_REGION_UNKNOWN)};
        var consentRequiredRegions = window.__swConsentRequiredRegions || ${JSON.stringify(getConsentRequiredRegions())};
        var normalizeRegion = function(value) {
          return value ? String(value).trim().toUpperCase().replace('_', '-') : '';
        };
        var isConsentRequiredRegion = function(region) {
          var normalizedRegion = normalizeRegion(region);
          if (!normalizedRegion || normalizedRegion === normalizeRegion(unknownRegion)) return true;
          var country = normalizedRegion.split('-')[0];
          for (var index = 0; index < consentRequiredRegions.length; index += 1) {
            var requiredRegion = normalizeRegion(consentRequiredRegions[index]);
            if (requiredRegion === normalizedRegion || requiredRegion === country) return true;
          }
          return false;
        };
        var readNamedCookie = function(name) {
          var cookiePrefix = name + '=';
          var cookies = document.cookie ? document.cookie.split('; ') : [];
          for (var index = 0; index < cookies.length; index += 1) {
            if (cookies[index].indexOf(cookiePrefix) === 0) {
              return decodeURIComponent(cookies[index].slice(cookiePrefix.length));
            }
          }
          return null;
        };
        var consentRegion = window.__swConsentRegion || readNamedCookie(regionCookieName) || unknownRegion;
        var requiresConsentBanner = typeof window.__swConsentRegionRequiresBanner === 'boolean'
          ? window.__swConsentRegionRequiresBanner
          : isConsentRequiredRegion(consentRegion);
        var parseConsent = function(rawValue) {
          if (!rawValue) return null;
          var value = JSON.parse(rawValue);
          if (!value || value.version !== consentVersion || value.analytics !== true) {
            return null;
          }
          return value;
        };
        var storedConsent = window.__swCookieConsent || parseConsent(window.localStorage && window.localStorage.getItem(storageKey)) || parseConsent(readNamedCookie(cookieName));

        if (!window.__swGaConfigured) {
          window.gtag('js', new Date());
          window.gtag('config', measurementId, ${JSON.stringify(ANALYTICS_CONFIG)});
          window.__swGaConfigured = true;
        }

        if (
          (
            (storedConsent && storedConsent.analytics === true) ||
            (!storedConsent && !requiresConsentBanner)
          ) &&
          !window.__swGaPageViewSent
        ) {
          window.gtag('event', 'page_view', {
            page_location: window.location.href,
            page_path: window.location.pathname + window.location.search,
            page_title: document.title,
            send_to: measurementId
          });
          window.__swGaPageViewSent = true;
        }
      } catch (error) {}
    })();
  `;
}
