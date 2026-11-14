import { NextRequest, NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth-context';
import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import { resumePendingBillingCheckoutForUser } from '@/lib/billing-server';
import { isOwnerRole } from '@/lib/role-utils';

export const runtime = 'nodejs';

function getPendingCheckoutErrorStatus(message: string): number {
  if (
    message.includes('There is no pending billing checkout') ||
    message.includes('cannot be reopened') ||
    message.includes('cannot be reopened automatically') ||
    message.includes('already processing')
  ) {
    return 409;
  }

  if (message.includes('Unable to start billing checkout for this account')) {
    return 404;
  }

  return 502;
}

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
      NextResponse.json({ message: 'Only workspace owners can continue pending subscription billing.' }, { status: 403 })
    );
  }

  try {
    const checkoutSession = await resumePendingBillingCheckoutForUser({
      userId: context.userId,
      orgId: context.orgId,
    });

    await writeAuditEvent({
      userId: context.userId,
      orgId: checkoutSession.organizationId ?? context.orgId ?? null,
      action: 'subscription.checkout_resumed',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        sessionId: checkoutSession.sessionId,
        provider: checkoutSession.checkout.provider,
        mode: checkoutSession.mode,
      },
    });

    return withSecurityHeaders(req, NextResponse.json(checkoutSession, { status: 200 }));
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Unable to continue the pending billing checkout.';

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message,
        },
        { status: getPendingCheckoutErrorStatus(message) }
      )
    );
  }
}
