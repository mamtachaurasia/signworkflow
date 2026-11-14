import { NextRequest } from 'next/server';

import {
  buildUrlEncodedBody,
  parseJsonResponse,
  resolveCloudRedirectUri,
  sanitizeCloudFolderSegment,
} from '@/lib/cloud/common';
import type { CloudAuthorizedAccount, CloudUploadInput, CloudUploadResult } from '@/lib/cloud/types';

const GOOGLE_DRIVE_SCOPE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

const GOOGLE_DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

type GoogleDriveConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  missingConfig: string[];
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
};

type GoogleDriveFile = {
  id?: string;
  name?: string;
  webViewLink?: string;
  webContentLink?: string;
  error?: {
    message?: string;
  };
};

type GoogleDriveFileList = {
  files?: GoogleDriveFile[];
  error?: {
    message?: string;
  };
};

const IDEMPOTENCY_PROPERTY_KEY = 'signworkflowExportJob';

function getGoogleDriveRedirectUri(req?: NextRequest): string {
  return resolveCloudRedirectUri(
    process.env.GOOGLE_DRIVE_REDIRECT_URI,
    '/api/cloud/oauth/google_drive/callback',
    req
  );
}

export function getGoogleDriveConfig(req?: NextRequest): GoogleDriveConfig {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || '';
  const redirectUri = getGoogleDriveRedirectUri(req);
  const missingConfig: string[] = [];

  if (!clientId) missingConfig.push('GOOGLE_DRIVE_CLIENT_ID');
  if (!clientSecret) missingConfig.push('GOOGLE_DRIVE_CLIENT_SECRET');

  return {
    clientId,
    clientSecret,
    redirectUri,
    missingConfig,
  };
}

export function buildGoogleDriveAuthorizationUrl(req: NextRequest, state: string): string {
  const config = getGoogleDriveConfig(req);
  if (config.missingConfig.length > 0) {
    throw new Error(`Google Drive is not configured. Missing: ${config.missingConfig.join(', ')}`);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_DRIVE_SCOPE,
    include_granted_scopes: 'true',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeGoogleCode(req: NextRequest, code: string): Promise<GoogleTokenResponse> {
  const config = getGoogleDriveConfig(req);
  const response = await fetch('https://oauth2.googleapis.com/token', {
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

  const payload = await parseJsonResponse<GoogleTokenResponse>(response);
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Google Drive authorization failed.');
  }

  return payload;
}

async function refreshGoogleAccessToken(refreshToken: string, req?: NextRequest): Promise<string> {
  const config = getGoogleDriveConfig(req);
  const response = await fetch('https://oauth2.googleapis.com/token', {
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

  const payload = await parseJsonResponse<GoogleTokenResponse>(response);
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Unable to refresh Google Drive access token.');
  }

  return payload.access_token;
}

export async function completeGoogleDriveAuthorization(
  req: NextRequest,
  code: string
): Promise<CloudAuthorizedAccount> {
  const tokenPayload = await exchangeGoogleCode(req, code);
  if (!tokenPayload.refresh_token) {
    throw new Error('Google Drive did not return a refresh token. Reconnect with consent again.');
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
    cache: 'no-store',
  });
  const profile = await parseJsonResponse<GoogleUserInfo>(profileResponse);
  if (!profileResponse.ok || !profile.sub) {
    throw new Error('Unable to load the Google Drive account profile.');
  }

  return {
    providerAccountId: profile.sub,
    email: profile.email || null,
    displayName: profile.name || profile.email || 'Google Drive account',
    refreshToken: tokenPayload.refresh_token,
    scopes: (tokenPayload.scope || GOOGLE_DRIVE_SCOPE).split(/\s+/).filter(Boolean),
    metadata: {},
  };
}

function buildMultipartRelatedBody(parts: Array<{ contentType: string; body: string | Buffer }>, boundary: string): Buffer {
  const segments = parts.flatMap((part) => [
    `--${boundary}\r\nContent-Type: ${part.contentType}\r\n\r\n`,
    part.body,
    '\r\n',
  ]);

  segments.push(`--${boundary}--`);

  return Buffer.concat(
    segments.map((segment) => (typeof segment === 'string' ? Buffer.from(segment, 'utf-8') : segment))
  );
}

async function createGoogleExportFolder(accessToken: string, folderName = 'SignWorkflow Exports'): Promise<string> {
  const boundary = `boundary_${Date.now().toString(36)}`;
  const requestBody = buildMultipartRelatedBody(
    [
      {
        contentType: 'application/json; charset=UTF-8',
        body: JSON.stringify({
          name: folderName,
          mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
        }),
      },
    ],
    boundary
  );
  const requestBytes = new Uint8Array(requestBody);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: requestBytes,
    cache: 'no-store',
  });

  const payload = await parseJsonResponse<GoogleDriveFile>(response);
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || 'Unable to create the Google Drive export folder.');
  }

  return payload.id;
}

