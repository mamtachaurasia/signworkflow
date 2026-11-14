import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('developer API reference', () => {
  it('offers a human-readable API reference and labels the raw contract accurately', () => {
    const reference = readFileSync(join(root, 'app/developers/api/page.tsx'), 'utf8');
    const home = readFileSync(join(root, 'app/HomePageClient.tsx'), 'utf8');
    const integrations = readFileSync(join(root, 'components/account/DeveloperIntegrationsPanel.tsx'), 'utf8');

    expect(reference).toContain('Build signing workflows with the SignWorkflow API');
    expect(reference).toContain('Download OpenAPI JSON');
    expect(reference).toContain('/api/v1/openapi');
    expect(reference).toContain('/api/v1/documents/{documentId}/send');
    expect(home).toContain('href="/developers/api"');
    expect(home).toContain('Explore developer API');
    expect(integrations).toContain('Download OpenAPI JSON');
  });
});
