'use client';

import { getCookieValue } from '@/utils/cookies';

import type {
  BillingActionTiming,
  BillingCheckoutSession,
  BillingCheckoutSuccessPayload,
  BillingCycle,
  BillingMarket,
  BillingManagementAction,
  PayPalCardCheckoutSession,
  RazorpayCheckoutSuccessPayload,
} from '@/lib/billing';
import type { OrganizationTierId } from '@/lib/subscription-plans';

type ApiErrorPayload = {
  message?: string;
};

export const CHECKOUT_CANCELLED_MESSAGE =
  'Checkout was cancelled. Your current workspace plan did not change.';

type RazorpayFailurePayload = {
  error?: {
    description?: string;
  };
};

type RazorpayCheckoutOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill?: {
    email?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
  handler?: (response: Omit<RazorpayCheckoutSuccessPayload, 'provider'>) => void;
};

type RazorpayInstance = {
  open: () => void;
  on?: (event: 'payment.failed', callback: (response: RazorpayFailurePayload) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

async function parseApiError(res: Response, fallbackMessage: string): Promise<Error> {
  const payload = (await res.json().catch(() => null)) as ApiErrorPayload | null;
  return new Error(payload?.message || fallbackMessage);
}

export async function startSubscriptionCheckout(args: {
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
}): Promise<{
  mode: 'checkout' | 'updated';
  checkout: BillingCheckoutSession | null;
  message: string | null;
  sessionId: string;
}> {
  const csrfToken = getCookieValue('csrf_token');
  const res = await fetch('/api/subscription', {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    throw await parseApiError(res, 'Unable to start subscription checkout.');
  }

  return (await res.json()) as {
    mode: 'checkout' | 'updated';
    checkout: BillingCheckoutSession | null;
    message: string | null;
    sessionId: string;
  };
}

export async function continuePendingSubscriptionCheckout(): Promise<{
  mode: 'checkout';
  checkout: BillingCheckoutSession;
  message: string | null;
  sessionId: string;
}> {
  const csrfToken = getCookieValue('csrf_token');
  const res = await fetch('/api/subscription/pending', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });

  if (!res.ok) {
    throw await parseApiError(res, 'Unable to continue the pending subscription checkout.');
  }

  return (await res.json()) as {
    mode: 'checkout';
    checkout: BillingCheckoutSession;
    message: string | null;
    sessionId: string;
  };
}

async function completeSubscriptionCheckout(
  payload: BillingCheckoutSuccessPayload
): Promise<{
  redirectPath: string;
  message: string;
  organizationId: string | null;
  subscriptionId: string;
  subscriptionStatus: string | null;
}> {
  const csrfToken = getCookieValue('csrf_token');
  const res = await fetch('/api/subscription/checkout/complete', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await parseApiError(res, 'Unable to verify subscription checkout.');
  }

  return (await res.json()) as {
    redirectPath: string;
    message: string;
    organizationId: string | null;
    subscriptionId: string;
    subscriptionStatus: string | null;
  };
}

const PENDING_PAYPAL_SUBSCRIPTION_KEY = 'billing:pending-paypal-subscription-id';

export function getPendingPayPalSubscriptionId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(PENDING_PAYPAL_SUBSCRIPTION_KEY);
}

export function setPendingPayPalSubscriptionId(subscriptionId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_PAYPAL_SUBSCRIPTION_KEY, subscriptionId);
}

export function clearPendingPayPalSubscriptionId() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_PAYPAL_SUBSCRIPTION_KEY);
}

export async function completeHostedSubscriptionCheckout(args: {
  provider: 'paypal';
  subscriptionId: string;
}) {
  return completeSubscriptionCheckout({
    provider: 'paypal',
    paypal_subscription_id: args.subscriptionId,
  });
}

export async function createPayPalCardOrder(checkout: PayPalCardCheckoutSession): Promise<{
  orderId: string;
}> {
  return createPayPalCheckoutOrder(checkout, 'card');
}

