import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { posts } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';
import nextConfig from '@/next.config';
import { proxy } from '@/proxy';

describe('SEO crawl policy', () => {
  it('publishes ads.txt with no authorized digital advertising sellers', () => {
    const adsTxt = readFileSync(join(process.cwd(), 'public/ads.txt'), 'utf8');

    expect(adsTxt).toContain('does not authorize any digital advertising sellers');
  });

  it('allows public pages and blocks internal application surfaces in robots.txt', () => {
    const policy = robots();

    expect(policy).toEqual(
      expect.objectContaining({
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
        rules: [
          expect.objectContaining({
            userAgent: '*',
            allow: '/',
            disallow: expect.arrayContaining([
              '/api/',
              '/account/',
              '/dashboard/',
              '/builder/',
              '/templates/',
              '/sign/',
              '/e2e/',
            ]),
          }),
        ],
      })
    );
  });

  it('includes lowercase blog routes and all blog posts in the sitemap', () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain(`${SITE_URL}/blog`);
    expect(urls).not.toContain(`${SITE_URL}/Blog`);
    expect(urls).toContain(`${SITE_URL}/templates`);
    expect(urls).not.toContain(`${SITE_URL}/docusign-alternative`);
    expect(urls).toContain(`${SITE_URL}/alternatives/docusign`);
    expect(urls).toContain(`${SITE_URL}/use-cases/offer-letters`);
    expect(urls).toContain(`${SITE_URL}/integrations/google-drive`);
    expect(urls).toContain(`${SITE_URL}/compare/signworkflow-vs-docusign`);

    posts.forEach((post) => {
      expect(urls).toContain(`${SITE_URL}/blog/${post.slug}`);
    });
  });

  it('permanently consolidates known legacy URL variants', async () => {
    if (!nextConfig.redirects) {
      throw new Error('Expected Next.js redirects to be configured.');
    }

    const redirects = await nextConfig.redirects();

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/index.html',
          destination: '/',
          permanent: true,
        }),
      ])
    );
  });

  it('permanently redirects only legacy casing variants without looping the canonical URL', () => {
    const legacyBlog = proxy(new NextRequest('https://signworkflow.test/Blog/how-to-sign?source=old'));
    const canonicalBlog = proxy(new NextRequest('https://signworkflow.test/blog/how-to-sign?source=old'));
    const legacyWhy = proxy(new NextRequest('https://signworkflow.test/why-signworkflow'));
    const canonicalWhy = proxy(new NextRequest('https://signworkflow.test/why-signWorkflow'));

    expect(legacyBlog.status).toBe(308);
    expect(legacyBlog.headers.get('location')).toBe(
      'https://signworkflow.test/blog/how-to-sign?source=old'
    );
    expect(canonicalBlog.headers.get('location')).toBeNull();

    expect(legacyWhy.status).toBe(308);
    expect(legacyWhy.headers.get('location')).toBe('https://signworkflow.test/why-signWorkflow');
    expect(canonicalWhy.headers.get('location')).toBeNull();
  });
});
