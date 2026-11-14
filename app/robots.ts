import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/account/',
          '/dashboard/',
          '/builder/',
          // The root template library is a public, indexable landing page.
          // Keep only nested template workspaces out of search results.
          '/templates/',
          '/trash/',
          '/sign/',
          '/e2e/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
