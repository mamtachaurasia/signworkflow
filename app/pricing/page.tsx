import { cookies, headers } from 'next/headers';

import PricingPageClient from '@/app/pricing/PricingPageClient';
import PricingStructuredData from '@/app/pricing/PricingStructuredData';
import { PRICING_PAGE_FAQS } from '@/app/pricing/pricingFaqs';
import { CONSENT_REGION_COOKIE_NAME } from '@/lib/consent-regions';
import {
  resolveInitialBillingMarket,
} from '@/lib/billing-market';

type PricingPlansProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingPlans({ searchParams }: PricingPlansProps = {}) {
  const requestHeaders = await headers();
  const requestCookies = await cookies();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialBillingMarket = resolveInitialBillingMarket({
    headers: requestHeaders,
    searchParams: resolvedSearchParams,
    regionCookie: requestCookies.get(CONSENT_REGION_COOKIE_NAME)?.value,
  });

  return (
    <>
      <PricingStructuredData faqs={[...PRICING_PAGE_FAQS]} />
      <PricingPageClient initialBillingMarket={initialBillingMarket} />
    </>
  );
}
