import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCronRequest } from '@/lib/cron';
import { processPendingIntegrationEvents } from '@/lib/integration-outbox';

export const runtime = 'nodejs';
export const maxDuration = 60;
const BodySchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict();

async function handle(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) return auth.response;
  const parsed = BodySchema.safeParse(req.method === 'POST' ? await req.json().catch(() => ({})) : {});
  if (!parsed.success) return NextResponse.json({ message: 'Invalid worker options.' }, { status: 400 });
  return NextResponse.json(await processPendingIntegrationEvents(parsed.data.limit ?? 10));
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
