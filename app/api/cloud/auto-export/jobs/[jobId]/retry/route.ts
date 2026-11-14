import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { processCloudExportJob, retryCloudExportJob } from '@/lib/cloud/auto-export';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 }));
  }
  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 }));
  }
  const auth = await getAuthContext(req);
  if (!auth?.userId || !auth.orgId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }
  const gate = await getPlanGateForOrgFeature({ orgId: auth.orgId, feature: 'cloud_library' });
  if (!gate.allowed) {
    return withSecurityHeaders(req, NextResponse.json({ message: gate.message }, { status: gate.status }));
  }
  const { jobId } = await params;
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid export job ID.' }, { status: 400 }));
  }
  const queued = await retryCloudExportJob({ orgId: auth.orgId, userId: auth.userId, jobId });
  if (!queued) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Failed export job not found.' }, { status: 404 }));
  }
  const job = await processCloudExportJob(jobId);
  return withSecurityHeaders(
    req,
    NextResponse.json({
      job: {
        id: jobId,
        status: job?.status || 'pending',
        attempts: job?.attempts ?? 0,
        lastError: job?.lastError ?? null,
        providerUrl: job?.providerUrl ?? null,
      },
    })
  );
}
