'use client';

import Script from 'next/script';

import { getGoogleAnalyticsConfigScript } from '@/lib/gtag';

const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.GA_MEASUREMENT_ID;

export default function GoogleAnalytics() {
  return (
    <>
      {!GA_MEASUREMENT_ID ? null : (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="lazyOnload"
          />
          <Script id="google-analytics" strategy="lazyOnload">
            {getGoogleAnalyticsConfigScript(GA_MEASUREMENT_ID)}
          </Script>
        </>
      )}
    </>
  );
}
