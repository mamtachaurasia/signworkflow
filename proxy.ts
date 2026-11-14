import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  ACCOUNT_SECTION_SLUGS,
  DASHBOARD_ACCOUNT_BASE,
  getAccountSectionFromSegment,
} from '@/lib/account-routing';
import {
  BILLING_COUNTRY_HEADER_NAME,
  getEdgeCountryHeaderValue,
} from '@/lib/billing-market';
import {
  CONSENT_REGION_COOKIE_NAME,
  normalizeConsentRegion,
} from '@/lib/consent-regions';
import {
  DASHBOARD_BUILDER_REQUEST_PATH_HEADER,
  getSafeDashboardBuilderReturnHref,
  isDashboardBuilderPathname,
} from '@/lib/dashboard-builder-auth';

function getRequestRegion(req: NextRequest) {
  const country = getEdgeCountryHeaderValue(req.headers);
  const subdivision =
    req.headers.get('x-vercel-ip-country-region') ||
    req.headers.get('x-region-code') ||
    req.headers.get('cloudfront-viewer-country-region');

  return normalizeConsentRegion(country, subdivision);
}

function withConsentRegionCookie(req: NextRequest, response: NextResponse) {
  response.cookies.set(CONSENT_REGION_COOKIE_NAME, getRequestRegion(req), {
    maxAge: 60 * 60 * 24,
    path: '/',
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
  });

  return response;
}

function getForwardedRequestHeaders(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  const country = getEdgeCountryHeaderValue(req.headers);

  // Never trust a client-supplied continuation header. Rebuild it exclusively
  // from NextRequest's same-origin parsed URL for the protected Builder aliases.
  requestHeaders.delete(DASHBOARD_BUILDER_REQUEST_PATH_HEADER);
  if (isDashboardBuilderPathname(req.nextUrl.pathname)) {
    const builderReturnHref = getSafeDashboardBuilderReturnHref(
      `${req.nextUrl.pathname}${req.nextUrl.search}`
    );
    if (builderReturnHref) {
      requestHeaders.set(DASHBOARD_BUILDER_REQUEST_PATH_HEADER, builderReturnHref);
    }
  }

  if (country) {
    requestHeaders.set(BILLING_COUNTRY_HEADER_NAME, country);
  } else {
    requestHeaders.delete(BILLING_COUNTRY_HEADER_NAME);
  }

  return requestHeaders;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Next.js config redirects are case-insensitive, so these legacy casing
  // variants must be handled here to avoid redirecting the canonical URL to
  // itself. The exact pathname check preserves the query string via clone().
  if (pathname === '/Blog' || pathname.startsWith('/Blog/')) {
    const nextUrl = req.nextUrl.clone();
    nextUrl.pathname = `/blog${pathname.slice('/Blog'.length)}`;
    return withConsentRegionCookie(req, NextResponse.redirect(nextUrl, 308));
  }

  if (pathname === '/why-signworkflow') {
    const nextUrl = req.nextUrl.clone();
    nextUrl.pathname = '/why-signWorkflow';
    return withConsentRegionCookie(req, NextResponse.redirect(nextUrl, 308));
  }

  if (pathname.startsWith('/account')) {
    const trimmed = pathname.replace(/^\/account\/?/, '');
    const segments = trimmed.split('/').filter(Boolean);
    const primary = segments[0] ?? 'profile';
    const section = getAccountSectionFromSegment(primary) ?? 'profile';
    const canonical = ACCOUNT_SECTION_SLUGS[section];
    const nextUrl = req.nextUrl.clone();
    const remainder = segments.slice(1);
    nextUrl.pathname = `${DASHBOARD_ACCOUNT_BASE}/${[canonical, ...remainder].join('/')}`;
    return withConsentRegionCookie(req, NextResponse.redirect(nextUrl));
  }

  return withConsentRegionCookie(
    req,
    NextResponse.next({
      request: {
        headers: getForwardedRequestHeaders(req),
      },
    })
  );
}

export const config = {
  matcher: [
    '/api/billing-market',
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
