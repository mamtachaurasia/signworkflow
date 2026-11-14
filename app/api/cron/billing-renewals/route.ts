import { NextRequest, NextResponse } from 'next/server';

import { verifyCronRequest } from '@/lib/cron';
import { processDuePayPalRenewals } from '@/lib/billing-server';

export const runtime = 'nodejs';

async function handleBillingRenewals(req: NextRequest) {
  const cronAuth = verifyCronRequest(req);
  if (!cronAuth.ok) {
    return cronAuth.response;
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : undefined;

  try {
    const result = await processDuePayPalRenewals({ limit });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Unable to process PayPal billing renewals.',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleBillingRenewals(req);
}

export async function POST(req: NextRequest) {
  return handleBillingRenewals(req);
}
