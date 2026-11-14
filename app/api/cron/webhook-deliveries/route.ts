import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { verifyCronRequest } from '@/lib/cron';
import { processPendingWebhookDeliveries } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict();

async function handle(req: NextRequest) {
  const cronAuth = verifyCronRequest(req);
  if (!cronAuth.ok) return cronAuth.response;
  const input = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const parsed = BodySchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid worker options.' }, { status: 400 });
  const deliveries = await processPendingWebhookDeliveries(parsed.data.limit || 10);
  return NextResponse.json({
    processed: deliveries.length,
    delivered: deliveries.filter((delivery) => delivery.status === 'delivered').length,
    retrying: deliveries.filter((delivery) => delivery.status === 'failed').length,
    deadLettered: deliveries.filter((delivery) => delivery.status === 'dead_letter').length,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
