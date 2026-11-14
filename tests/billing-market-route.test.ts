import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/billing-market/route';
import { BILLING_COUNTRY_HEADER_NAME } from '@/lib/billing-market';

describe('billing market route', () => {
  it('returns India billing market from the forwarded country header', async () => {
    const req = new NextRequest('https://example.com/api/billing-market', {
      headers: {
        [BILLING_COUNTRY_HEADER_NAME]: 'IN',
      },
    });

    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.billingMarket).toBe('india');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('uses the region cookie when country headers are unavailable', async () => {
    const req = new NextRequest('https://example.com/api/billing-market', {
      headers: {
        cookie: 'sw_consent_region=IN',
      },
    });

    const res = await GET(req);
    const payload = await res.json();

    expect(payload.billingMarket).toBe('india');
  });

  it('prefers the explicit billing market query override', async () => {
    const req = new NextRequest(
      'https://example.com/api/billing-market?billing_market=international',
      {
        headers: {
          [BILLING_COUNTRY_HEADER_NAME]: 'IN',
        },
      }
    );

    const res = await GET(req);
    const payload = await res.json();

    expect(payload.billingMarket).toBe('international');
  });
});
