import { NextRequest, type NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as logoutGet } from '@/app/api/auth/logout/route';
import { clearRefreshTokenCookie, isSecureRequest, setRefreshTokenCookie } from '@/lib/auth';
import { DASHBOARD_BUILDER_REQUEST_PATH_HEADER } from '@/lib/dashboard-builder-auth';
import { proxy } from '@/proxy';

type CookieCall = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

function createMockResponse(): {
  response: NextResponse;
  cookieCalls: CookieCall[];
  appendedSetCookies: string[];
} {
  const cookieCalls: CookieCall[] = [];
  const appendedSetCookies: string[] = [];

  const response = {
    cookies: {
      set: (name: string, value: string, options?: Record<string, unknown>) => {
        cookieCalls.push({ name, value, options });
      },
    },
    headers: {
      append: (name: string, value: string) => {
        if (name.toLowerCase() === 'set-cookie') {
          appendedSetCookies.push(value);
        }
      },
    },
  } as unknown as NextResponse;

  return { response, cookieCalls, appendedSetCookies };
}

function createMockRequest(pathname: string, hasRefreshCookie: boolean): NextRequest {
  return {
    nextUrl: { pathname },
    headers: new Headers(),
    cookies: {
      get: (name: string) => {
        if (name === 'refresh_token' && hasRefreshCookie) {
          return { name, value: 'refresh-token-value' };
        }
        return undefined;
      },
    },
    url: `http://localhost:3000${pathname}`,
  } as unknown as NextRequest;
}

describe('auth cookie regression guards', () => {
  it('clears refresh cookie on root path and legacy API paths', () => {
    const { response, cookieCalls, appendedSetCookies } = createMockResponse();

    clearRefreshTokenCookie(response);

    const rootClear = cookieCalls.find(
      (call) => call.name === 'refresh_token' && call.value === '' && call.options?.path === '/'
    );
    expect(rootClear).toBeDefined();

    expect(appendedSetCookies.some((header) => header.includes('refresh_token=') && header.includes('Path=/api'))).toBe(
      true
    );
    expect(
      appendedSetCookies.some((header) => header.includes('refresh_token=') && header.includes('Path=/api/auth'))
    ).toBe(true);
  });

  it('sets refresh cookie on root path and clears legacy API-path duplicates', () => {
    const { response, cookieCalls, appendedSetCookies } = createMockResponse();

    setRefreshTokenCookie(response, 'new-refresh-token', new Date(Date.now() + 60_000));

    const rootSet = cookieCalls.find(
      (call) =>
        call.name === 'refresh_token' &&
        call.value === 'new-refresh-token' &&
        call.options?.path === '/' &&
        call.options?.httpOnly === true
    );
    expect(rootSet).toBeDefined();

    expect(appendedSetCookies.some((header) => header.includes('refresh_token=') && header.includes('Path=/api'))).toBe(
      true
    );
    expect(
      appendedSetCookies.some((header) => header.includes('refresh_token=') && header.includes('Path=/api/auth'))
    ).toBe(true);
  });
});

describe('proxy redirect regression guards', () => {
  it('does not redirect /login to /dashboard solely on refresh cookie presence', () => {
    const req = createMockRequest('/login', true);
    const res = proxy(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('does not redirect root path solely on refresh cookie presence', () => {
    const req = createMockRequest('/', true);
    const res = proxy(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('does not make auth decisions for protected routes', () => {
    const req = createMockRequest('/dashboard', false);
    const res = proxy(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('forwards the exact Builder request target and overwrites a spoofed header', () => {
    const builderHref =
      '/dashboard/builder/template/507f1f77bcf86cd799439011' +
      '?workspace=fields&templateReturnTo=%2Fdashboard%3Fview%3Dmy';
    const req = new NextRequest(`https://signworkflow.test${builderHref}`, {
      headers: {
        [DASHBOARD_BUILDER_REQUEST_PATH_HEADER]: '//evil.example',
      },
    });

    const res = proxy(req);

    expect(
      res.headers.get(`x-middleware-request-${DASHBOARD_BUILDER_REQUEST_PATH_HEADER}`)
    ).toBe(builderHref);
  });
});

describe('logout redirect sanitization', () => {
  it('rejects protocol-relative next targets', async () => {
    const req = {
      nextUrl: new URL('http://localhost:3000/api/auth/logout?next=//evil.com'),
      url: 'http://localhost:3000/api/auth/logout?next=//evil.com',
      headers: new Headers(),
    } as unknown as NextRequest;

    const res = await logoutGet(req);
    const location = res.headers.get('location') || '';

    expect(location).toContain('/login');
    expect(location).not.toContain('evil.com');
  });

  it('keeps safe internal next targets', async () => {
    const req = {
      nextUrl: new URL('http://localhost:3000/api/auth/logout?next=/dashboard'),
      url: 'http://localhost:3000/api/auth/logout?next=/dashboard',
      headers: new Headers(),
    } as unknown as NextRequest;

    const res = await logoutGet(req);
    const location = res.headers.get('location') || '';

    expect(location).toContain('/dashboard');
  });
});

describe('production HTTPS detection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats requests as secure when internal proxy overwrites x-forwarded-proto to http on HTTPS origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('K_SERVICE', '');
    vi.stubEnv('K_REVISION', '');
    vi.stubEnv('APP_URL', '');

    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      headers: {
        'x-forwarded-proto': 'http',
        origin: 'https://app.example.com',
      },
    });

    expect(isSecureRequest(req)).toBe(true);
  });

  it('treats Cloud Run production requests as secure even without x-forwarded-proto', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('K_SERVICE', 'signworkflow');

    const req = new NextRequest('http://127.0.0.1:3000/api/user/profile');

    expect(isSecureRequest(req)).toBe(true);
  });

  it('rejects explicit plain HTTP external origins in unproxied production environments', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('K_SERVICE', '');
    vi.stubEnv('K_REVISION', '');
    vi.stubEnv('APP_URL', '');

    const req = new NextRequest('http://example.com/api/auth/login', {
      headers: {
        host: 'example.com',
        origin: 'http://example.com',
      },
    });

    expect(isSecureRequest(req)).toBe(false);
  });

  it('allows proxied production requests when proxy strips x-forwarded-proto and origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('K_SERVICE', '');
    vi.stubEnv('K_REVISION', '');
    vi.stubEnv('APP_URL', '');

    const req = new NextRequest('http://127.0.0.1:3000/api/auth/login', {
      headers: {
        host: '127.0.0.1:3000',
        'x-forwarded-proto': 'http',
      },
    });

    expect(isSecureRequest(req)).toBe(true);
  });
});
