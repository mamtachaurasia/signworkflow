import { describe, expect, it } from 'vitest';

import { INTEGRATION_PAGES } from '@/config/seo-pages.config';

describe('integration landing-page availability copy', () => {
  it('treats the public API and signed webhooks as a shipped integration', () => {
    const apiPage = INTEGRATION_PAGES.find((page) => page.slug === 'api');

    expect(apiPage).toEqual(expect.objectContaining({
      statusLabel: 'Public API and signed webhooks',
      metaDescription: expect.stringContaining('public API and signed webhooks'),
      description: expect.stringContaining('Use SignWorkflow with SignWorkflow API to upload documents'),
    }));
    expect(apiPage?.metaDescription).not.toContain('not a currently shipped native connector');
    expect(apiPage?.description).not.toContain('could upload documents');
  });

  it('continues to label unsupported native connectors as planning guides', () => {
    const salesforcePage = INTEGRATION_PAGES.find((page) => page.slug === 'salesforce');

    expect(salesforcePage?.metaDescription).toContain('not a currently shipped native connector');
  });
});
