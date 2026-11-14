export const CONSENT_REGION_COOKIE_NAME = 'sw_consent_region';
export const CONSENT_REGION_UNKNOWN = 'unknown';

const EEA_AND_UK_CONSENT_REGIONS = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IS',
  'IE',
  'IT',
  'LV',
  'LI',
  'LT',
  'LU',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'GB',
  'CH',
] as const;

const ADDITIONAL_PRIVACY_REGIONS = [
  'BR',
  'CA',
  'IN',
  'MX',
  'ZA',
  'US-CA',
  'US-CO',
  'US-CT',
  'US-DE',
  'US-FL',
  'US-IA',
  'US-IN',
  'US-MD',
  'US-MN',
  'US-MT',
  'US-NE',
  'US-NH',
  'US-NJ',
  'US-OR',
  'US-TN',
  'US-TX',
  'US-UT',
  'US-VA',
] as const;

export const DEFAULT_CONSENT_REQUIRED_REGIONS = [
  ...EEA_AND_UK_CONSENT_REGIONS,
  ...ADDITIONAL_PRIVACY_REGIONS,
] as const;

function normalizeRegionCode(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace('_', '-') ?? '';
}

export function getConsentRequiredRegions() {
  const configuredRegions = process.env.NEXT_PUBLIC_COOKIE_CONSENT_REGIONS;

  if (!configuredRegions) {
    return [...DEFAULT_CONSENT_REQUIRED_REGIONS];
  }

  return configuredRegions
    .split(',')
    .map(normalizeRegionCode)
    .filter(Boolean);
}

export function normalizeConsentRegion(
  country: string | null | undefined,
  subdivision: string | null | undefined
) {
  const normalizedCountry = normalizeRegionCode(country);
  const normalizedSubdivision = normalizeRegionCode(subdivision);

  if (!normalizedCountry || normalizedCountry === CONSENT_REGION_UNKNOWN.toUpperCase()) {
    return CONSENT_REGION_UNKNOWN;
  }

  if (normalizedCountry === 'US' && normalizedSubdivision) {
    return `US-${normalizedSubdivision.replace(/^US-/, '')}`;
  }

  return normalizedCountry;
}

export function isConsentRequiredRegion(
  region: string | null | undefined,
  consentRequiredRegions = getConsentRequiredRegions()
) {
  const normalizedRegion = normalizeRegionCode(region);

  if (!normalizedRegion || normalizedRegion === CONSENT_REGION_UNKNOWN.toUpperCase()) {
    return true;
  }

  const country = normalizedRegion.split('-')[0] ?? normalizedRegion;
  const normalizedRequiredRegions = new Set(consentRequiredRegions.map(normalizeRegionCode));

  return normalizedRequiredRegions.has(normalizedRegion) || normalizedRequiredRegions.has(country);
}

