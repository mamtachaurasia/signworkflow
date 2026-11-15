import type { NextRequest } from 'next/server';

const FALLBACK_APP_URL = 'http://localhost:3000';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalHostname(hostname: string | null | undefined): boolean {
  return Boolean(hostname && LOCAL_HOSTNAMES.has(hostname.toLowerCase()));
}

function normalizeUrl(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

function parseHostname(hostHeaderValue: string): string | null {
  try {
    return new URL(`http://${hostHeaderValue}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLocalhostUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    return isLocalHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function resolveRequestOrigin(req?: NextRequest | null): string | null {
  if (!req) {
    return null;
  }

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const hostHeader = req.headers.get('host')?.trim();
  const candidateHost = forwardedHost || hostHeader;

  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const originHeader = normalizeUrl(req.headers.get('origin'));
  const refererHeader = normalizeUrl(req.headers.get('referer'));

  if (candidateHost) {
    const hostname = parseHostname(candidateHost);
    if (hostname && !isLocalHostname(hostname)) {
      const isHttps =
        forwardedProto === 'https' ||
        originHeader?.startsWith('https://') ||
        refererHeader?.startsWith('https://') ||
        req.nextUrl?.protocol === 'https:' ||
        hostname.endsWith('.run.app') ||
        hostname.endsWith('.aistudio.google.com');

      return normalizeUrl(`${isHttps ? 'https' : 'http'}://${candidateHost}`);
    }
  }

  if (originHeader && !isLocalhostUrl(originHeader)) {
    return originHeader;
  }

  if (refererHeader && !isLocalhostUrl(refererHeader)) {
    return refererHeader;
  }

  const nextOrigin = normalizeUrl(req.nextUrl?.origin || req.url);
  if (nextOrigin && !isLocalhostUrl(nextOrigin)) {
    return nextOrigin;
  }

  return nextOrigin || originHeader || null;
}

export function resolvePublicBaseUrl(options?: {
  req?: NextRequest | null;
  explicitBaseUrl?: string | null;
}): string {
  const candidates = [
    normalizeUrl(options?.explicitBaseUrl),
    normalizeUrl(process.env.NEXT_PUBLIC_BASE_URL),
    resolveRequestOrigin(options?.req),
    normalizeUrl(process.env.APP_URL),
    normalizeUrl(process.env.NEXTAUTH_URL),
    process.env.VERCEL_URL?.trim() ? normalizeUrl(`https://${process.env.VERCEL_URL.trim()}`) : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? normalizeUrl(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`)
      : null,
  ].filter((value): value is string => Boolean(value));

  // Prefer the first non-localhost URL so localhost defaults or internal proxy URLs
  // never shadow live public request origins or APP_URL in production emails and redirects.
  return candidates.find((candidate) => !isLocalhostUrl(candidate)) || candidates[0] || FALLBACK_APP_URL;
}
