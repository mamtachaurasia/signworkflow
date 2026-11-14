import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { isSecureRequest, validateCsrfToken } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { createWebhookSecret, resolveWebhookSignatureVersion } from '@/lib/webhooks';
import { getUsableWebhookEndpointFilter } from '@/lib/webhook-endpoint-state';
import { isAdminRole } from '@/lib/role-utils';
import WebhookEndpointModel from '@/models/WebhookEndpoint';
import connectDB from '@/utils/db';

type WebhookView = {
  _id: unknown;
  url: string;
  secretPrefix: string;
  eventContractVersion?: string;
  signatureVersion?: 'v1' | 'v2';
  events: string[];
  active: boolean;
  pausedAt?: Date | null;
  createdAt: Date;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  if (!isSecureRequest(req)) return NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 });
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 });
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (!isAdminRole(context.orgRole)) return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
  const { webhookId } = await params;
  if (!mongoose.Types.ObjectId.isValid(webhookId)) return NextResponse.json({ message: 'Invalid webhook ID.' }, { status: 400 });
  const secret = createWebhookSecret();
  await connectDB();
  const endpoint = await WebhookEndpointModel.findOneAndUpdate(
    { _id: webhookId, orgId: context.orgId, ...getUsableWebhookEndpointFilter() },
    {
      $set: {
        secretHash: secret.secretHash,
        secretEncrypted: secret.secretEncrypted,
        secretPrefix: secret.secretPrefix,
      },
    },
    { new: true }
  ).select('url secretPrefix signatureVersion eventContractVersion events active pausedAt createdAt').lean<WebhookView | null>();
  if (!endpoint) return NextResponse.json({ message: 'Webhook not found.' }, { status: 404 });
  return NextResponse.json({
    webhook: {
      ...endpoint,
      id: String(endpoint._id),
      signatureVersion: resolveWebhookSignatureVersion(endpoint),
      eventContractVersion: endpoint.eventContractVersion === 'v1' ? 'v1' : 'legacy',
    },
    secret: secret.secret,
    warning: `Replace the receiver secret now. New and retried deliveries use this secret immediately; the ${resolveWebhookSignatureVersion(endpoint)} signing format is unchanged.`,
  });
}
