import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { isSecureRequest, validateCsrfToken } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { PAUSED_WEBHOOK_DELIVERY_ERROR, resolveWebhookSignatureVersion } from '@/lib/webhooks';
import { isAdminRole } from '@/lib/role-utils';
import { resolveWebhookDestination } from '@/lib/webhook-url';
import { normalizeWebhookEventSubscriptions } from '@/lib/webhook-events';
import { getUsableWebhookEndpointFilter } from '@/lib/webhook-endpoint-state';
import WebhookDeliveryModel from '@/models/WebhookDelivery';
import WebhookEndpointModel, { type WebhookSignatureVersion } from '@/models/WebhookEndpoint';
import connectDB from '@/utils/db';

type WebhookView = {
  _id: unknown;
  url: string;
  secretPrefix: string;
  signatureVersion?: WebhookSignatureVersion;
  eventContractVersion?: string;
  events: string[];
  active: boolean;
  pausedAt?: Date | null;
  failureCount: number;
  lastDeliveredAt?: Date | null;
  lastStatusCode?: number | null;
  createdAt: Date;
};

const UpdateSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS webhook URL required').optional(),
  events: z.array(z.string().trim().min(1).max(120)).min(1).max(50).optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => value.url !== undefined || value.events !== undefined || value.active !== undefined, {
  message: 'Provide a URL, event list, or active state.',
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const { webhookId } = await params;
  if (!mongoose.Types.ObjectId.isValid(webhookId)) return NextResponse.json({ message: 'Invalid webhook ID.' }, { status: 400 });
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Validation failed.' }, { status: 400 });
  await connectDB();
  const existing = await WebhookEndpointModel.findOne({ _id: webhookId, orgId: context.orgId, ...getUsableWebhookEndpointFilter() })
    .select('eventContractVersion active')
    .lean<{ eventContractVersion?: string; active?: boolean } | null>();
  if (!existing) return NextResponse.json({ message: 'Webhook not found.' }, { status: 404 });
  const events = parsed.data.events
    ? existing.eventContractVersion === 'v1'
      ? normalizeWebhookEventSubscriptions(parsed.data.events)
      : [...new Set(parsed.data.events.map((event) => event.trim()).filter(Boolean))]
    : undefined;
  if (parsed.data.events && !events?.length) return NextResponse.json({ message: 'Select * or one or more supported webhook events.' }, { status: 400 });
  if (parsed.data.url) {
    try {
      await resolveWebhookDestination(parsed.data.url);
    } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : 'Webhook URL is not allowed.' }, { status: 400 });
    }
  }
  // If releasing the paused backlog fails after the endpoint is activated,
  // the worker must see these jobs before any already-confirmed paused queue.
  // Do this first so a failed preflight leaves the endpoint paused.
  if (parsed.data.active === true && existing.active === false) {
    await WebhookDeliveryModel.updateMany(
      { endpointId: webhookId, status: 'paused' },
      { $set: { pausedStateCheckedAt: null } }
    ).exec();
  }
  const now = new Date();
  const update: Record<string, unknown> = {};
  if (parsed.data.url) update.url = parsed.data.url;
  if (events) update.events = events;
  if (parsed.data.active !== undefined) {
    update.active = parsed.data.active;
    update.pausedAt = parsed.data.active ? null : now;
  }
  const endpoint = await WebhookEndpointModel.findOneAndUpdate(
    { _id: webhookId, orgId: context.orgId, ...getUsableWebhookEndpointFilter() },
    { $set: update },
    { new: true }
  ).select('url secretPrefix signatureVersion eventContractVersion events active pausedAt failureCount lastDeliveredAt lastStatusCode createdAt').lean<WebhookView | null>();
  if (!endpoint) return NextResponse.json({ message: 'Webhook not found.' }, { status: 404 });
  if (parsed.data.active === false) {
    await WebhookDeliveryModel.updateMany(
      { endpointId: webhookId, status: { $in: ['pending', 'failed'] } },
      { $set: { status: 'paused', lockedAt: null, lastError: PAUSED_WEBHOOK_DELIVERY_ERROR, pausedStateCheckedAt: null } }
    ).exec();
  } else if (parsed.data.active === true && existing.active === false) {
    await WebhookDeliveryModel.updateMany(
      { endpointId: webhookId, status: { $in: ['paused', 'pending', 'failed'] } },
      { $set: { status: 'pending', lockedAt: null, nextAttemptAt: now, lastError: null, pausedStateCheckedAt: null } }
    ).exec();
  }
  return NextResponse.json({
    webhook: {
      ...endpoint,
      id: String(endpoint._id),
      signatureVersion: resolveWebhookSignatureVersion(endpoint),
      eventContractVersion: endpoint.eventContractVersion === 'v1' ? 'v1' : 'legacy',
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const { webhookId } = await params;
  if (!mongoose.Types.ObjectId.isValid(webhookId)) return NextResponse.json({ message: 'Invalid webhook ID.' }, { status: 400 });
  await connectDB();
  const result = await WebhookEndpointModel.updateOne(
    { _id: webhookId, orgId: context.orgId, ...getUsableWebhookEndpointFilter() },
    { $set: { active: false, pausedAt: new Date(), revokedAt: new Date() } }
  ).exec();
  if (!result.matchedCount) return NextResponse.json({ message: 'Webhook not found.' }, { status: 404 });
  try {
    await WebhookDeliveryModel.updateMany(
      { endpointId: webhookId, status: { $in: ['pending', 'paused', 'failed'] } },
      { $set: { status: 'dead_letter', lockedAt: null, lastError: 'Webhook endpoint was revoked.', pausedStateCheckedAt: null } }
    ).exec();
  } catch (error) {
    // The endpoint is already revoked. Prioritize any held delivery for the
    // worker's reconciliation pass if the terminal bulk update was transiently
    // unavailable.
    await WebhookDeliveryModel.updateMany(
      { endpointId: webhookId, status: 'paused' },
      { $set: { pausedStateCheckedAt: null } }
    ).exec().catch(() => undefined);
    throw error;
  }
  return NextResponse.json({ revoked: true });
}
