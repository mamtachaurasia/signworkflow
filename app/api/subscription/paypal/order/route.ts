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
import { createPayPalCardOrderForUser } from '@/lib/billing-server';
import { isOwnerRole } from '@/lib/role-utils';
import { ORGANIZATION_PLAN_OPTIONS } from '@/lib/subscription-plans';

export const runtime = 'nodejs';

const CreatePayPalOrderSchema = z.object({
  checkoutSessionId: z.string().trim().min(1),
  targetPlan: z.enum(ORGANIZATION_PLAN_OPTIONS),
  billingCycle: z.enum(['monthly', 'annually']),
  billingMarket: z.literal('international'),
  paymentMethod: z.enum(['paypal', 'card']).optional(),
});

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

  if (context.orgId && !isOwnerRole(context.orgRole)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Only workspace owners can change the current workspace plan.' }, { status: 403 })
    );
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

  const parsed = CreatePayPalOrderSchema.safeParse(rawBody);
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

  const billingConfig = getBillingConfigForProvider('paypal');
  if (!billingConfig.configured) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'PayPal checkout is not configured for this environment.',
          missingConfig: billingConfig.missing,
        },
        { status: 503 }
      )
    );
  }

  try {
    const result = await createPayPalCardOrderForUser({
      userId: context.userId,
      orgId: context.orgId,
      checkoutSessionId: parsed.data.checkoutSessionId,
      targetPlan: parsed.data.targetPlan,
      billingCycle: parsed.data.billingCycle,
      billingMarket: parsed.data.billingMarket,
      paymentMethod: parsed.data.paymentMethod || 'card',
    });

    await writeAuditEvent({
      userId: context.userId,
      orgId: context.orgId ?? null,
      action: 'subscription.checkout_order_created',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        provider: 'paypal',
        orderId: result.orderId,
        checkoutSessionId: parsed.data.checkoutSessionId,
        targetPlan: parsed.data.targetPlan,
        billingCycle: parsed.data.billingCycle,
        paymentMethod: parsed.data.paymentMethod || 'card',
      },
    });

    return withSecurityHeaders(req, NextResponse.json(result, { status: 200 }));
  } catch (error) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: error instanceof Error ? error.message : 'Unable to create the PayPal checkout order.',
        },
        { status: 400 }
      )
    );
  }
}
