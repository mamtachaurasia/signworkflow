import { NextRequest, NextResponse } from 'next/server';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { writeAuditEvent } from '@/lib/audit';
import { deleteCloudConnectionForUser } from '@/lib/cloud/connections';
import { isCloudProviderId } from '@/lib/cloud/types';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function DELETE(req: NextRequest, context: RouteContext) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed', reason: 'csrf_mismatch' }, { status: 403 })
    );
  }

  const { provider } = await context.params;
  if (!isCloudProviderId(provider)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unsupported cloud provider.' }, { status: 400 }));
  }

  const authContext = await getAuthContext(req);
  if (!authContext?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  await connectDB();
  const disconnected = await deleteCloudConnectionForUser({
    userId: authContext.userId,
    provider,
  });

  if (!disconnected) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Connection not found.' }, { status: 404 }));
  }

  await writeAuditEvent({
    userId: authContext.userId,
    orgId: authContext.orgId,
    action: 'cloud.connection.disconnected',
    ipAddress,
    userAgent,
    metadata: { provider },
  });

  return withSecurityHeaders(req, NextResponse.json({ success: true }, { status: 200 }));
}
