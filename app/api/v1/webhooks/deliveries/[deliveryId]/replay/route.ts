import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { isSecureRequest, validateCsrfToken } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { isAdminRole } from '@/lib/role-utils';
import { processWebhookDelivery, replayWebhookDelivery } from '@/lib/webhooks';

export async function POST(req: NextRequest, { params }: { params: Promise<{ deliveryId: string }> }) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const { deliveryId } = await params;
  if (!mongoose.Types.ObjectId.isValid(deliveryId)) return NextResponse.json({ message: 'Invalid delivery ID.' }, { status: 400 });
  const queued = await replayWebhookDelivery({ orgId: context.orgId, deliveryId });
  if (!queued) return NextResponse.json({ message: 'Failed delivery not found.' }, { status: 404 });
  const delivery = await processWebhookDelivery(deliveryId);
  return NextResponse.json({
    delivery: {
      id: deliveryId,
      status: delivery?.status || 'pending',
      attempts: delivery?.attempts ?? 0,
      lastStatusCode: delivery?.lastStatusCode ?? null,
      lastError: delivery?.lastError ?? null,
    },
  });
}
