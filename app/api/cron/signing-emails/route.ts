import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { verifyCronRequest } from '@/lib/cron';
import { processSigningEmailJobs } from '@/lib/signing-email-jobs';

export const runtime = 'nodejs';
export const maxDuration = 300;
const BodySchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict();

async function handle(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) return auth.response;
  const parsed = BodySchema.safeParse(req.method === 'POST' ? await req.json().catch(() => null) : {});
  if (!parsed.success) return NextResponse.json({ message: 'Invalid worker options.' }, { status: 400 });
  try {
    const jobs = await processSigningEmailJobs({ limit: parsed.data.limit });
    return NextResponse.json({
      processed: jobs.length,
      completed: jobs.filter((job) => job.status === 'completed').length,
      retrying: jobs.filter((job) => job.status === 'failed').length,
      deadLettered: jobs.filter((job) => job.status === 'dead_letter').length,
      cancelled: jobs.filter((job) => job.status === 'cancelled').length,
    });
  } catch {
    return NextResponse.json({ message: 'Signing email worker unavailable.' }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
