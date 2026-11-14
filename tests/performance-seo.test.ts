import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('performance-oriented SEO fixes', () => {
  it('server-renders the marketing hero for faster first paint', () => {
    const homePage = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    const marketingHero = readFileSync(
      join(process.cwd(), 'components/home/MarketingHero.tsx'),
      'utf8'
    );

    expect(homePage).toContain('MarketingHero');
    expect(marketingHero).toContain('Keep Every Document Moving.');
    expect(marketingHero).not.toContain("'use client'");
  });

  it('loads Google Analytics after the main page becomes interactive', () => {
    const analytics = readFileSync(join(process.cwd(), 'app/GoogleAnalytics.tsx'), 'utf8');

    expect(analytics).toContain('strategy="lazyOnload"');
    expect(analytics).not.toContain('strategy="afterInteractive"');
  });

  it('preloads a valid, cache-busted local marketing font', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    const globals = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const font = readFileSync(
      join(process.cwd(), 'public/fonts/PlusJakartaSans.woff2')
    );
    const assetVersion = createHash('sha256').update(font).digest('hex').slice(0, 8);
    const fontUrl = `/fonts/PlusJakartaSans.woff2?v=${assetVersion}`;

    expect(layout).toContain('rel="preload"');
    expect(layout).toContain(`href="${fontUrl}"`);
    expect(layout).toContain('type="font/woff2"');
    expect(globals).toContain(`url('${fontUrl}')`);
    expect(globals).toContain('font-display: swap');

    // Guard against binary assets accidentally passing through a text encoding.
    expect(font.subarray(0, 4).toString('ascii')).toBe('wOF2');
    expect(font.readUInt32BE(8)).toBe(font.byteLength);
    expect(font.readUInt16BE(12)).toBeGreaterThan(0);
    expect(font.readUInt16BE(14)).toBe(0);
    expect(font.readUInt32BE(16)).toBeGreaterThan(font.readUInt32BE(20));
  });

  it('keeps react-pdf styles out of the global CSS bundle', () => {
    const globals = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const builderLayout = readFileSync(join(process.cwd(), 'app/builder/layout.tsx'), 'utf8');

    expect(globals).not.toContain('react-pdf/dist/Page/TextLayer.css');
    expect(builderLayout).toContain('styles/react-pdf.css');
  });

  it('does not render unverified customer logo endorsements on the homepage', () => {
    const homePageClient = readFileSync(join(process.cwd(), 'app/HomePageClient.tsx'), 'utf8');

    expect(homePageClient).not.toContain('LazyCarouselSection');
    expect(homePageClient).not.toContain('@/components/Carousel');
  });
});
