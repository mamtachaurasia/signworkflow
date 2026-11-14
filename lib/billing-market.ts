export type BillingMarket = 'india' | 'international';
export type BillingMarketSearchParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

const INDIA_COUNTRY_MARKERS = new Set([
  'in',
  'ind',
  'india',
  'bharat',
]);

export const BILLING_COUNTRY_HEADER_NAME = 'x-sw-ip-country';

const EDGE_COUNTRY_HEADER_NAMES = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'cloudfront-viewer-country',
  'x-country-code',
  'x-country',
  'x-client-country',
  'x-geo-country',
  'x-ip-country',
  'true-client-country',
  'x-appengine-country',
];

const COUNTRY_HEADER_NAMES = [
  BILLING_COUNTRY_HEADER_NAME,
  ...EDGE_COUNTRY_HEADER_NAMES,
];

function normalizeValue(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function normalizeCountryValue(country?: string | null): string {
  return normalizeValue(country)
    .split(',')[0]
    ?.trim() || '';
}

export function parseBillingMarketOverride(
  value?: string | string[] | null
): BillingMarket | null {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = normalizeValue(rawValue);

  if (normalized === 'india' || normalized === 'international') {
    return normalized;
  }

  return null;
}

export function getBillingMarketOverrideFromSearchParams(
  searchParams?: BillingMarketSearchParams
): BillingMarket | null {
  if (!searchParams) {
    return null;
  }

  if (searchParams instanceof URLSearchParams) {
    return parseBillingMarketOverride(searchParams.get('billing_market'));
  }

  return parseBillingMarketOverride(searchParams.billing_market);
}

export function getBillingMarketFromCountry(country?: string | null): BillingMarket | null {
  const normalized = normalizeCountryValue(country);
  if (!normalized) return null;
  return INDIA_COUNTRY_MARKERS.has(normalized) ? 'india' : 'international';
}

export function getDefaultBillingMarket(country?: string | null): BillingMarket {
  return getBillingMarketFromCountry(country) || 'international';
}

function getFirstHeaderValue(
  headers: Pick<Headers, 'get'>,
  headerNames: readonly string[]
): string | null {
  for (const headerName of headerNames) {
    const value = headers.get(headerName);
    if (normalizeValue(value)) {
      return value;
    }
  }

  return null;
}

export function getEdgeCountryHeaderValue(headers: Pick<Headers, 'get'>): string | null {
  return getFirstHeaderValue(headers, EDGE_COUNTRY_HEADER_NAMES);
}

export function getBillingCountryHeaderValue(headers: Pick<Headers, 'get'>): string | null {
  return getFirstHeaderValue(headers, COUNTRY_HEADER_NAMES);
}

export function getBillingMarketFromHeaders(headers: Pick<Headers, 'get'>): BillingMarket | null {
  return getBillingMarketFromCountry(getBillingCountryHeaderValue(headers));
}

export function resolveBillingMarketFromHeaders(headers: Pick<Headers, 'get'>): BillingMarket {
  return getBillingMarketFromHeaders(headers) || 'international';
}

export function resolveInitialBillingMarket(args: {
  headers: Pick<Headers, 'get'>;
  searchParams?: BillingMarketSearchParams;
  regionCookie?: string | null;
}): BillingMarket {
  return (
    getBillingMarketOverrideFromSearchParams(args.searchParams) ||
    getBillingMarketFromHeaders(args.headers) ||
    getBillingMarketFromCountry(args.regionCookie) ||
    'international'
  );
}
