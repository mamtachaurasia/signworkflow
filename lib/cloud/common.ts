import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';

import type { CloudProviderId } from '@/lib/cloud/types';
import { resolvePublicBaseUrl } from '@/lib/app-url';

const PROVIDER_LABELS: Record<CloudProviderId, string> = {
  google_drive: 'Google Drive',
  dropbox: 'Dropbox',
};

export function getCloudProviderLabel(provider: CloudProviderId): string {
  return PROVIDER_LABELS[provider];
}

export function getCloudBaseUrl(req?: NextRequest): string {
  return resolvePublicBaseUrl({ req });
}

export function resolveCloudRedirectUri(
  configuredValue: string | undefined,
  fallbackPath: string,
  req?: NextRequest
): string {
  const trimmed = configuredValue?.trim();
  if (!trimmed) {
    return validateCloudRedirectUri(`${getCloudBaseUrl(req)}${fallbackPath}`);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return validateCloudRedirectUri(trimmed.replace(/\/+$/, ''));
  }

  if (trimmed.startsWith('/')) {
    return validateCloudRedirectUri(`${getCloudBaseUrl(req)}${trimmed.replace(/\/+$/, '')}`);
  }

  return validateCloudRedirectUri(trimmed.replace(/\/+$/, ''));
}

function validateCloudRedirectUri(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Cloud OAuth redirect URI is invalid: ${value}`);
  }

  const normalized = parsed.toString().replace(/\/+$/, '');
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocalhost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';

  if (isProduction && isLocalhost) {
    throw new Error(`Cloud OAuth redirect URI cannot use localhost in production: ${normalized}`);
  }

  if (!parsed.pathname.startsWith('/api/cloud/oauth/')) {
    throw new Error(
      `Cloud OAuth redirect URI must point to /api/cloud/oauth/... callback route: ${normalized}`
    );
  }

  return normalized;
}

export function sanitizeCloudFileName(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*]+/g, '').trim();
  return sanitized.length > 0 ? sanitized : 'signed-document.pdf';
}

export function sanitizeCloudFolderSegment(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return sanitized.length > 0 ? sanitized : 'Workspace';
}

export function ensurePdfFileName(value: string): string {
  const sanitized = sanitizeCloudFileName(value);
  return sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
}

export function createCloudStateToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text);
  }
}

export function buildUrlEncodedBody(params: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    body.set(key, value);
  });
  return body;
}

export function getCloudExportFolderName(workspaceName?: string | null): string {
  const safeWorkspace = sanitizeCloudFolderSegment(workspaceName || 'Workspace');
  return `SignWorkflow Exports/${safeWorkspace}`;
}
