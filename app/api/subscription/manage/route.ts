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
import { getBillingConfig } from '@/lib/billing';
import { manageBillingSubscription } from '@/lib/billing-server';
import { isOwnerRole } from '@/lib/role-utils';

export const runtime = 'nodejs';

const SubscriptionManageSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
  timing: z.enum(['now', 'cycle_end']).optional(),
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

  const billingConfig = getBillingConfig();
  if (!billingConfig.configured) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Billing management is not configured for this environment.',
          missingConfig: billingConfig.missing,
        },
        { status: 503 }
      )
    );
  }

  const context = await getAuthContext(req);
  if (!context?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  if (!context.orgId || !isOwnerRole(context.orgRole)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Only workspace owners can manage subscription billing.' }, { status: 403 })
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 }));
  }

  const parsed = SubscriptionManageSchema.safeParse(rawBody);
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

  try {
    const result = await manageBillingSubscription({
      orgId: context.orgId,
      action: parsed.data.action,
      timing: parsed.data.timing,
    });

    await writeAuditEvent({
      userId: context.userId,
      orgId: context.orgId,
      action: `subscription.${parsed.data.action}_requested`,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        provider: billingConfig.provider,
        timing: parsed.data.timing || null,
        subscriptionId: result.subscriptionId,
        subscriptionStatus: result.subscriptionStatus,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      },
    });

    return withSecurityHeaders(req, NextResponse.json(result, { status: 200 }));
  } catch (error) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: error instanceof Error ? error.message : 'Unable to manage subscription.',
        },
        { status: 400 }
      )
    );
  }
}
