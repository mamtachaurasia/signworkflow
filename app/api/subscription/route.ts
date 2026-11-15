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
import { resolvePublicBaseUrl } from '@/lib/app-url';
import { writeAuditEvent } from '@/lib/audit';
import { getBillingConfigForMarket } from '@/lib/billing';
import { startBillingCheckoutForUser } from '@/lib/billing-server';
import { isOwnerRole } from '@/lib/role-utils';
import { ORGANIZATION_PLAN_OPTIONS } from '@/lib/subscription-plans';
import { getSubscriptionSummaryForUser } from '@/lib/subscription-server';

export const runtime = 'nodejs';

const SubscriptionPatchSchema = z.object({
  targetPlan: z.enum(ORGANIZATION_PLAN_OPTIONS),
  billingCycle: z.enum(['monthly', 'annually']).default('annually'),
  billingMarket: z.enum(['india', 'international']).default('international'),
});

function getCheckoutErrorStatus(message: string): number {
  if (
    message.includes('already active') ||
    message.includes('subscription in progress') ||
    message.includes('billing step for this workspace is still in progress') ||
    message.includes('checkout is already in progress for this workspace') ||
    message.includes('checkout is already processing for this workspace')
  ) {
    return 409;
  }

  if (
    message.includes('PayPal authentication failed') ||
    message.includes('PayPal credentials are invalid') ||
    message.includes('PayPal credentials are not configured')
  ) {
    return 503;
  }

  if (message.includes('Unable to start billing checkout for this account')) {
    return 404;
  }

  return 502;
}

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

  const summary = await getSubscriptionSummaryForUser(context.userId);
  return withSecurityHeaders(req, NextResponse.json(summary, { status: 200 }));
}

export async function PATCH(req: NextRequest) {
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

  const parsed = SubscriptionPatchSchema.safeParse(rawBody);
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

  if (context.orgId && !isOwnerRole(context.orgRole)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Only workspace owners can change the current workspace plan.' }, { status: 403 })
    );
  }

  const billingConfig = getBillingConfigForMarket(parsed.data.billingMarket);
  if (!billingConfig.configured) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Billing checkout is not configured for this environment.',
          missingConfig: billingConfig.missing,
        },
        { status: 503 }
      )
    );
  }

  if (!billingConfig.supportsCheckout) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message:
            billingConfig.statusMessage ||
            'Self-serve billing is not enabled for the current billing provider.',
          provider: billingConfig.provider,
        },
        { status: 409 }
      )
    );
  }

  try {
    const checkoutSession = await startBillingCheckoutForUser({
      baseUrl: resolvePublicBaseUrl({ req }),
      userId: context.userId,
      targetPlan: parsed.data.targetPlan,
      billingCycle: parsed.data.billingCycle,
      billingMarket: parsed.data.billingMarket,
      orgId: context.orgId,
    });

    await writeAuditEvent({
      userId: context.userId,
      orgId: checkoutSession.organizationId ?? context.orgId ?? null,
      action: 'subscription.checkout_started',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        targetPlan: parsed.data.targetPlan,
        billingCycle: parsed.data.billingCycle,
        billingMarket: parsed.data.billingMarket,
        provider: billingConfig.provider,
        sessionId: checkoutSession.sessionId,
        mode: checkoutSession.mode,
      },
    });

    return withSecurityHeaders(req, NextResponse.json(checkoutSession, { status: 200 }));
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Unable to start subscription checkout.';

    console.error('Subscription checkout start failed:', error);

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message,
          provider: billingConfig.provider,
        },
        { status: getCheckoutErrorStatus(message) }
      )
    );
  }
}
