import { NextRequest, NextResponse } from 'next/server';

import {
  getBillingConfigForProvider,
  verifyPayPalWebhookEvent,
  verifyRazorpayWebhookEvent,
} from '@/lib/billing';
import { syncBillingWebhookEvent } from '@/lib/billing-server';

export const runtime = 'nodejs';

const MAX_WEBHOOK_SKEW_MS = 5 * 60 * 1000;

function isRecentTimestamp(value: string | null): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  return Math.abs(Date.now() - parsed) <= MAX_WEBHOOK_SKEW_MS;
}


export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  try {
    const hasPayPalHeaders = Boolean(req.headers.get('paypal-transmission-id'));

    if (hasPayPalHeaders) {
      const billingConfig = getBillingConfigForProvider('paypal');
      if (!billingConfig.configured) {
        return NextResponse.json(
          {
            message: 'Billing webhook endpoint is not configured for this deployment.',
            missingConfig: billingConfig.missing,
          },
          { status: 503 }
        );
      }

      const transmissionId = req.headers.get('paypal-transmission-id');
      const transmissionTime = req.headers.get('paypal-transmission-time');
      const certUrl = req.headers.get('paypal-cert-url');
      const authAlgo = req.headers.get('paypal-auth-algo');
      const transmissionSig = req.headers.get('paypal-transmission-sig');

      if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
        return NextResponse.json({ message: 'Missing PayPal webhook verification headers.' }, { status: 400 });
      }

      if (!isRecentTimestamp(transmissionTime)) {
        return NextResponse.json({ message: 'Stale PayPal webhook timestamp.' }, { status: 400 });
      }

      const event = await verifyPayPalWebhookEvent({
        rawBody,
        headers: {
          authAlgo,
          certUrl,
          transmissionId,
          transmissionSig,
          transmissionTime,
        },
      });
      const result = await syncBillingWebhookEvent({
        provider: 'paypal',
        event,
      });

      return NextResponse.json(
        {
          received: true,
          duplicate: result.duplicate,
          orgId: result.orgId,
        },
        { status: 200 }
      );
    }

    const billingConfig = getBillingConfigForProvider('razorpay');
    if (!billingConfig.configured) {
      return NextResponse.json(
        {
          message: 'Billing webhook endpoint is not configured for this deployment.',
          missingConfig: billingConfig.missing,
        },
        { status: 503 }
      );
    }

    const event = verifyRazorpayWebhookEvent(rawBody, req.headers.get('x-razorpay-signature'));
    const result = await syncBillingWebhookEvent({
      provider: 'razorpay',
      event,
      eventIdHeader: req.headers.get('x-razorpay-event-id'),
    });
    return NextResponse.json(
      {
        received: true,
        duplicate: result.duplicate,
        orgId: result.orgId,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Invalid billing webhook.',
      },
      { status: 400 }
    );
  }
}
