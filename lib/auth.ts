import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { isIP } from 'node:net';
import { serialize as serializeCookie } from 'cookie';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/jwt';

export const AUTH_COOKIE_NAME = 'token'; // legacy cookie
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const CSRF_COOKIE_NAME = 'csrf_token';

const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 3600;
const LEGACY_COOKIE_PATHS = ['/api', '/api/auth'] as const;

function isHttpsRequest(req?: NextRequest): boolean {
  if (!req) {
    return process.env.NODE_ENV === 'production';
  }

  const forwardedProto = req.headers.get('x-forwarded-proto')?.toLowerCase() || '';
  if (forwardedProto.includes('https')) {
    return true;
  }

  const forwarded = req.headers.get('forwarded')?.toLowerCase() || '';
  if (forwarded.includes('proto=https')) {
    return true;
  }

  if (req.headers.get('x-forwarded-ssl')?.toLowerCase() === 'on') {
    return true;
  }

  const scheme =
    req.headers.get('x-forwarded-scheme')?.toLowerCase() ||
    req.headers.get('x-url-scheme')?.toLowerCase() ||
    '';
  if (scheme === 'https') {
    return true;
  }

  const origin = req.headers.get('origin')?.toLowerCase() || '';
  if (origin.startsWith('https://')) {
    return true;
  }

  const referer = req.headers.get('referer')?.toLowerCase() || '';
  if (referer.startsWith('https://')) {
    return true;
  }

  if (req.nextUrl?.protocol === 'https:') {
    return true;
  }

  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase();
  const hostname = host.split(':')[0];
  if (
    hostname.endsWith('.run.app') ||
    hostname.endsWith('.aistudio.google.com') ||
    hostname.endsWith('.googleusercontent.com') ||
    hostname.endsWith('.web.app') ||
    hostname.endsWith('.firebaseapp.com')
  ) {
    return true;
  }

  if (
    process.env.NODE_ENV === 'production' &&
    (Boolean(req.headers.get('x-cloud-trace-context')) ||
      Boolean(process.env.K_SERVICE) ||
      Boolean(process.env.K_REVISION) ||
      Boolean(process.env.APP_URL?.startsWith('https://')))
  ) {
    return true;
  }

  return false;
}

function isLocalHttpOriginOrReferer(req?: NextRequest): boolean {
  if (!req) return false;
  const origin = req.headers.get('origin')?.toLowerCase() || '';
  const referer = req.headers.get('referer')?.toLowerCase() || '';
  return (
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://[::1]') ||
    origin.startsWith('http://0.0.0.0') ||
    referer.startsWith('http://localhost') ||
    referer.startsWith('http://127.0.0.1') ||
    referer.startsWith('http://[::1]') ||
    referer.startsWith('http://0.0.0.0')
  );
}

function getAuthCookiePolicy(
  req?: NextRequest,
  defaultSameSite: 'lax' | 'strict' = 'lax'
): { secure: boolean; sameSite: 'lax' | 'strict' | 'none' } {
  if (isHttpsRequest(req)) {
    // AI Studio renders the app in a cross-site HTTPS iframe; SameSite=None; Secure
    // ensures refresh and CSRF cookies persist across iframe requests and top-level tabs.
    return { secure: true, sameSite: 'none' };
  }

  if (process.env.NODE_ENV === 'production' && !isLocalHttpOriginOrReferer(req)) {
    return { secure: true, sameSite: 'none' };
  }

  return { secure: false, sameSite: defaultSameSite };
}

function appendLegacyCookieClearHeaders(
  response: NextResponse,
  name: string,
  options: {
    httpOnly: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    secure: boolean;
  }
): void {
  for (const path of LEGACY_COOKIE_PATHS) {
    response.headers.append(
      'Set-Cookie',
      serializeCookie(name, '', {
        httpOnly: options.httpOnly,
        secure: options.secure,
        sameSite: options.sameSite,
        path,
        maxAge: 0,
        expires: new Date(0),
      })
    );
  }
}

export function clearAuthTokenCookie(response: NextResponse, req?: NextRequest): void {
  const policy = getAuthCookiePolicy(req, 'lax');
  appendLegacyCookieClearHeaders(response, AUTH_COOKIE_NAME, {
    httpOnly: true,
    ...policy,
  });

  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    ...policy,
    path: '/',
    maxAge: 0,
  });
}

export function issueCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function setCsrfCookie(response: NextResponse, csrfToken: string, req?: NextRequest): void {
  const policy = getAuthCookiePolicy(req, 'strict');
  appendLegacyCookieClearHeaders(response, CSRF_COOKIE_NAME, {
    httpOnly: false,
    ...policy,
  });

  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    ...policy,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearCsrfCookie(response: NextResponse, req?: NextRequest): void {
  const policy = getAuthCookiePolicy(req, 'strict');
  appendLegacyCookieClearHeaders(response, CSRF_COOKIE_NAME, {
    httpOnly: false,
    ...policy,
  });

  response.cookies.set(CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    ...policy,
    path: '/',
    maxAge: 0,
  });
}

