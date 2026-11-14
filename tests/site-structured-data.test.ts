import { describe, expect, it } from 'vitest';

import { buildSiteStructuredData } from '@/lib/structured-data';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';

describe('site structured data', () => {
  it('describes the organization, website, software, and home page', () => {
    const schema = buildSiteStructuredData();

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'Organization',
          '@id': `${SITE_URL}/#organization`,
          name: SITE_NAME,
          url: SITE_URL,
          logo: `${SITE_URL}/SignWorkFlow_logo.svg`,
        }),
        expect.objectContaining({
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          name: SITE_NAME,
          description: SITE_DESCRIPTION,
          potentialAction: expect.objectContaining({
            '@type': 'SearchAction',
            target: `${SITE_URL}/blog?search={search_term_string}`,
            'query-input': 'required name=search_term_string',
          }),
        }),
        expect.objectContaining({
          '@type': 'SoftwareApplication',
          '@id': `${SITE_URL}/#software`,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          offers: expect.objectContaining({
            '@type': 'Offer',
            url: `${SITE_URL}/pricing`,
            price: '0',
            priceCurrency: 'USD',
            category: 'Free trial',
          }),
        }),
        expect.objectContaining({
          '@type': 'WebPage',
          '@id': `${SITE_URL}/#webpage`,
          url: SITE_URL,
        }),
      ])
    );

    // A generic Product node makes every route eligible for Product validation,
    // which requires an offer price and recommends real ratings/reviews. The
    // application node above is the accurate site-wide representation; priced
    // Product nodes are emitted only on the pricing page.
    expect(schema['@graph']).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'Product',
        }),
      ])
    );
  });
});
