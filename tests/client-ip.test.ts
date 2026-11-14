import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getClientIp } from '@/lib/auth';

describe('getClientIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the Vercel edge header in the Vercel runtime', () => {
    vi.stubEnv('VERCEL', '1');
    const request = new NextRequest('https://signworkflow.com/api/contact', {
      headers: {
        'x-vercel-forwarded-for': '203.0.113.30',
        'x-forwarded-for': '198.51.100.99',
      },
    });

    expect(getClientIp(request)).toBe('203.0.113.30');
  });

  it('uses an explicitly configured trusted proxy header when self-hosted', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUSTED_PROXY_IP_HEADER', 'x-forwarded-for');
    const request = new NextRequest('http://localhost/api/contact', {
      headers: {
        'x-forwarded-for': '203.0.113.31, 198.51.100.4',
      },
    });

    expect(getClientIp(request)).toBe('203.0.113.31');
  });

  it('does not trust caller-supplied forwarded headers in unconfigured production', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUSTED_PROXY_IP_HEADER', '');
    const request = new NextRequest('https://signworkflow.com/api/contact', {
      headers: {
        'x-forwarded-for': '203.0.113.32',
        'x-real-ip': '203.0.113.33',
      },
    });

    expect(getClientIp(request)).toBe('unknown');
  });
});
