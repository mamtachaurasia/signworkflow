import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { isSecureRequest, validateCsrfToken } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { isAdminRole } from '@/lib/role-utils';
import { enqueueWebhookTest, processWebhookDelivery } from '@/lib/webhooks';

export async function POST(req: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const { webhookId } = await params;
  if (!mongoose.Types.ObjectId.isValid(webhookId)) return NextResponse.json({ message: 'Invalid webhook ID.' }, { status: 400 });
  const queued = await enqueueWebhookTest({ orgId: context.orgId, endpointId: webhookId });
  if (!queued) return NextResponse.json({ message: 'Webhook not found.' }, { status: 404 });
  const delivery = await processWebhookDelivery(String(queued._id));
  const delivered = delivery?.status === 'delivered';
  return NextResponse.json({
    delivered,
    deliveryId: String(queued._id),
    status: delivery?.status || 'pending',
    statusCode: delivery?.lastStatusCode ?? null,
  }, { status: delivered ? 200 : 502 });
}
