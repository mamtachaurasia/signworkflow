import { NextRequest, NextResponse } from 'next/server';

import { withSecurityHeaders } from '@/lib/auth';

export const runtime = 'nodejs';

const GOOGLE_DRIVE_IMPORT_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const IMPORT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const DROPBOX_IMPORT_EXTENSIONS = ['.pdf', '.doc', '.docx'];

function firstConfiguredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

export async function GET(req: NextRequest) {
  const googleDriveClientId = firstConfiguredEnv(
    'NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID',
    'GOOGLE_DRIVE_CLIENT_ID',
    'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_ID'
  );
  const dropboxAppKey = firstConfiguredEnv(
    'NEXT_PUBLIC_DROPBOX_APP_KEY',
    'NEXT_PUBLIC_DROPBOX_CLIENT_ID',
    'DROPBOX_CLIENT_ID'
  );

  return withSecurityHeaders(
    req,
    NextResponse.json(
      {
        googleDrive: {
          clientId: googleDriveClientId,
          scope: GOOGLE_DRIVE_IMPORT_SCOPE,
          mimeTypes: IMPORT_MIME_TYPES,
          configured: Boolean(googleDriveClientId),
          missingConfig: googleDriveClientId ? [] : ['GOOGLE_DRIVE_CLIENT_ID'],
        },
        dropbox: {
          appKey: dropboxAppKey,
          extensions: DROPBOX_IMPORT_EXTENSIONS,
          configured: Boolean(dropboxAppKey),
          missingConfig: dropboxAppKey ? [] : ['DROPBOX_CLIENT_ID'],
        },
      },
      { status: 200 }
    )
  );
}
