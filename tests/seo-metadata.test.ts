import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveSiteUrl,
  SITE_DESCRIPTION,
  SITE_OG_IMAGE_PATH,
  SITE_SOCIAL_IMAGE_HEIGHT,
  SITE_SOCIAL_IMAGE_TYPE,
  SITE_SOCIAL_IMAGE_WIDTH,
  SITE_TITLE,
  SITE_TWITTER_IMAGE_PATH,
} from '@/lib/site';

describe('SEO metadata', () => {
  it('keeps the default meta title concise', () => {
    expect(SITE_TITLE.length).toBeGreaterThanOrEqual(20);
    expect(SITE_TITLE.length).toBeLessThanOrEqual(60);
    expect(SITE_TITLE).toContain('SignWorkflow');
  });

  it('keeps the default meta description in the recommended range', () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThanOrEqual(150);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(220);
    expect(SITE_DESCRIPTION).toContain('secure workspace controls');
  });

  it('prevents localhost canonical URLs from leaking into production metadata', () => {
    expect(
      resolveSiteUrl({
        DOMAIN: 'http://localhost:3000',
        NODE_ENV: 'production',
      })
    ).toBe('https://signworkflow.com');

    expect(
      resolveSiteUrl({
        DOMAIN: 'http://localhost:3000',
        NODE_ENV: 'development',
      })
    ).toBe('http://localhost:3000');
  });

  it('uses the static SignWorkflow JPG for default social previews', () => {
    expect(SITE_OG_IMAGE_PATH).toBe('/singnworkflow-og-image.jpg');
    expect(SITE_TWITTER_IMAGE_PATH).toBe('/singnworkflow-og-image.jpg');
    expect(SITE_SOCIAL_IMAGE_WIDTH).toBe(1536);
    expect(SITE_SOCIAL_IMAGE_HEIGHT).toBe(1024);
    expect(SITE_SOCIAL_IMAGE_TYPE).toBe('image/jpeg');
  });

  it('renders Google Analytics when a measurement id is configured', () => {
    const analyticsComponent = readFileSync(join(process.cwd(), 'app/GoogleAnalytics.tsx'), 'utf8');
    const gtagHelpers = readFileSync(join(process.cwd(), 'lib/gtag.ts'), 'utf8');

    expect(analyticsComponent).toContain('NEXT_PUBLIC_GA_MEASUREMENT_ID');
    expect(analyticsComponent).toContain('www.googletagmanager.com/gtag/js');
    expect(analyticsComponent).toContain('getGoogleAnalyticsConfigScript');
    expect(gtagHelpers).toContain("window.gtag('consent', 'default'");
    expect(gtagHelpers).toContain("window.gtag('config'");
  });

  it('keeps homepage copy aligned with the SignWorkflow e-signature topic', () => {
    const homePage = readFileSync(join(process.cwd(), 'app/HomePageClient.tsx'), 'utf8');

    expect(homePage).toContain('SignWorkflow combines secure e-signature workflows');
  });
});
