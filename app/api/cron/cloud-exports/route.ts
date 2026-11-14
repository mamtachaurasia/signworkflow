import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { processPendingCloudExportJobs } from '@/lib/cloud/auto-export';
import { processPendingWorkspaceCloudArchiveJobs } from '@/lib/cloud/workspace-archive';
import { verifyCronRequest } from '@/lib/cron';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict();

async function handle(req: NextRequest) {
  const cronAuth = verifyCronRequest(req);
  if (!cronAuth.ok) return cronAuth.response;
  const input = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const parsed = BodySchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid worker options.' }, { status: 400 });
  const limit = parsed.data.limit || 5;
  const [personalJobs, workspaceJobs] = await Promise.all([
    processPendingCloudExportJobs(limit),
    processPendingWorkspaceCloudArchiveJobs(limit),
  ]);
  const jobs = [...personalJobs, ...workspaceJobs];
  return NextResponse.json({
    processed: jobs.length,
    personalProcessed: personalJobs.length,
    workspaceArchiveProcessed: workspaceJobs.length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    retrying: jobs.filter((job) => job.status === 'failed').length,
    deadLettered: jobs.filter((job) => job.status === 'dead_letter').length,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
