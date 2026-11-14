import { describe, expect, it } from 'vitest';

import {
  BILLING_COUNTRY_HEADER_NAME,
  getBillingMarketOverrideFromSearchParams,
  parseBillingMarketOverride,
  resolveInitialBillingMarket,
  resolveBillingMarketFromHeaders,
} from '@/lib/billing-market';

describe('billing market resolver', () => {
  it('resolves the billing market from country headers', () => {
    expect(
      resolveBillingMarketFromHeaders(
        new Headers({
          'x-vercel-ip-country': 'IN',
        })
      )
    ).toBe('india');

    expect(
      resolveBillingMarketFromHeaders(
        new Headers({
          'x-vercel-ip-country': 'US',
        })
      )
    ).toBe('international');
  });

  it('parses explicit billing market overrides', () => {
    expect(parseBillingMarketOverride('india')).toBe('india');
    expect(parseBillingMarketOverride('international')).toBe('international');
    expect(parseBillingMarketOverride(['international'])).toBe('international');
    expect(parseBillingMarketOverride('usd')).toBeNull();
    expect(parseBillingMarketOverride(undefined)).toBeNull();
    expect(
      getBillingMarketOverrideFromSearchParams(
        new URLSearchParams('billing_market=india')
      )
    ).toBe('india');
  });

  it('prefers explicit request overrides before automatic detection', () => {
    const headers = new Headers({
      'x-vercel-ip-country': 'IN',
      'accept-language': 'en-IN,en;q=0.9',
    });

    expect(
      resolveInitialBillingMarket({
        headers,
        searchParams: {
          billing_market: 'international',
        },
      })
    ).toBe('international');

    expect(
      resolveInitialBillingMarket({
        headers,
      })
    ).toBe('india');
  });

  it('does not infer India pricing from request language alone', () => {
    const headers = new Headers({
      'accept-language': 'en-IN,en;q=0.9',
    });

    expect(
      resolveInitialBillingMarket({
        headers,
      })
    ).toBe('international');
  });

  it('uses the forwarded billing country header before falling back to cookies', () => {
    expect(
      resolveInitialBillingMarket({
        headers: new Headers({
          [BILLING_COUNTRY_HEADER_NAME]: 'IN',
        }),
        regionCookie: 'US-CA',
      })
    ).toBe('india');

    expect(
      resolveInitialBillingMarket({
        headers: new Headers({
          [BILLING_COUNTRY_HEADER_NAME]: 'US',
        }),
        regionCookie: 'IN',
      })
    ).toBe('international');
  });

  it('uses the region cookie when country headers are unavailable', () => {
    expect(
      resolveInitialBillingMarket({
        headers: new Headers(),
        regionCookie: 'IN',
      })
    ).toBe('india');
  });
});
