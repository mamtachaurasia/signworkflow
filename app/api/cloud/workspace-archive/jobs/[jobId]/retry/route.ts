import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { processWorkspaceCloudArchiveJob, retryWorkspaceCloudArchiveJob } from '@/lib/cloud/workspace-archive';
import { isAdminRole } from '@/lib/role-utils';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  if (!isSecureRequest(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 }));
  if (!validateCsrfToken(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 }));
  const auth = await getAuthContext(req);
  if (!auth?.userId || !auth.orgId) return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  if (!isAdminRole(auth.orgRole)) return withSecurityHeaders(req, NextResponse.json({ message: 'Workspace admin access is required.' }, { status: 403 }));
  const gate = await getPlanGateForOrgFeature({ orgId: auth.orgId, feature: 'cloud_library' });
  if (!gate.allowed) return withSecurityHeaders(req, NextResponse.json({ message: gate.message }, { status: gate.status }));
  const { jobId } = await params;
  if (!mongoose.Types.ObjectId.isValid(jobId)) return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid workspace archive job ID.' }, { status: 400 }));
  const queued = await retryWorkspaceCloudArchiveJob({ orgId: auth.orgId, jobId });
  if (!queued) return withSecurityHeaders(req, NextResponse.json({ message: 'Failed workspace archive job not found.' }, { status: 404 }));
  const job = await processWorkspaceCloudArchiveJob(jobId);
  return withSecurityHeaders(req, NextResponse.json({
    job: { id: jobId, status: job?.status || 'pending', attempts: job?.attempts ?? 0, lastError: job?.lastError ?? null, providerUrl: job?.providerUrl ?? null },
  }));
}

