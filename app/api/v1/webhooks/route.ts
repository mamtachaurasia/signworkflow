import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthContext } from '@/lib/auth-context';
import { isSecureRequest, validateCsrfToken } from '@/lib/auth';
import { createWebhookSecret, resolveWebhookSignatureVersion } from '@/lib/webhooks';
import { normalizeWebhookEventSubscriptions } from '@/lib/webhook-events';
import { getUsableWebhookEndpointFilter } from '@/lib/webhook-endpoint-state';
import { resolveWebhookDestination } from '@/lib/webhook-url';
import { isAdminRole } from '@/lib/role-utils';
import WebhookEndpointModel from '@/models/WebhookEndpoint';
import connectDB from '@/utils/db';

const Schema = z.object({ url: z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS webhook URL required'), events: z.array(z.string().trim().min(1).max(120)).min(1).max(50).optional() }).strict();

export async function GET(req: NextRequest) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  await connectDB();
  const endpoints = await WebhookEndpointModel.find({ orgId: context.orgId, ...getUsableWebhookEndpointFilter() }).select('url secretPrefix signatureVersion eventContractVersion events active pausedAt failureCount lastDeliveredAt lastStatusCode createdAt').sort({ createdAt: -1 }).lean();
  return NextResponse.json({
    webhooks: endpoints.map(({ _id, ...webhook }) => ({
      ...webhook,
      id: String(_id),
      eventContractVersion: webhook.eventContractVersion === 'v1' ? 'v1' : 'legacy',
      signatureVersion: resolveWebhookSignatureVersion({
        signatureVersion: webhook.signatureVersion,
        createdAt: webhook.createdAt,
      }),
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Validation failed' }, { status: 400 });
  const events = normalizeWebhookEventSubscriptions(parsed.data.events || ['*']);
  if (!events) return NextResponse.json({ message: 'Select * or one or more supported webhook events.' }, { status: 400 });
  try {
    await resolveWebhookDestination(parsed.data.url);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Webhook URL is not allowed.' }, { status: 400 });
  }
  const secret = createWebhookSecret();
  await connectDB();
  const endpoint = await WebhookEndpointModel.create({
    orgId: context.orgId,
    createdBy: context.userId,
    url: parsed.data.url,
    signatureVersion: 'v2',
    eventContractVersion: 'v1',
    events,
    ...secret,
  });
  return NextResponse.json({ webhook: { id: String(endpoint._id), url: endpoint.url, signatureVersion: endpoint.signatureVersion, eventContractVersion: endpoint.eventContractVersion, events: endpoint.events, active: endpoint.active, createdAt: endpoint.createdAt }, secret: secret.secret, warning: 'Store this secret now. It will not be shown again.' }, { status: 201 });
}
