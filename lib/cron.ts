import { NextRequest, NextResponse } from 'next/server';

function getCronSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret && secret.trim().length > 0 ? secret.trim() : null;
}

export function verifyCronRequest(req: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expected = getCronSecret();
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 }),
    };
  }

  const headerSecret = req.headers.get('x-cron-secret')?.trim();
  const auth = req.headers.get('authorization')?.trim();
  const bearer = auth && auth.toLowerCase().startsWith('bearer ') ? auth.slice('bearer '.length).trim() : '';
  const token = headerSecret || bearer;

  if (!token || token !== expected) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { ok: true };
}

export function getRetentionAdminToken(): string | null {
  return (
    process.env.RETENTION_ADMIN_TOKEN?.trim() ||
    process.env.RETENTION_PURGE_TOKEN?.trim() ||
    null
  );
}
