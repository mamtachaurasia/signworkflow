import { describe, expect, it } from 'vitest';

import {
  ALTERNATIVE_PAGES,
  COMPARISON_PAGES,
  INTEGRATION_PAGES,
  SEO_LANDING_PAGES,
  USE_CASE_PAGES,
  getSeoLandingPagePath,
} from '@/config/seo-pages.config';

describe('SEO landing-page strategy', () => {
  it('creates broad static landing-page coverage for requested SEO silos', () => {
    expect(USE_CASE_PAGES).toHaveLength(9);
    expect(INTEGRATION_PAGES).toHaveLength(9);
    expect(ALTERNATIVE_PAGES).toHaveLength(6);
    expect(COMPARISON_PAGES).toHaveLength(6);
    expect(SEO_LANDING_PAGES).toHaveLength(30);
  });

  it('keeps every landing page metadata-ready and internally linked', () => {
    const paths = new Set(SEO_LANDING_PAGES.map(getSeoLandingPagePath));

    expect(paths.size).toBe(SEO_LANDING_PAGES.length);
    expect(paths).toContain('/use-cases/nda-signing');
    expect(paths).toContain('/integrations/api');
    expect(paths).toContain('/alternatives/pandadoc');
    expect(paths).toContain('/compare/signworkflow-vs-adobe-sign');

    SEO_LANDING_PAGES.forEach((page) => {
      expect(page.metaTitle).toContain('SignWorkflow');
      expect(page.metaDescription.length).toBeGreaterThanOrEqual(120);
      expect(page.primaryKeyword.length).toBeGreaterThan(3);
      expect(page.secondaryKeywords.length).toBeGreaterThanOrEqual(3);
      expect(page.faqs.length).toBeGreaterThanOrEqual(4);
      expect(page.relatedLinks.length).toBeGreaterThanOrEqual(4);
    });
  });
});