async function findOrCreateGoogleExportFolder(accessToken: string, folderName: string): Promise<string> {
  const query = [
    `name = '${folderName.replace(/'/g, "\\'")}'`,
    `mimeType = '${GOOGLE_DRIVE_FOLDER_MIME_TYPE}'`,
    'trashed = false',
  ].join(' and ');
  const params = new URLSearchParams({
    q: query,
    spaces: 'drive',
    fields: 'files(id,name)',
    pageSize: '1',
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await parseJsonResponse<GoogleDriveFileList>(response);
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Unable to find the Google Drive export folder.');
  }

  return payload.files?.[0]?.id || createGoogleExportFolder(accessToken, folderName);
}

function resolveGoogleDriveFileName(fileName: string, workspaceName: string | null): string {
  if (!workspaceName) {
    return fileName;
  }
  return `${workspaceName} - ${fileName}`;
}

function escapeGoogleDriveQueryLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findGoogleDriveFileByIdempotencyKey(
  accessToken: string,
  idempotencyKey: string
): Promise<GoogleDriveFile | null> {
  const query = [
    `appProperties has { key = '${IDEMPOTENCY_PROPERTY_KEY}' and value = '${escapeGoogleDriveQueryLiteral(idempotencyKey)}' }`,
    'trashed = false',
  ].join(' and ');
  const params = new URLSearchParams({
    q: query,
    spaces: 'drive',
    fields: 'files(id,name,webViewLink,webContentLink)',
    pageSize: '1',
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await parseJsonResponse<GoogleDriveFileList>(response);
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Unable to reconcile the Google Drive export.');
  }
  return payload.files?.[0] || null;
}

export async function uploadPdfToGoogleDrive(input: CloudUploadInput): Promise<CloudUploadResult> {
  const accessToken = await refreshGoogleAccessToken(input.refreshToken);
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await findGoogleDriveFileByIdempotencyKey(accessToken, idempotencyKey);
    if (existing?.id) {
      return {
        providerFileId: existing.id,
        providerFileName: existing.name || resolveGoogleDriveFileName(input.fileName, input.workspaceName),
        providerUrl: existing.webViewLink || existing.webContentLink || null,
        metadataPatch: undefined,
      };
    }
  }
  const destinationFolder = input.destinationFolder?.trim();
  const exportFolderId = destinationFolder
    ? await findOrCreateGoogleExportFolder(accessToken, sanitizeCloudFolderSegment(destinationFolder))
    : input.metadata.exportFolderId || (await createGoogleExportFolder(accessToken));
  const resolvedFileName = resolveGoogleDriveFileName(input.fileName, input.workspaceName);
  const fileBytes = new Uint8Array(input.fileBuffer);

  const createResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': input.contentType,
        'X-Upload-Content-Length': String(input.fileBuffer.length),
      },
      body: JSON.stringify({
        name: resolvedFileName,
        parents: [exportFolderId],
        ...(idempotencyKey
          ? { appProperties: { [IDEMPOTENCY_PROPERTY_KEY]: idempotencyKey } }
          : {}),
      }),
      cache: 'no-store',
    }
  );

  if (!createResponse.ok) {
    const errorPayload = await parseJsonResponse<GoogleDriveFile>(createResponse).catch(() => ({} as GoogleDriveFile));
    throw new Error(errorPayload.error?.message || 'Unable to create a Google Drive upload session.');
  }

  const uploadUrl = createResponse.headers.get('location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not return an upload session URL.');
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(input.fileBuffer.length),
      'Content-Type': input.contentType,
    },
    body: fileBytes,
    cache: 'no-store',
  });

  const payload = await parseJsonResponse<GoogleDriveFile>(uploadResponse);
  if (!uploadResponse.ok || !payload.id) {
    throw new Error(payload.error?.message || 'Unable to upload the signed PDF to Google Drive.');
  }

  return {
    providerFileId: payload.id,
    providerFileName: payload.name || resolvedFileName,
    providerUrl: payload.webViewLink || payload.webContentLink || null,
    metadataPatch: destinationFolder || input.metadata.exportFolderId ? undefined : { exportFolderId },
  };
}