export async function createPayPalCheckoutOrder(
  checkout: PayPalCardCheckoutSession,
  paymentMethod: 'paypal' | 'card'
): Promise<{
  orderId: string;
}> {
  const csrfToken = getCookieValue('csrf_token');
  const res = await fetch('/api/subscription/paypal/order', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify({
      checkoutSessionId: checkout.checkoutSessionId,
      targetPlan: checkout.targetPlan,
      billingCycle: checkout.billingCycle,
      billingMarket: checkout.billingMarket,
      paymentMethod,
    }),
  });

  if (!res.ok) {
    throw await parseApiError(res, 'Unable to create the PayPal checkout order.');
  }

  return (await res.json()) as {
    orderId: string;
  };
}

export async function completePayPalCardCheckout(args: {
  orderId: string;
  checkoutSessionId?: string;
}) {
  return completeSubscriptionCheckout({
    provider: 'paypal',
    paypal_order_id: args.orderId,
    paypal_checkout_session_id: args.checkoutSessionId,
  });
}

async function loadRazorpayCheckoutScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Razorpay checkout is only available in the browser.');
  }

  if (window.Razorpay) {
    return;
  }

  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Razorpay checkout.'));
      document.body.appendChild(script);
    });
  }

  return razorpayScriptPromise;
}

export async function openSubscriptionCheckout(
  checkout: BillingCheckoutSession
): Promise<{
  redirectPath: string;
  message: string;
  organizationId: string | null;
  subscriptionId: string;
  subscriptionStatus: string | null;
} | null> {
  if (checkout.provider === 'paypal') {
    if (checkout.flow === 'card_fields') {
      throw new Error('PayPal card checkout is rendered inline and should not be opened as a redirect.');
    }

    if (typeof window === 'undefined') {
      throw new Error('PayPal checkout is only available in the browser.');
    }

    setPendingPayPalSubscriptionId(checkout.subscriptionId);
    window.location.assign(checkout.approvalUrl);
    return null;
  }

  await loadRazorpayCheckoutScript();

  if (!window.Razorpay) {
    throw new Error('Razorpay checkout is unavailable.');
  }

  const Razorpay = window.Razorpay;

  return new Promise((resolve, reject) => {
    let settled = false;

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const resolveOnce = (result: {
      redirectPath: string;
      message: string;
      organizationId: string | null;
      subscriptionId: string;
      subscriptionStatus: string | null;
    }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const razorpay = new Razorpay({
      key: checkout.key,
      subscription_id: checkout.subscriptionId,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      notes: checkout.notes,
      theme: checkout.theme,
      modal: {
        ondismiss: () => {
          void cancelPendingSubscriptionCheckout()
            .catch(() => null)
            .finally(() => rejectOnce(new Error(CHECKOUT_CANCELLED_MESSAGE)));
        },
      },
      handler: async (response) => {
        try {
          const result = await completeSubscriptionCheckout({
            provider: 'razorpay',
            ...response,
          });
          resolveOnce(result);
        } catch (error) {
          rejectOnce(
            error instanceof Error ? error : new Error('Unable to verify subscription checkout.')
          );
        }
      },
    });

    razorpay.on?.('payment.failed', (response) => {
      rejectOnce(new Error(response.error?.description || 'Razorpay payment failed.'));
    });

    razorpay.open();
  });
}

export async function manageSubscription(args: {
  action: BillingManagementAction;
  timing?: BillingActionTiming;
}): Promise<{
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  message: string;
}> {
  const csrfToken = getCookieValue('csrf_token');
  const res = await fetch('/api/subscription/manage', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    throw await parseApiError(res, 'Unable to update subscription.');
  }

  return (await res.json()) as {
    subscriptionStatus: string | null;
    cancelAtPeriodEnd: boolean;
    message: string;
  };
}

export async function cancelPendingSubscriptionCheckout() {
  return manageSubscription({
    action: 'cancel',
    timing: 'now',
  });
}
