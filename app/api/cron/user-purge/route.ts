import { NextRequest, NextResponse } from 'next/server';
import { getRetentionAdminToken, verifyCronRequest } from '@/lib/cron';

export const runtime = 'nodejs';

async function handleUserPurge(req: NextRequest) {
  const cronAuth = verifyCronRequest(req);
  if (!cronAuth.ok) {
    return cronAuth.response;
  }

  const retentionToken = getRetentionAdminToken();
  if (!retentionToken) {
    return NextResponse.json(
      { message: 'Retention purge token is not configured' },
      { status: 500 }
    );
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const baseUrl = new URL(req.url).origin;

  const response = await fetch(`${baseUrl}/api/admin/users/purge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-retention-token': retentionToken,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(req: NextRequest) {
  return handleUserPurge(req);
}

export async function POST(req: NextRequest) {
  return handleUserPurge(req);
}
