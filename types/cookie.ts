export type CookieConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'functional';

export interface CookieConsentPreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

export interface CookieConsent extends CookieConsentPreferences {
  version: number;
  acceptedAt: string;
  source?: 'explicit' | 'regional-default';
}

export type ConsentModePermission = 'granted' | 'denied';

export interface GoogleConsentModeState {
  analytics_storage: ConsentModePermission;
  ad_storage: ConsentModePermission;
  ad_user_data: ConsentModePermission;
  ad_personalization: ConsentModePermission;
  functionality_storage: ConsentModePermission;
  security_storage: ConsentModePermission;
  personalization_storage: ConsentModePermission;
  wait_for_update?: number;
  region?: string[];
}

export interface CookieCategoryConfig {
  id: CookieConsentCategory;
  title: string;
  description: string;
  alwaysEnabled?: boolean;
}

export interface CookieConsentContextValue {
  acceptAll: () => void;
  rejectAll: () => void;
  savePreferences: (preferences: CookieConsentPreferences) => void;
  openPreferences: () => void;
  closePreferences: () => void;
  consent: CookieConsent | null;
  isLoaded: boolean;
  isPreferencesOpen: boolean;
}

export type GtagFunction = {
  (command: 'consent', action: 'default' | 'update', params: GoogleConsentModeState): void;
  (command: 'js', date: Date): void;
  (command: 'config', targetId: string, config?: Record<string, unknown>): void;
  (command: 'event', eventName: string, params?: Record<string, unknown>): void;
  (...args: unknown[]): void;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
    __swCookieConsent?: CookieConsent;
    __swConsentModeInitialized?: boolean;
    __swGaConfigured?: boolean;
    __swGaPageViewSent?: boolean;
    __swGaMeasurementId?: string;
    __swConsentRegion?: string;
    __swConsentRegionRequiresBanner?: boolean;
    __swConsentRequiredRegions?: string[];
  }
}