export function setRefreshTokenCookie(
  response: NextResponse,
  refreshToken: string,
  expiresAt: Date,
  req?: NextRequest
): void {
  const secondsUntilExpiry = Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 0);
  const policy = getAuthCookiePolicy(req, 'lax');

  appendLegacyCookieClearHeaders(response, REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    ...policy,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    ...policy,
    path: '/',
    maxAge: secondsUntilExpiry,
    expires: expiresAt,
  });
}

export function clearRefreshTokenCookie(response: NextResponse, req?: NextRequest): void {
  const policy = getAuthCookiePolicy(req, 'lax');
  appendLegacyCookieClearHeaders(response, REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    ...policy,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, '', {
    httpOnly: true,
    ...policy,
    path: '/',
    maxAge: 0,
  });
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function validateCsrfToken(req: NextRequest): boolean {
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    try {
      verifyAccessToken(bearerToken);
      return true;
    } catch {
      // Fall through to double-submit CSRF validation for cookie-authenticated requests.
    }
  }

  const headerToken = req.headers.get('x-csrf-token') || '';
  if (!headerToken) {
    return false;
  }

  const cookieTokens = req.cookies
    .getAll(CSRF_COOKIE_NAME)
    .map((cookie) => cookie.value)
    .filter(Boolean);

  if (cookieTokens.length === 0) {
    return false;
  }

  return cookieTokens.some((cookieToken) => safeCompare(cookieToken, headerToken));
}

export function hashRefreshToken(token: string): string {
  const pepper = process.env.REFRESH_TOKEN_PEPPER || '';
  return createHash('sha256').update(`${token}:${pepper}`).digest('hex');
}

export function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function getAccessTokenFromRequest(req: NextRequest): string | null {
  return extractBearerToken(req);
}

export function getGuestIdFromReq(req: NextRequest): string | null {
  const url = new URL(req.url);
  const guestId = url.searchParams.get('guestId');
  if (!guestId) return null;
  return guestId.startsWith('guest_') ? guestId : null;
}

export function getClientIp(req: NextRequest): string {
  const readIpHeader = (headerName: string): string | null => {
    const candidate = req.headers.get(headerName)?.split(',')[0]?.trim();
    return candidate && isIP(candidate) ? candidate : null;
  };

  // Vercel documents this as its edge-provided client IP header. Prefer it in
  // that runtime so a caller-supplied X-Forwarded-For value is not trusted.
  if (process.env.VERCEL) {
    return readIpHeader('x-vercel-forwarded-for') || 'unknown';
  }

  // A self-hosted production deployment must explicitly name the header its
  // trusted reverse proxy overwrites. Otherwise forwarded headers are
  // caller-controlled and cannot safely identify a client.
  const trustedProxyHeader = process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase();
  if (trustedProxyHeader && /^[a-z0-9-]+$/.test(trustedProxyHeader)) {
    return readIpHeader(trustedProxyHeader) || 'unknown';
  }

  if (process.env.NODE_ENV !== 'production') {
    return readIpHeader('x-forwarded-for') || readIpHeader('x-real-ip') || 'unknown';
  }

  return 'unknown';
}

export function getUserAgent(req: NextRequest): string {
  return req.headers.get('user-agent') || 'unknown';
}

export function isSecureRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  if (process.env.ALLOW_INSECURE_LOCALHOST_FOR_TESTS === '1') {
    const hostname = req.nextUrl.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return true;
    }
  }

  if (isHttpsRequest(req)) {
    return true;
  }

  // Managed container proxies often terminate TLS externally and forward plain HTTP
  // over loopback without preserving X-Forwarded-Proto. Only reject when the caller
  // explicitly originates from a non-local http:// browser origin.
  const origin = req.headers.get('origin')?.toLowerCase() || '';
  const referer = req.headers.get('referer')?.toLowerCase() || '';
  const isExplicitInsecureOrigin =
    (origin.startsWith('http://') &&
      !origin.startsWith('http://localhost') &&
      !origin.startsWith('http://127.0.0.1') &&
      !origin.startsWith('http://[::1]') &&
      !origin.startsWith('http://0.0.0.0')) ||
    (referer.startsWith('http://') &&
      !referer.startsWith('http://localhost') &&
      !referer.startsWith('http://127.0.0.1') &&
      !referer.startsWith('http://[::1]') &&
      !referer.startsWith('http://0.0.0.0'));

  return !isExplicitInsecureOrigin;
}

function resolveAllowedOrigins(): string[] {
  const fromEnv = process.env.CORS_ALLOWED_ORIGINS;
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const publicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  return publicBaseUrl ? [publicBaseUrl] : [];
}

export function applyCorsHeaders(req: NextRequest, response: NextResponse): void {
  const allowedOrigins = resolveAllowedOrigins();
  const origin = req.headers.get('origin');

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    response.headers.set('Vary', 'Origin');
  }
}

export function applySecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

export function withSecurityHeaders(req: NextRequest, response: NextResponse): NextResponse {
  applyCorsHeaders(req, response);
  applySecurityHeaders(response);
  return response;
}

export function unauthorizedResponse(
  body: Record<string, unknown> = { message: 'Unauthorized' },
  req?: NextRequest
): NextResponse {
  const response = NextResponse.json(body, { status: 401 });
  clearAuthTokenCookie(response, req);
  clearRefreshTokenCookie(response, req);
  clearCsrfCookie(response, req);
  applySecurityHeaders(response);
  return response;
}
