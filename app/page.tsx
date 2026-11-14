import { cookies, headers } from 'next/headers';

import HomePageClient from '@/app/HomePageClient';
import MarketingHero from '@/components/home/MarketingHero';
import JsonLd from '@/components/marketing/JsonLd';
import { faqs } from '@/components/common/FAQ';
import { buildFaqStructuredData } from '@/lib/structured-data';
import { CONSENT_REGION_COOKIE_NAME } from '@/lib/consent-regions';
import {
  resolveInitialBillingMarket,
} from '@/lib/billing-market';

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
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
      <JsonLd
        data={buildFaqStructuredData(
          faqs.map(({ q, a }) => ({ question: q, answer: a }))
        )}
      />
      <div className="home-marketing-font">
        <MarketingHero />
        <HomePageClient initialBillingMarket={initialBillingMarket} />
      </div>
    </>
  );
}
