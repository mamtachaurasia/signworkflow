import { describe, expect, it } from 'vitest';

import nextConfig from '../next.config';

describe('canonical host redirect', () => {
  it('permanently redirects www.signworkflow.com to the apex domain', async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      source: '/:path*',
      has: [
        {
          type: 'host',
          value: 'www.signworkflow.com',
        },
      ],
      destination: 'https://signworkflow.com/:path*',
      permanent: true,
    });
  });
});
