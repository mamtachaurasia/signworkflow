import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

import {
  buildUrlEncodedBody,
  ensurePdfFileName,
  parseJsonResponse,
  resolveCloudRedirectUri,
  sanitizeCloudFolderSegment,
} from '@/lib/cloud/common';
import type { CloudAuthorizedAccount, CloudUploadInput, CloudUploadResult } from '@/lib/cloud/types';

type DropboxConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  missingConfig: string[];
};

type DropboxTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  uid?: string;
  account_id?: string;
  error_description?: string;
  error_summary?: string;
};

type DropboxAccountProfile = {
  account_id?: string;
  email?: string;
  name?: {
    display_name?: string;
  };
};

type DropboxUploadResponse = {
  id?: string;
  name?: string;
  path_display?: string;
  path_lower?: string;
  error_summary?: string;
  error?: {
    [key: string]: unknown;
  };
};

const DROPBOX_REQUIRED_SCOPES = ['account_info.read', 'files.content.write'];

function getDropboxRedirectUri(req?: NextRequest): string {
  return resolveCloudRedirectUri(
    process.env.DROPBOX_REDIRECT_URI,
    '/api/cloud/oauth/dropbox/callback',
    req
  );
}

export function getDropboxConfig(req?: NextRequest): DropboxConfig {
  const clientId = process.env.DROPBOX_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET?.trim() || '';
  const redirectUri = getDropboxRedirectUri(req);
  const missingConfig: string[] = [];
  if (!clientId) missingConfig.push('DROPBOX_CLIENT_ID');
  if (!clientSecret) missingConfig.push('DROPBOX_CLIENT_SECRET');

  return {
    clientId,
    clientSecret,
    redirectUri,
    missingConfig,
  };
}

export function buildDropboxAuthorizationUrl(req: NextRequest, state: string): string {
  const config = getDropboxConfig(req);
  if (config.missingConfig.length > 0) {
    throw new Error(`Dropbox is not configured. Missing: ${config.missingConfig.join(', ')}`);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    token_access_type: 'offline',
    scope: DROPBOX_REQUIRED_SCOPES.join(' '),
    state,
  });

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeDropboxCode(req: NextRequest, code: string): Promise<DropboxTokenResponse> {
  const config = getDropboxConfig(req);
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: buildUrlEncodedBody({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  const payload = await parseJsonResponse<DropboxTokenResponse>(response);
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error_summary || 'Dropbox authorization failed.');
  }

  return payload;
}

async function refreshDropboxAccessToken(refreshToken: string, req?: NextRequest): Promise<string> {
  const config = getDropboxConfig(req);
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: buildUrlEncodedBody({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });

  const payload = await parseJsonResponse<DropboxTokenResponse>(response);
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error_summary || 'Unable to refresh the Dropbox access token.');
  }

  return payload.access_token;
}

export async function completeDropboxAuthorization(
  req: NextRequest,
  code: string
): Promise<CloudAuthorizedAccount> {
  const tokenPayload = await exchangeDropboxCode(req, code);
  if (!tokenPayload.refresh_token) {
    throw new Error('Dropbox did not return a refresh token. Reconnect and approve offline access.');
  }

  const profileResponse = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
    cache: 'no-store',
  });
  const profile = await parseJsonResponse<DropboxAccountProfile>(profileResponse);
  if (!profileResponse.ok || !profile.account_id) {
    throw new Error('Unable to load the Dropbox account profile.');
  }

  return {
    providerAccountId: profile.account_id,
    email: profile.email || null,
    displayName: profile.name?.display_name || profile.email || 'Dropbox account',
    refreshToken: tokenPayload.refresh_token,
    scopes: (tokenPayload.scope || '').split(/\s+/).filter(Boolean),
    metadata: {},
  };
}

function resolveDropboxRootFallbackFileName(fileName: string, workspaceName: string | null): string {
  const prefix = workspaceName?.trim() ? `${workspaceName} - ` : '';
  return ensurePdfFileName(`${prefix}${fileName}`);
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';
  for (const character of value) {
    if (Buffer.byteLength(result + character, 'utf8') > maxBytes) break;
    result += character;
  }
  return result;
}

function resolveIdempotentDropboxFileName(fileName: string, idempotencyKey: string | null): string {
  const normalized = ensurePdfFileName(fileName);
  if (!idempotencyKey) return normalized;
  const stem = normalized.replace(/\.pdf$/i, '');
  const stableSuffix = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 24);
  return `${truncateUtf8(stem, 180) || 'signed-document'}--sw-${stableSuffix}.pdf`;
}

async function ensureDropboxFolder(accessToken: string, folderName: string): Promise<void> {
  const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: `/${folderName}`, autorename: false }),
    cache: 'no-store',
  });

  if (response.ok) return;

  const payload = await parseJsonResponse<DropboxUploadResponse>(response).catch(
    () => ({} as DropboxUploadResponse)
  );
  const summary = payload.error_summary || '';
  if (summary.includes('path/conflict/folder')) return;
  throw new Error(summary || 'Unable to create the Dropbox export folder.');
}

export async function uploadPdfToDropbox(input: CloudUploadInput): Promise<CloudUploadResult> {
  const accessToken = await refreshDropboxAccessToken(input.refreshToken);
  const fileBytes = new Uint8Array(input.fileBuffer);
  const destinationFolder = input.destinationFolder?.trim()
    ? sanitizeCloudFolderSegment(input.destinationFolder)
    : null;
  if (destinationFolder) {
    await ensureDropboxFolder(accessToken, destinationFolder);
  }
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  const destinationFileName = resolveIdempotentDropboxFileName(input.fileName, idempotencyKey);
  const filePath = destinationFolder
    ? `/${destinationFolder}/${destinationFileName}`
    : `/${idempotencyKey
      ? resolveIdempotentDropboxFileName(resolveDropboxRootFallbackFileName(input.fileName, input.workspaceName), idempotencyKey)
      : resolveDropboxRootFallbackFileName(input.fileName, input.workspaceName)}`;

  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: filePath,
        mode: idempotencyKey ? 'overwrite' : 'add',
        autorename: !idempotencyKey,
        mute: false,
        strict_conflict: false,
      }),
    },
    body: fileBytes,
    cache: 'no-store',
  });

  const payload = await parseJsonResponse<DropboxUploadResponse>(response);
  if (!response.ok || !payload.id) {
    const message = payload.error_summary || '';
    if (
      message.toLowerCase().includes('insufficient_permissions') ||
      message.toLowerCase().includes('no_write_permission')
    ) {
      throw new Error('Dropbox denied file upload access. Reconnect Dropbox and approve upload permissions, then try again.');
    }
    throw new Error(message || 'Unable to upload the signed PDF to Dropbox.');
  }

  return {
    providerFileId: payload.id,
    providerFileName: payload.name || input.fileName,
    providerUrl: payload.path_display || payload.path_lower || null,
    metadataPatch: undefined,
  };
}
