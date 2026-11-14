import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { validatePdfUploadMetadata } from '@/lib/pdf-upload-validation';

export const runtime = 'nodejs';

const MAX_CLOUD_IMPORT_SIZE_BYTES = 25 * 1024 * 1024;

const CloudImportSchema = z
  .object({
    provider: z.literal('dropbox'),
    url: z.string().url(),
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().max(160).optional(),
  })
  .strict();

function isAllowedDropboxHost(hostname: string): boolean {
  return (
    hostname === 'www.dropbox.com' ||
    hostname === 'dropbox.com' ||
    hostname === 'dl.dropboxusercontent.com' ||
    hostname.endsWith('.dl.dropboxusercontent.com')
  );
}

function normalizeDropboxDownloadUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !isAllowedDropboxHost(url.hostname)) {
    throw new Error('Only Dropbox download links are supported.');
  }

  if (url.hostname === 'www.dropbox.com' || url.hostname === 'dropbox.com') {
    url.searchParams.set('dl', '1');
  }

  return url;
}

function sanitizeHeaderFileName(value: string): string {
  const sanitized = value.replace(/[\\"]/g, '').replace(/[\r\n]/g, '').trim();
  return sanitized || 'document.pdf';
}

function getContentType(response: Response, fallback?: string): string {
  const responseType = response.headers.get('content-type')?.split(';')[0]?.trim();
  return fallback || responseType || 'application/octet-stream';
}

export async function POST(req: NextRequest) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed', reason: 'csrf_mismatch' }, { status: 403 })
    );
  }

  const authContext = await getAuthContext(req);
  if (!authContext?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 }));
  }

  const parsed = CloudImportSchema.safeParse(rawBody);
  if (!parsed.success) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Validation failed' }, { status: 400 }));
  }

  const metadataError = validatePdfUploadMetadata({
    name: parsed.data.name,
    type: parsed.data.mimeType,
  });
  if (metadataError) {
    return withSecurityHeaders(req, NextResponse.json({ message: metadataError }, { status: 400 }));
  }

  let downloadUrl: URL;
  try {
    downloadUrl = normalizeDropboxDownloadUrl(parsed.data.url);
  } catch (error) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        { message: error instanceof Error ? error.message : 'Invalid Dropbox download link.' },
        { status: 400 }
      )
    );
  }

  let response: Response;
  try {
    response = await fetch(downloadUrl, {
      cache: 'no-store',
      redirect: 'follow',
    });
  } catch {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Unable to reach Dropbox for the selected file.' }, { status: 502 })
    );
  }

  if (!response.ok) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Unable to download the selected Dropbox file.' }, { status: 502 })
    );
  }

  if (response.url) {
    try {
      normalizeDropboxDownloadUrl(response.url);
    } catch {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Dropbox redirected to an unsupported download host.' }, { status: 400 })
      );
    }
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > MAX_CLOUD_IMPORT_SIZE_BYTES) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'File too large. Maximum upload size is 25MB.' }, { status: 413 })
    );
  }

  let arrayBuffer: ArrayBuffer;
  let bytes: Uint8Array;
  try {
    arrayBuffer = await response.arrayBuffer();
    bytes = new Uint8Array(arrayBuffer);
  } catch {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Unable to read the selected Dropbox file.' }, { status: 502 })
    );
  }
  if (bytes.length === 0) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'File is empty.' }, { status: 400 }));
  }
  if (bytes.length > MAX_CLOUD_IMPORT_SIZE_BYTES) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'File too large. Maximum upload size is 25MB.' }, { status: 413 })
    );
  }

  const fileName = sanitizeHeaderFileName(parsed.data.name);
  const importResponse = new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(bytes.length),
      'Content-Type': getContentType(response, parsed.data.mimeType),
    },
  });

  return withSecurityHeaders(req, importResponse);
}
