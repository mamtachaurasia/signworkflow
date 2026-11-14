import { NextRequest, NextResponse } from 'next/server';

import { decryptCloudSecret, encryptCloudSecret } from '@/lib/cloud/crypto';
import type { CloudProviderId } from '@/lib/cloud/types';

export const CLOUD_OAUTH_STATE_COOKIE_NAME = 'cloud_oauth_state';
const CLOUD_OAUTH_STATE_TTL_SECONDS = 10 * 60;

export type CloudOAuthStatePayload = {
  state: string;
  provider: CloudProviderId;
  userId: string;
  connectionScope: 'user' | 'workspace';
  orgId?: string;
  redirectPath: string;
  expiresAt: number;
};

function normalizeRedirectPath(value?: string | null): string {
  if (!value || typeof value !== 'string') {
    return '/dashboard/account/integrations';
  }
  if (!value.startsWith('/')) {
    return '/dashboard/account/integrations';
  }
  if (value.startsWith('//')) {
    return '/dashboard/account/integrations';
  }
  return value;
}

export function setCloudOAuthStateCookie(response: NextResponse, payload: Omit<CloudOAuthStatePayload, 'expiresAt'>): void {
  const encoded = encryptCloudSecret(
    JSON.stringify({
      ...payload,
      redirectPath: normalizeRedirectPath(payload.redirectPath),
      expiresAt: Date.now() + CLOUD_OAUTH_STATE_TTL_SECONDS * 1000,
    } satisfies CloudOAuthStatePayload)
  );

  response.cookies.set(CLOUD_OAUTH_STATE_COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CLOUD_OAUTH_STATE_TTL_SECONDS,
  });
}

export function clearCloudOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(CLOUD_OAUTH_STATE_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function readCloudOAuthState(req: NextRequest): CloudOAuthStatePayload | null {
  const raw = req.cookies.get(CLOUD_OAUTH_STATE_COOKIE_NAME)?.value;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decryptCloudSecret(raw)) as Partial<CloudOAuthStatePayload>;
    const connectionScope = parsed.connectionScope === 'workspace' ? 'workspace' : 'user';
    if (
      !parsed ||
      typeof parsed.state !== 'string' ||
      typeof parsed.provider !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }

    if (connectionScope === 'workspace' && typeof parsed.orgId !== 'string') {
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      return null;
    }

    return {
      state: parsed.state,
      provider: parsed.provider as CloudProviderId,
      userId: parsed.userId,
      connectionScope,
      orgId: typeof parsed.orgId === 'string' ? parsed.orgId : undefined,
      redirectPath: normalizeRedirectPath(parsed.redirectPath),
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}
