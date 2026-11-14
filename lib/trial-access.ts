import { NextRequest, NextResponse } from 'next/server';

import { isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { getExpiredTrialWriteGuard } from '@/lib/subscription-server';

type TrialWriteAccessArgs = {
  orgId?: string | null;
  req?: NextRequest;
};

export async function getTrialWriteAccessDeniedResponse(
  args: TrialWriteAccessArgs
): Promise<NextResponse | null> {
  const trialGuard = await getExpiredTrialWriteGuard({ orgId: args.orgId });
  if (trialGuard.allowed) {
    return null;
  }

  const response = NextResponse.json(
    { message: trialGuard.message, reason: trialGuard.reason },
    { status: trialGuard.status }
  );

  return args.req ? withSecurityHeaders(args.req, response) : response;
}

type AuthContextValue = Awaited<ReturnType<typeof getAuthContext>>;

type TrialProtectedHandler<TContext> = (
  req: NextRequest,
  context: TContext,
  authContext: AuthContextValue
) => Promise<NextResponse>;

type TrialProtectionOptions = {
  authOptions?: Parameters<typeof getAuthContext>[1];
  useSecurityHeaders?: boolean;
  /** Enforce HTTPS and CSRF for authenticated cookie/browser mutations. */
  requireCsrf?: boolean;
};

export function withTrialWriteAccessFromAuthContext<TContext = unknown>(
  handler: TrialProtectedHandler<TContext>,
  options: TrialProtectionOptions = {}
) {
  return async (req: NextRequest, context: TContext): Promise<NextResponse> => {
    const authContext = await getAuthContext(req, options.authOptions);
    const isAuthenticatedUser = Boolean(
      authContext?.userId && !authContext.userId.startsWith('guest_')
    );
    if (options.requireCsrf && isAuthenticatedUser) {
      if (!isSecureRequest(req)) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'HTTPS is required for this action.' }, { status: 400 })
        );
      }
      if (!validateCsrfToken(req)) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'CSRF validation failed', reason: 'csrf_mismatch' }, { status: 403 })
        );
      }
    }
    const deniedResponse = await getTrialWriteAccessDeniedResponse({
      orgId: authContext?.orgId,
      req: options.useSecurityHeaders ? req : undefined,
    });

    if (deniedResponse) {
      return deniedResponse;
    }

    return handler(req, context, authContext);
  };
}
