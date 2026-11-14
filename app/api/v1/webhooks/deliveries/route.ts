import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { isSecureRequest } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { isAdminRole } from '@/lib/role-utils';
import { parseRecoveryHistoryQuery, WEBHOOK_HISTORY_STATUSES } from '@/lib/recovery-history';
import WebhookDeliveryModel from '@/models/WebhookDelivery';
import connectDB from '@/utils/db';

export async function GET(req: NextRequest) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const endpointId = req.nextUrl.searchParams.get('endpointId');
  if (endpointId && !mongoose.Types.ObjectId.isValid(endpointId)) return NextResponse.json({ message: 'Invalid webhook ID.' }, { status: 400 });
  let history;
  try {
    history = parseRecoveryHistoryQuery(req.nextUrl.searchParams, { orgId: context.orgId, ...(endpointId ? { endpointId } : {}) }, WEBHOOK_HISTORY_STATUSES);
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }
  await connectDB();
  const deliveries = await WebhookDeliveryModel.find(history.filter)
    .select('endpointId eventId event status attempts maxAttempts nextAttemptAt lastAttemptAt deliveredAt lastStatusCode lastError attemptHistory createdAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(history.limit + 1)
    .lean();
  const page = history.page(deliveries);
  return NextResponse.json({
    deliveries: page.items.map(({ _id, ...delivery }) => ({ ...delivery, id: String(_id), endpointId: String(delivery.endpointId) })),
    nextCursor: page.nextCursor,
  });
}
