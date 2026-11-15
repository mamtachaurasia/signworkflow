import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolvePublicBaseUrl } from '@/lib/app-url';
import { verifyCronRequest } from '@/lib/cron';
import { processTrialExpirationEmailJobs } from '@/lib/trial-expiration-email-jobs';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BodySchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict();

async function handle(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) return auth.response;

  const parsed = BodySchema.safeParse(req.method === 'POST' ? await req.json().catch(() => null) : {});
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid worker options.' }, { status: 400 });
  }

  try {
    const baseUrl = resolvePublicBaseUrl({ req });
    const result = await processTrialExpirationEmailJobs({
      limit: parsed.data.limit,
      baseUrl,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Trial expiration email worker failed.', error);
    return NextResponse.json({ message: 'Trial expiration email worker unavailable.' }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
