import { NextRequest, NextResponse } from 'next/server';

import { getClientIp, getUserAgent, isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { writeAuditEvent } from '@/lib/audit';
import { deleteWorkspaceCloudConnection } from '@/lib/cloud/connections';
import { isCloudProviderId } from '@/lib/cloud/types';
import { isAdminRole } from '@/lib/role-utils';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  if (!isSecureRequest(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 }));
  if (!validateCsrfToken(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 }));
  const auth = await getAuthContext(req);
  if (!auth?.userId || !auth.orgId) return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  if (!isAdminRole(auth.orgRole)) return withSecurityHeaders(req, NextResponse.json({ message: 'Workspace admin access is required.' }, { status: 403 }));
  const { provider } = await params;
  if (!isCloudProviderId(provider)) return withSecurityHeaders(req, NextResponse.json({ message: 'Unsupported cloud provider.' }, { status: 400 }));
  await connectDB();
  const disconnected = await deleteWorkspaceCloudConnection({ orgId: auth.orgId, provider });
  if (!disconnected) return withSecurityHeaders(req, NextResponse.json({ message: 'Workspace connection not found.' }, { status: 404 }));
  await writeAuditEvent({
    userId: auth.userId,
    orgId: auth.orgId,
    action: 'cloud.workspace_archive.destination_disconnected',
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    metadata: { provider },
  });
  return withSecurityHeaders(req, NextResponse.json({ success: true }));
}

