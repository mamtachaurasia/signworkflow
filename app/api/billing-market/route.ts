import { NextRequest, NextResponse } from 'next/server';

import { resolveInitialBillingMarket } from '@/lib/billing-market';
import { CONSENT_REGION_COOKIE_NAME } from '@/lib/consent-regions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const billingMarket = resolveInitialBillingMarket({
    headers: req.headers,
    searchParams: req.nextUrl.searchParams,
    regionCookie: req.cookies.get(CONSENT_REGION_COOKIE_NAME)?.value,
  });

  return NextResponse.json(
    { billingMarket },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
