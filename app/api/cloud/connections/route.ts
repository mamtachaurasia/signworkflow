import { NextRequest, NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth-context';
import { isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { listCloudConnectionsForUser } from '@/lib/cloud/connections';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  const context = await getAuthContext(req);
  if (!context?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  await connectDB();
  const providers = await listCloudConnectionsForUser(context.userId);

  return withSecurityHeaders(req, NextResponse.json({ providers }, { status: 200 }));
}
