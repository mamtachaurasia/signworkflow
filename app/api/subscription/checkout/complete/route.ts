import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthContext } from '@/lib/auth-context';
import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import { getBillingConfigForProvider } from '@/lib/billing';
import { completeBillingCheckoutForUser } from '@/lib/billing-server';

export const runtime = 'nodejs';

const CheckoutCompleteSchema = z.union([
  z.object({
    provider: z.literal('razorpay'),
    razorpay_payment_id: z.string().trim().min(1),
    razorpay_subscription_id: z.string().trim().min(1),
    razorpay_signature: z.string().trim().min(1),
  }),
  z.object({
    provider: z.literal('paypal'),
    paypal_subscription_id: z.string().trim().min(1),
  }),
  z.object({
    provider: z.literal('paypal'),
    paypal_order_id: z.string().trim().min(1),
    paypal_checkout_session_id: z.string().trim().min(1).optional(),
  }),
]);

export async function POST(req: NextRequest) {
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

  const context = await getAuthContext(req);
  if (!context?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
    );
  }

  const parsed = CheckoutCompleteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Validation failed',
          errors: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      )
    );
  }

  const billingConfig = getBillingConfigForProvider(parsed.data.provider);
  if (!billingConfig.configured) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Billing checkout completion is not configured for this environment.',
          missingConfig: billingConfig.missing,
        },
        { status: 503 }
      )
    );
  }

  try {
    const result = await completeBillingCheckoutForUser({
      userId: context.userId,
      orgId: context.orgId,
      checkout: parsed.data,
    });

    await writeAuditEvent({
      userId: context.userId,
      orgId: result.organizationId ?? context.orgId ?? null,
      action: 'subscription.checkout_verified',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        provider: billingConfig.provider,
        subscriptionId: result.subscriptionId,
        subscriptionStatus: result.subscriptionStatus,
      },
    });

    return withSecurityHeaders(req, NextResponse.json(result, { status: 200 }));
  } catch (error) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: error instanceof Error ? error.message : 'Unable to verify subscription checkout.',
        },
        { status: 400 }
      )
    );
  }
}
