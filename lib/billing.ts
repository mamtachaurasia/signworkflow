import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

import { getDefaultBillingMarket as getDefaultBillingMarketFromCountry } from '@/lib/billing-market';
import type { OrganizationStatus } from '@/models/Organization';
import { PRICING_PLANS, getPlanChargeValue } from '@/lib/pricing';
import { getOrganizationPlanLabel, type OrganizationTierId } from '@/lib/subscription-plans';

export type BillingCycle = 'monthly' | 'annually';
export type BillingMarket = 'india' | 'international';
export type BillingProvider = 'razorpay' | 'paypal';
export type PayPalPaymentMethodType = 'paypal' | 'card';
export type BillingManagementAction = 'pause' | 'resume' | 'cancel';
export type BillingActionTiming = 'now' | 'cycle_end';

export type OrganizationBillingState = {
  provider: BillingProvider;
  market?: BillingMarket;
  customerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  targetPlan?: OrganizationTierId;
  planId?: string;
  billingCycle?: BillingCycle;
  currencyCode?: string;
  vaultId?: string;
  vaultStatus?: string;
  paymentMethodType?: PayPalPaymentMethodType;
  paymentMethodBrand?: string;
  paymentMethodLast4?: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  hasScheduledChange?: boolean;
  lastCheckoutReference?: string;
  lastPaymentId?: string;
  lastWebhookEventId?: string;
  updatedAt?: Date | null;
};

export type BillingConfig = {
  provider: BillingProvider;
  configured: boolean;
  missing: string[];
  supportsCheckout: boolean;
  supportsManagement: boolean;
  statusMessage: string | null;
};

type BillingPlanIdMap = Record<OrganizationTierId, Record<BillingCycle, string | undefined>>;

function readEnvVar(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type RazorpaySubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'expired';

export type RazorpaySubscription = {
  id: string;
  entity?: 'subscription';
  plan_id?: string;
  customer_id?: string | null;
  status?: RazorpaySubscriptionStatus | string;
  quantity?: number;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  start_at?: number | null;
  ended_at?: number | null;
  total_count?: number | null;
  paid_count?: number | null;
  remaining_count?: number | null;
  short_url?: string | null;
  has_scheduled_changes?: boolean;
  schedule_change_at?: BillingActionTiming | string | null;
  notes?: Record<string, string>;
};

export type RazorpayCheckoutSession = {
  provider: 'razorpay';
  key: string;
  subscriptionId: string;
  name: string;
  description: string;
  prefill: {
    email: string;
  };
  notes: Record<string, string>;
  theme: {
    color: string;
  };
};

function isOrganizationTierId(value: string | null | undefined): value is OrganizationTierId {
  return value === 'business' || value === 'business_plus' || value === 'enterprise';
}

export type RazorpayCheckoutSuccessPayload = {
  provider: 'razorpay';
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

export type PayPalSubscriptionStatus =
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'EXPIRED';

export type PayPalVaultStatus =
  | 'APPROVED'
  | 'CREATED'
  | 'DELETION_INITIATED'
  | 'DELETED'
  | 'PAYER_ACTION_REQUIRED'
  | 'TOKENIZED'
  | 'VAULTED';

export type PayPalSubscription = {
  id: string;
  plan_id?: string;
  status?: PayPalSubscriptionStatus | string;
  status_update_time?: string;
  custom_id?: string;
  start_time?: string;
  create_time?: string;
  subscriber?: {
    email_address?: string;
    payer_id?: string;
  };
  billing_info?: {
    next_billing_time?: string;
    failed_payments_count?: number;
    last_payment?: {
      time?: string;
      amount?: {
        currency_code?: string;
        value?: string;
      };
    };
  };
  links?: Array<{
    href: string;
    rel: string;
    method?: string;
  }>;
};

export type PayPalHostedCheckoutSession = {
  provider: 'paypal';
  flow: 'hosted_approval';
  subscriptionId: string;
  approvalUrl: string;
};

export type PayPalCardCheckoutSession = {
  provider: 'paypal';
  flow: 'card_fields';
  checkoutSessionId: string;
  customerEmail?: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  amount: string;
  currencyCode: 'USD';
  sdkClientId: string;
  description: string;
  planLabel: string;
  organizationId?: string | null;
};

export type PayPalCheckoutSession = PayPalHostedCheckoutSession | PayPalCardCheckoutSession;

export type PayPalHostedCheckoutSuccessPayload = {
  provider: 'paypal';
  paypal_subscription_id: string;
};

export type PayPalCardCheckoutSuccessPayload = {
  provider: 'paypal';
  paypal_order_id: string;
  paypal_checkout_session_id?: string;
};

export type PayPalCheckoutSuccessPayload =
  | PayPalHostedCheckoutSuccessPayload
  | PayPalCardCheckoutSuccessPayload;

export type BillingCheckoutSession = RazorpayCheckoutSession | PayPalCheckoutSession;
export type BillingCheckoutSuccessPayload =
  | RazorpayCheckoutSuccessPayload
  | PayPalCheckoutSuccessPayload;

export type PayPalWebhookEvent = {
  id?: string;
  event_type: string;
  create_time?: string;
  resource?: Record<string, unknown>;
  summary?: string;
};

export type PayPalWebhookVerificationHeaders = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
};

export type PayPalVaultToken = {
  id?: string;
  status?: PayPalVaultStatus | string;
  customer?: {
    id?: string;
    email_address?: string;
    merchant_customer_id?: string;
  };
  links?: Array<{
    href: string;
    rel: string;
    method?: string;
  }>;
};

export type PayPalOrderCapture = {
  id: string;
  status?: string;
  create_time?: string;
  amount?: {
    currency_code?: string;
    value?: string;
  };
  seller_receivable_breakdown?: {
    gross_amount?: {
      currency_code?: string;
      value?: string;
    };
    net_amount?: {
      currency_code?: string;
      value?: string;
    };
    paypal_fee?: {
      currency_code?: string;
      value?: string;
    };
  };
  network_transaction_reference?: {
    id?: string;
    date?: string;
    network?: string;
    acquirer_reference_number?: string;
  };
  links?: Array<{
    href: string;
    rel: string;
    method?: string;
  }>;
};

export type PayPalOrder = {
  id: string;
  status?: string;
  create_time?: string;
  update_time?: string;
  intent?: string;
  payment_source?: {
    paypal?: {
      email_address?: string;
      account_id?: string;
      name?: {
        given_name?: string;
        surname?: string;
      };
      address?: {
        country_code?: string;
      };
      attributes?: {
        vault?: PayPalVaultToken;
      };
    };
    card?: {
      brand?: string;
      last_digits?: string;
      attributes?: {
        vault?: PayPalVaultToken;
      };
    };
  };
  purchase_units?: Array<{
    custom_id?: string;
    description?: string;
    invoice_id?: string;
    amount?: {
      currency_code?: string;
      value?: string;
    };
    payments?: {
      captures?: PayPalOrderCapture[];
    };
  }>;
  links?: Array<{
    href: string;
    rel: string;
    method?: string;
  }>;
};

export function buildRazorpayCheckoutSession(args: {
  subscriptionId: string;
  userId: string;
  userEmail: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  orgId?: string | null;
  orgName?: string | null;
}): RazorpayCheckoutSession {
  return {
    provider: 'razorpay',
    key: getRazorpayKeyId(),
    subscriptionId: args.subscriptionId,
    name: args.orgName?.trim() || 'SignWorkflow',
    description: `${getOrganizationPlanLabel(args.targetPlan)} subscription`,
    prefill: {
      email: args.userEmail,
    },
    notes: {
      userId: args.userId,
      targetPlan: args.targetPlan,
      billingCycle: args.billingCycle,
      orgId: args.orgId || '',
      orgName: args.orgName || '',
    },
    theme: {
      color: '#0f172a',
    },
  };
}

function buildPayPalCustomId(args: {
  userId: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  orgId?: string | null;
  checkoutSessionId?: string | null;
}) {
  return [
    `u:${args.userId}`,
    `p:${args.targetPlan}`,
    `c:${args.billingCycle}`,
    `m:${args.billingMarket}`,
    `o:${args.orgId || ''}`,
    `s:${args.checkoutSessionId || ''}`,
  ].join('|');
}

export function parsePayPalCustomId(customId?: string | null): {
  userId?: string;
  targetPlan?: OrganizationTierId;
  billingCycle?: BillingCycle;
  billingMarket?: BillingMarket;
  orgId?: string;
  checkoutSessionId?: string;
} {
  if (!customId) {
    return {};
  }

  const parsed = Object.fromEntries(
    customId.split('|').map((part) => {
      const [key, ...rest] = part.split(':');
      return [key, rest.join(':')];
    })
  );

  return {
    userId: parsed.u || undefined,
    targetPlan: isOrganizationTierId(parsed.p) ? parsed.p : undefined,
    billingCycle:
      parsed.c === 'monthly' || parsed.c === 'annually'
        ? (parsed.c as BillingCycle)
        : undefined,
    billingMarket:
      parsed.m === 'india' || parsed.m === 'international'
        ? (parsed.m as BillingMarket)
        : undefined,
    orgId: parsed.o || undefined,
    checkoutSessionId: parsed.s || undefined,
  };
}

function buildPayPalMerchantCustomerId(args: {
  userId: string;
  orgId?: string | null;
  checkoutSessionId: string;
}) {
  return `s_${args.checkoutSessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}`;
}

export function parsePayPalMerchantCustomerId(merchantCustomerId?: string | null): {
  userId?: string;
  orgId?: string;
  checkoutSessionId?: string;
} {
  if (!merchantCustomerId) {
    return {};
  }

  if (merchantCustomerId.startsWith('s_')) {
    return {
      checkoutSessionId: merchantCustomerId.slice(2) || undefined,
    };
  }

  const parsed = Object.fromEntries(
    merchantCustomerId.split('|').map((part) => {
      const [key, ...rest] = part.split(':');
      return [key, rest.join(':')];
    })
  );

  return {
    userId: parsed.u || undefined,
    orgId: parsed.o || undefined,
    checkoutSessionId: parsed.s || undefined,
  };
}

function getPayPalApprovalUrl(subscription: PayPalSubscription): string | null {
  return (
    subscription.links?.find((link) => link.rel === 'approve')?.href ||
    null
  );
}

export function getPayPalOrderCustomId(order: PayPalOrder): string | null {
  return order.purchase_units?.[0]?.custom_id || null;
}

export function getPayPalPrimaryCapture(order: PayPalOrder): PayPalOrderCapture | null {
  return order.purchase_units?.[0]?.payments?.captures?.[0] || null;
}

export function getPayPalVaultTokenFromOrder(order: PayPalOrder): PayPalVaultToken | null {
  return (
    order.payment_source?.card?.attributes?.vault ||
    order.payment_source?.paypal?.attributes?.vault ||
    null
  );
}

export function getPayPalPaymentMethodTypeFromOrder(
  order: PayPalOrder
): PayPalPaymentMethodType | null {
  if (order.payment_source?.card) {
    return 'card';
  }

  if (order.payment_source?.paypal) {
    return 'paypal';
  }

  return null;
}

function buildPayPalLocalPlanId(targetPlan: OrganizationTierId, billingCycle: BillingCycle) {
  return `paypal_local:${targetPlan}:${billingCycle}`;
}

function parsePayPalLocalPlanId(planId?: string | null): {
  targetPlan?: OrganizationTierId;
  billingCycle?: BillingCycle;
} {
  if (!planId || !planId.startsWith('paypal_local:')) {
    return {};
  }

  const [, targetPlan, billingCycle] = planId.split(':');
  return {
    targetPlan: isOrganizationTierId(targetPlan) ? targetPlan : undefined,
    billingCycle:
      billingCycle === 'monthly' || billingCycle === 'annually'
        ? billingCycle
        : undefined,
  };
}

export type RazorpayPayment = {
  id: string;
  entity?: 'payment';
  status?: string;
  amount?: number;
  currency?: string;
  notes?: Record<string, string>;
};

export type RazorpayInvoice = {
  id: string;
  entity?: 'invoice';
  subscription_id?: string | null;
  status?: string;
  notes?: Record<string, string>;
};

export type RazorpayWebhookEvent = {
  entity?: 'event';
  account_id?: string;
  event: string;
  contains?: string[];
  created_at?: number;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
    payment?: { entity?: RazorpayPayment };
    invoice?: { entity?: RazorpayInvoice };
  };
};

function isUsingNewCommercialPlanEnvNames() {
  return Boolean(
    process.env.RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY ||
    process.env.RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY ||
    process.env.RAZORPAY_PLAN_BUSINESS_PREMIUM_MONTHLY ||
    process.env.RAZORPAY_PLAN_BUSINESS_PREMIUM_ANNUALLY
  );
}

function getPlanEnvMap(): BillingPlanIdMap {
  if (
    process.env.RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY ||
    process.env.RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY
  ) {
    return {
      business: {
        monthly: readEnvVar('RAZORPAY_PLAN_BUSINESS_MONTHLY'),
        annually: readEnvVar('RAZORPAY_PLAN_BUSINESS_ANNUALLY'),
      },
      business_plus: {
        monthly: readEnvVar('RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY'),
        annually: readEnvVar('RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY'),
      },
      enterprise: {
        monthly: readEnvVar('RAZORPAY_PLAN_ENTERPRISE_MONTHLY'),
        annually: readEnvVar('RAZORPAY_PLAN_ENTERPRISE_ANNUALLY'),
      },
    };
  }

  if (isUsingNewCommercialPlanEnvNames()) {
    return {
      business: {
        monthly: readEnvVar('RAZORPAY_PLAN_BUSINESS_MONTHLY'),
        annually: readEnvVar('RAZORPAY_PLAN_BUSINESS_ANNUALLY'),
      },
      business_plus: {
        monthly: readEnvVar('RAZORPAY_PLAN_BUSINESS_PREMIUM_MONTHLY'),
        annually: readEnvVar('RAZORPAY_PLAN_BUSINESS_PREMIUM_ANNUALLY'),
      },
      enterprise: {
        monthly: readEnvVar('RAZORPAY_PLAN_ENTERPRISE_MONTHLY'),
        annually: readEnvVar('RAZORPAY_PLAN_ENTERPRISE_ANNUALLY'),
      },
    };
  }

  return {
    business: {
      monthly: readEnvVar('RAZORPAY_PLAN_GROWTH_MONTHLY'),
      annually: readEnvVar('RAZORPAY_PLAN_GROWTH_ANNUALLY'),
    },
    business_plus: {
      monthly: readEnvVar('RAZORPAY_PLAN_BUSINESS_MONTHLY'),
      annually: readEnvVar('RAZORPAY_PLAN_BUSINESS_ANNUALLY'),
    },
    enterprise: {
      monthly: readEnvVar('RAZORPAY_PLAN_ENTERPRISE_MONTHLY'),
      annually: readEnvVar('RAZORPAY_PLAN_ENTERPRISE_ANNUALLY'),
    },
  };
}

function getPayPalPlanEnvMap(): BillingPlanIdMap {
  return {
    business: {
      monthly: readEnvVar('PAYPAL_PLAN_BUSINESS_MONTHLY'),
      annually: readEnvVar('PAYPAL_PLAN_BUSINESS_ANNUALLY'),
    },
    business_plus: {
      monthly: readEnvVar('PAYPAL_PLAN_BUSINESS_PLUS_MONTHLY'),
      annually: readEnvVar('PAYPAL_PLAN_BUSINESS_PLUS_ANNUALLY'),
    },
    enterprise: {
      monthly: readEnvVar('PAYPAL_PLAN_ENTERPRISE_MONTHLY'),
      annually: readEnvVar('PAYPAL_PLAN_ENTERPRISE_ANNUALLY'),
    },
  };
}

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
const DEFAULT_SUBSCRIPTION_EXPIRE_MINUTES = Number(
  process.env.RAZORPAY_SUBSCRIPTION_EXPIRE_MINUTES || 60 * 24
);

function getPayPalEnvironment(): 'sandbox' | 'live' {
  const environment = process.env.PAYPAL_ENVIRONMENT?.trim().toLowerCase();
  if (environment === 'sandbox' || environment === 'live') {
    return environment;
  }

  throw new Error('PAYPAL_ENVIRONMENT must be set to "sandbox" or "live".');
}

function getPayPalApiBase() {
  const explicitBase = process.env.PAYPAL_API_BASE?.trim();
  if (explicitBase) {
    return explicitBase.replace(/\/+$/, '');
  }

  return getPayPalEnvironment() === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured.');
  }

  return { keyId, keySecret };
}

function getRazorpayWebhookSecret(): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured.');
  }
  return secret;
}

function getRazorpayKeySecret(): string {
  return getRazorpayCredentials().keySecret;
}

export function getRazorpayKeyId(): string {
  return getRazorpayCredentials().keyId;
}

function getRazorpayModeLabel() {
  const keyId = getRazorpayKeyId();
  if (keyId.startsWith('rzp_live_')) {
    return 'live';
  }
  if (keyId.startsWith('rzp_test_')) {
    return 'test';
  }
  return 'current';
}

function getPayPalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are not configured.');
  }

  if (clientId === clientSecret) {
    throw new Error(
      'PayPal credentials are invalid: PAYPAL_CLIENT_SECRET must be the secret from your PayPal app, not the same value as PAYPAL_CLIENT_ID.'
    );
  }

  return { clientId, clientSecret };
}

export function getPayPalSdkClientId(): string {
  return getPayPalCredentials().clientId;
}

function getPayPalWebhookId(): string {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    throw new Error('PAYPAL_WEBHOOK_ID is not configured.');
  }
  return webhookId;
}

function toBasicAuthHeader() {
  const { keyId, keySecret } = getRazorpayCredentials();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

function getMissingRazorpayConfig(): string[] {
  const usingNewPlanNames = isUsingNewCommercialPlanEnvNames();

  return [
    !process.env.RAZORPAY_KEY_ID ? 'RAZORPAY_KEY_ID' : null,
    !process.env.RAZORPAY_KEY_SECRET ? 'RAZORPAY_KEY_SECRET' : null,
    !process.env.RAZORPAY_WEBHOOK_SECRET ? 'RAZORPAY_WEBHOOK_SECRET' : null,
    ...(usingNewPlanNames
      ? [
        !process.env.RAZORPAY_PLAN_BUSINESS_MONTHLY ? 'RAZORPAY_PLAN_BUSINESS_MONTHLY' : null,
        !process.env.RAZORPAY_PLAN_BUSINESS_ANNUALLY ? 'RAZORPAY_PLAN_BUSINESS_ANNUALLY' : null,
        ...(
          process.env.RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY ||
            process.env.RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY
            ? [
              !process.env.RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY
                ? 'RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY'
                : null,
              !process.env.RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY
                ? 'RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY'
                : null,
              !process.env.RAZORPAY_PLAN_ENTERPRISE_MONTHLY
                ? 'RAZORPAY_PLAN_ENTERPRISE_MONTHLY'
                : null,
              !process.env.RAZORPAY_PLAN_ENTERPRISE_ANNUALLY
                ? 'RAZORPAY_PLAN_ENTERPRISE_ANNUALLY'
                : null,
            ]
            : [
              !process.env.RAZORPAY_PLAN_BUSINESS_PREMIUM_MONTHLY
                ? 'RAZORPAY_PLAN_BUSINESS_PREMIUM_MONTHLY'
                : null,
              !process.env.RAZORPAY_PLAN_BUSINESS_PREMIUM_ANNUALLY
                ? 'RAZORPAY_PLAN_BUSINESS_PREMIUM_ANNUALLY'
                : null,
              !process.env.RAZORPAY_PLAN_ENTERPRISE_MONTHLY
                ? 'RAZORPAY_PLAN_ENTERPRISE_MONTHLY'
                : null,
              !process.env.RAZORPAY_PLAN_ENTERPRISE_ANNUALLY
                ? 'RAZORPAY_PLAN_ENTERPRISE_ANNUALLY'
                : null,
            ]
        ),
      ]
      : [
        !process.env.RAZORPAY_PLAN_GROWTH_MONTHLY ? 'RAZORPAY_PLAN_GROWTH_MONTHLY' : null,
        !process.env.RAZORPAY_PLAN_GROWTH_ANNUALLY ? 'RAZORPAY_PLAN_GROWTH_ANNUALLY' : null,
        !process.env.RAZORPAY_PLAN_BUSINESS_MONTHLY ? 'RAZORPAY_PLAN_BUSINESS_MONTHLY' : null,
        !process.env.RAZORPAY_PLAN_BUSINESS_ANNUALLY ? 'RAZORPAY_PLAN_BUSINESS_ANNUALLY' : null,
        !process.env.RAZORPAY_PLAN_ENTERPRISE_MONTHLY ? 'RAZORPAY_PLAN_ENTERPRISE_MONTHLY' : null,
        !process.env.RAZORPAY_PLAN_ENTERPRISE_ANNUALLY ? 'RAZORPAY_PLAN_ENTERPRISE_ANNUALLY' : null,
      ]),
  ].filter(Boolean) as string[];
}

function getMissingPayPalConfig(): string[] {
  return [
    !process.env.PAYPAL_ENVIRONMENT ? 'PAYPAL_ENVIRONMENT' : null,
    !process.env.PAYPAL_CLIENT_ID ? 'PAYPAL_CLIENT_ID' : null,
    !process.env.PAYPAL_CLIENT_SECRET ? 'PAYPAL_CLIENT_SECRET' : null,
    !process.env.PAYPAL_WEBHOOK_ID ? 'PAYPAL_WEBHOOK_ID' : null,
  ].filter(Boolean) as string[];
}

export function getBillingProviderForMarket(market: BillingMarket): BillingProvider {
  return market === 'india' ? 'razorpay' : 'paypal';
}

export function getDefaultBillingMarket(country?: string | null): BillingMarket {
  return getDefaultBillingMarketFromCountry(country);
}

export function getBillingConfigForProvider(provider: BillingProvider): BillingConfig {
  if (provider === 'paypal') {
    const missing = getMissingPayPalConfig();

    return {
      provider: 'paypal',
      configured: missing.length === 0,
      missing,
      supportsCheckout: missing.length === 0,
      supportsManagement: missing.length === 0,
      statusMessage:
        missing.length === 0
          ? 'PayPal advanced card checkout, vault sync, and merchant-managed recurring renewals are available.'
          : 'PayPal is selected for billing, but required billing configuration is incomplete.',
    };
  }

  const missing = getMissingRazorpayConfig();

  return {
    provider: 'razorpay',
    configured: missing.length === 0,
    missing,
    supportsCheckout: missing.length === 0,
    supportsManagement: missing.length === 0,
    statusMessage:
      missing.length === 0
        ? 'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app billing management are available.'
        : 'Razorpay is selected for billing, but required billing configuration is incomplete.',
  };
}

export function getBillingConfigForMarket(market: BillingMarket): BillingConfig {
  return getBillingConfigForProvider(getBillingProviderForMarket(market));
}

export function getBillingConfig(provider: BillingProvider = 'razorpay'): BillingConfig {
  return getBillingConfigForProvider(provider);
}

export function getBillingProviderLabel(provider: BillingProvider): string {
  return provider === 'paypal' ? 'PayPal' : 'Razorpay';
}

export function supportsSelfServeBilling(
  tier: OrganizationTierId
): tier is OrganizationTierId {
  return tier === 'business' || tier === 'business_plus' || tier === 'enterprise';
}

export function getRazorpayPlanId(
  targetPlan: OrganizationTierId,
  billingCycle: BillingCycle
): string | null {
  return getPlanEnvMap()[targetPlan][billingCycle] || null;
}

export function getTierFromRazorpayPlanId(
  planId?: string | null
): OrganizationTierId | null {
  if (!planId) return null;

  for (const [tier, billingMap] of Object.entries(getPlanEnvMap()) as Array<
    [OrganizationTierId, Record<BillingCycle, string | undefined>]
  >) {
    if (billingMap.monthly === planId || billingMap.annually === planId) {
      return tier;
    }
  }

  return null;
}

export function getBillingCycleFromRazorpayPlanId(planId?: string | null): BillingCycle | null {
  if (!planId) return null;
  const planEnvMap = getPlanEnvMap();
  for (const billingCycle of ['monthly', 'annually'] as const) {
    if (
      planEnvMap.business[billingCycle] === planId ||
      planEnvMap.business_plus[billingCycle] === planId ||
      planEnvMap.enterprise[billingCycle] === planId
    ) {
      return billingCycle;
    }
  }
  return null;
}

export function getPayPalPlanId(
  targetPlan: OrganizationTierId,
  billingCycle: BillingCycle
): string | null {
  return buildPayPalLocalPlanId(targetPlan, billingCycle);
}

export function getTierFromPayPalPlanId(planId?: string | null): OrganizationTierId | null {
  if (!planId) return null;

  const localPlan = parsePayPalLocalPlanId(planId);
  if (localPlan.targetPlan) {
    return localPlan.targetPlan;
  }

  for (const [tier, billingMap] of Object.entries(getPayPalPlanEnvMap()) as Array<
    [OrganizationTierId, Record<BillingCycle, string | undefined>]
  >) {
    if (billingMap.monthly === planId || billingMap.annually === planId) {
      return tier;
    }
  }

  return null;
}

export function getBillingCycleFromPayPalPlanId(planId?: string | null): BillingCycle | null {
  if (!planId) return null;

  const localPlan = parsePayPalLocalPlanId(planId);
  if (localPlan.billingCycle) {
    return localPlan.billingCycle;
  }

  const planEnvMap = getPayPalPlanEnvMap();
  for (const billingCycle of ['monthly', 'annually'] as const) {
    if (
      planEnvMap.business[billingCycle] === planId ||
      planEnvMap.business_plus[billingCycle] === planId ||
      planEnvMap.enterprise[billingCycle] === planId
    ) {
      return billingCycle;
    }
  }

  return null;
}

function resolveTotalCount(billingCycle: BillingCycle) {
  return billingCycle === 'monthly' ? 1200 : 100;
}

function resolveExpireByTimestamp() {
  const minutes = Number.isFinite(DEFAULT_SUBSCRIPTION_EXPIRE_MINUTES)
    ? DEFAULT_SUBSCRIPTION_EXPIRE_MINUTES
    : 60 * 24;
  return Math.floor(Date.now() / 1000) + Math.max(15, minutes) * 60;
}

function toDate(value?: number | null): Date | null | undefined {
  if (!value) return null;
  return new Date(value * 1000);
}

async function razorpayRequest<T>(
  path: string,
  init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: toBasicAuthHeader(),
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Unknown network failure';
    throw new Error(
      `Unable to reach Razorpay API. Verify test-mode credentials, plan IDs, and outbound network access. (${message})`
    );
  }

  const text = await res.text();
  let payload: Record<string, unknown> | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const errorMessage =
      payload && typeof payload.error === 'object' && payload.error && 'description' in payload.error
        ? String((payload.error as { description?: string }).description || 'Razorpay request failed.')
        : text || `Razorpay request failed with status ${res.status}.`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

async function createPayPalAccessToken(): Promise<string> {
  const { clientId, clientSecret } = getPayPalCredentials();

  let res: Response;
  try {
    res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Unknown network failure';
    throw new Error(
      `Unable to reach PayPal API. Verify credentials, vault settings, and outbound network access. (${message})`
    );
  }

  const payload = (await res.json().catch(() => null)) as
    | { access_token?: string; error_description?: string; error?: string }
    | null;

  if (!res.ok || !payload?.access_token) {
    const authFailureMessage =
      payload?.error_description || payload?.error || 'Unable to authenticate with PayPal.';
    const normalizedAuthFailure = authFailureMessage.toLowerCase();

    if (normalizedAuthFailure.includes('client authentication failed')) {
      throw new Error(
        'PayPal authentication failed. Verify PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for the selected PAYPAL_ENVIRONMENT, and make sure you are not mixing sandbox credentials with live mode or vice versa.'
      );
    }

    throw new Error(
      authFailureMessage
    );
  }

  return payload.access_token;
}

async function paypalRequest<T>(
  path: string,
  init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
): Promise<T> {
  const accessToken = await createPayPalAccessToken();

  let res: Response;
  try {
    res = await fetch(`${getPayPalApiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Unknown network failure';
    throw new Error(
      `Unable to reach PayPal API. Verify credentials, vault settings, and outbound network access. (${message})`
    );
  }

  const text = await res.text();
  let payload: Record<string, unknown> | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const firstDetail = Array.isArray(payload?.details)
      ? (payload?.details as Array<{ description?: string; field?: string; issue?: string }>)[0]
      : null;
    const detailMessage = firstDetail
      ? [firstDetail.field, firstDetail.description || firstDetail.issue]
          .filter(Boolean)
          .join(': ')
      : '';
    const errorMessage =
      detailMessage ||
      (typeof payload?.message === 'string' ? payload.message : null) ||
      text ||
      `PayPal request failed with status ${res.status}.`;
    throw new Error(errorMessage);
  }

  return (payload || {}) as T;
}

function resolvePayPalChargeDetails(args: {
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
}) {
  if (args.billingMarket !== 'international') {
    throw new Error('PayPal card checkout is only available for international billing.');
  }

  const pricingPlan = PRICING_PLANS.find((plan) => plan.id === args.targetPlan);
  if (!pricingPlan) {
    throw new Error(`Unknown pricing plan: ${args.targetPlan}.`);
  }

  const amountValue = getPlanChargeValue(pricingPlan, args.billingCycle, args.billingMarket);
  if (amountValue === null || amountValue <= 0) {
    throw new Error(`PayPal amount is unavailable for ${args.targetPlan} (${args.billingCycle}).`);
  }

  return {
    amount: amountValue.toFixed(2),
    currencyCode: 'USD' as const,
    planLabel: pricingPlan.name,
    description: `${pricingPlan.name} subscription`,
  };
}

function buildPayPalInvoiceId(checkoutSessionId: string) {
  return `sw-${checkoutSessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}-${Date.now().toString(36)}`;
}

function buildPayPalRequestId(prefix: string, identifier: string) {
  const safeIdentifier = identifier.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72);
  return `${prefix}-${safeIdentifier}-${Date.now().toString(36)}`;
}

export function isLegacyPayPalSubscriptionId(subscriptionId?: string | null) {
  return /^I-[A-Z0-9]+$/i.test(String(subscriptionId || ''));
}

async function finalizePayPalOrderCapture(orderId: string): Promise<PayPalOrder> {
  const order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    body: JSON.stringify({}),
  }).catch(async (error) => {
    const message = error instanceof Error ? error.message : 'Unable to capture the PayPal order.';
    const normalized = message.toLowerCase();

    if (
      normalized.includes('order already captured') ||
      normalized.includes('completed state') ||
      normalized.includes('cannot be captured')
    ) {
      return fetchPayPalOrder({ orderId });
    }

    throw error;
  });

  if ((order.status || '').toUpperCase() === 'COMPLETED') {
    return order;
  }

  const captureLink = order.links?.find((link) => link.rel === 'capture')?.href;
  if (!captureLink) {
    return order;
  }

  return paypalRequest<PayPalOrder>(captureLink.replace(getPayPalApiBase(), ''), {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function createBillingCheckoutSession(args: {
  userId: string;
  userEmail: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  orgId?: string | null;
  orgName?: string | null;
}): Promise<{
  sessionId: string;
  checkout: RazorpayCheckoutSession;
  subscription: RazorpaySubscription;
}> {
  const planId = getRazorpayPlanId(args.targetPlan, args.billingCycle);
  if (!planId) {
    throw new Error(`Razorpay plan ID is missing for ${args.targetPlan} (${args.billingCycle}).`);
  }

  const subscription = await razorpayRequest<RazorpaySubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: planId,
      total_count: resolveTotalCount(args.billingCycle),
      quantity: 1,
      customer_notify: true,
      expire_by: resolveExpireByTimestamp(),
      notes: {
        userId: args.userId,
        targetPlan: args.targetPlan,
        billingCycle: args.billingCycle,
        orgId: args.orgId || '',
        orgName: args.orgName || '',
      },
    }),
  }).catch((error) => {
    const message =
      error instanceof Error ? error.message : 'Unable to create the Razorpay subscription.';
    if (message.includes('Requested resource ID was not found')) {
      throw new Error(
        `Razorpay could not find plan ${planId} for ${args.targetPlan} (${args.billingCycle}) using ${getRazorpayModeLabel()} credentials. This usually means the app is sending a different billing cycle than expected, the server has not been restarted after .env changes, or the plan belongs to a different Razorpay mode/account.`
      );
    }

    throw error;
  });

  return {
    sessionId: subscription.id,
    checkout: buildRazorpayCheckoutSession({
      subscriptionId: subscription.id,
      userId: args.userId,
      userEmail: args.userEmail,
      targetPlan: args.targetPlan,
      billingCycle: args.billingCycle,
      orgId: args.orgId,
      orgName: args.orgName,
    }),
    subscription,
  };
}

export async function createPayPalBillingCheckoutSession(args: {
  baseUrl: string;
  userId: string;
  userEmail: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  orgId?: string | null;
  checkoutSessionId?: string | null;
}): Promise<{
  sessionId: string;
  checkout: PayPalCheckoutSession;
}> {
  const { amount, currencyCode, description, planLabel } = resolvePayPalChargeDetails({
    targetPlan: args.targetPlan,
    billingCycle: args.billingCycle,
    billingMarket: args.billingMarket,
  });
  const checkoutSessionId =
    args.checkoutSessionId?.trim() || `ppchk_${randomUUID().replace(/-/g, '')}`;

  return {
    sessionId: checkoutSessionId,
    checkout: {
      provider: 'paypal',
      flow: 'card_fields',
      checkoutSessionId,
      customerEmail: args.userEmail,
      targetPlan: args.targetPlan,
      billingCycle: args.billingCycle,
      billingMarket: args.billingMarket,
      amount,
      currencyCode,
      sdkClientId: getPayPalSdkClientId(),
      description,
      planLabel,
      organizationId: args.orgId || null,
    },
  };
}

export async function createPayPalCardCheckoutOrder(args: {
  checkoutSessionId: string;
  userId: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  orgId?: string | null;
  customerId?: string | null;
  paymentMethod?: PayPalPaymentMethodType;
  baseUrl?: string | null;
}): Promise<PayPalOrder> {
  const charge = resolvePayPalChargeDetails(args);
  const paymentMethod = args.paymentMethod || 'card';
  const customerAttributes = args.customerId
    ? {
        customer: {
          id: args.customerId,
          merchant_customer_id: buildPayPalMerchantCustomerId({
            userId: args.userId,
            orgId: args.orgId,
            checkoutSessionId: args.checkoutSessionId,
          }),
        },
      }
    : {
        customer: {
          merchant_customer_id: buildPayPalMerchantCustomerId({
            userId: args.userId,
            orgId: args.orgId,
            checkoutSessionId: args.checkoutSessionId,
          }),
        },
      };

  return paypalRequest<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'PayPal-Request-Id': buildPayPalRequestId('pp-card-order', args.checkoutSessionId),
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: buildPayPalCustomId({
            userId: args.userId,
            targetPlan: args.targetPlan,
            billingCycle: args.billingCycle,
            billingMarket: args.billingMarket,
            orgId: args.orgId,
            checkoutSessionId: args.checkoutSessionId,
          }),
          invoice_id: buildPayPalInvoiceId(args.checkoutSessionId),
          description: charge.description,
          amount: {
            currency_code: charge.currencyCode,
            value: charge.amount,
          },
        },
      ],
      payment_source:
        paymentMethod === 'paypal'
          ? {
              paypal: {
                attributes: {
                  ...customerAttributes,
                  vault: {
                    store_in_vault: 'ON_SUCCESS',
                    usage_type: 'MERCHANT',
                    usage_pattern: 'SUBSCRIPTION_PREPAID',
                  },
                },
                experience_context: {
                  return_url: `${(args.baseUrl || 'http://localhost:3000').replace(/\/$/, '')}/dashboard/account/subscription?paypal_checkout=approved`,
                  cancel_url: `${(args.baseUrl || 'http://localhost:3000').replace(/\/$/, '')}/dashboard/account/subscription?paypal_checkout=cancelled`,
                  payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
                  brand_name: 'SignWorkflow',
                  locale: 'en-US',
                  landing_page: 'NO_PREFERENCE',
                  user_action: 'PAY_NOW',
                },
              },
            }
          : {
              card: {
                attributes: {
                  ...customerAttributes,
                  verification: {
                    method: 'SCA_WHEN_REQUIRED',
                  },
                  vault: {
                    store_in_vault: 'ON_SUCCESS',
                  },
                },
                stored_credential: {
                  payment_initiator: 'CUSTOMER',
                  payment_type: 'RECURRING',
                  usage: 'FIRST',
                  usage_pattern: 'SUBSCRIPTION_PREPAID',
                },
              },
            },
    }),
  });
}

export async function capturePayPalOrder(args: {
  orderId: string;
}): Promise<PayPalOrder> {
  return finalizePayPalOrderCapture(args.orderId);
}

export async function createPayPalRecurringOrder(args: {
  checkoutSessionId: string;
  vaultId: string;
  userId: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  orgId?: string | null;
  paymentMethodType?: PayPalPaymentMethodType | null;
}): Promise<PayPalOrder> {
  const charge = resolvePayPalChargeDetails(args);
  const paymentMethodType = args.paymentMethodType || 'card';

  const order = await paypalRequest<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'PayPal-Request-Id': buildPayPalRequestId('pp-renewal-order', args.checkoutSessionId),
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: buildPayPalCustomId({
            userId: args.userId,
            targetPlan: args.targetPlan,
            billingCycle: args.billingCycle,
            billingMarket: args.billingMarket,
            orgId: args.orgId,
            checkoutSessionId: args.checkoutSessionId,
          }),
          invoice_id: buildPayPalInvoiceId(args.checkoutSessionId),
          description: charge.description,
          amount: {
            currency_code: charge.currencyCode,
            value: charge.amount,
          },
        },
      ],
      payment_source: {
        ...(paymentMethodType === 'paypal'
          ? {
              paypal: {
                vault_id: args.vaultId,
                stored_credential: {
                  payment_initiator: 'MERCHANT',
                  payment_type: 'RECURRING',
                  usage: 'SUBSEQUENT',
                  usage_pattern: 'SUBSCRIPTION_PREPAID',
                },
              },
            }
          : {
              card: {
                vault_id: args.vaultId,
                stored_credential: {
                  payment_initiator: 'MERCHANT',
                  payment_type: 'RECURRING',
                  usage: 'SUBSEQUENT',
                  usage_pattern: 'SUBSCRIPTION_PREPAID',
                },
              },
            }),
      },
    }),
  });

  if ((order.status || '').toUpperCase() === 'COMPLETED') {
    return order;
  }

  return finalizePayPalOrderCapture(order.id);
}

export async function updateBillingSubscriptionPlan(args: {
  subscriptionId: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
}): Promise<RazorpaySubscription> {
  const planId = getRazorpayPlanId(args.targetPlan, args.billingCycle);
  if (!planId) {
    throw new Error(`Razorpay plan ID is missing for ${args.targetPlan} (${args.billingCycle}).`);
  }

  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${args.subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      plan_id: planId,
      schedule_change_at: 'now',
      quantity: 1,
      customer_notify: true,
    }),
  }).catch(async (error) => {
    const message =
      error instanceof Error ? error.message : 'Unable to update the Razorpay subscription.';

    if (message.includes('Requested resource ID was not found')) {
      throw new Error(
        `Razorpay could not find plan ${planId} for ${args.targetPlan} (${args.billingCycle}) using ${getRazorpayModeLabel()} credentials. This usually means the app is sending a different billing cycle than expected, the server has not been restarted after .env changes, or the plan belongs to a different Razorpay mode/account.`
      );
    }

    if (message.includes('card mandate')) {
      console.log('[updateBillingSubscriptionPlan] Card mandate detected, retrying with cycle_end scheduling...');
      return razorpayRequest<RazorpaySubscription>(`/subscriptions/${args.subscriptionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan_id: planId,
          schedule_change_at: 'cycle_end',
          quantity: 1,
          customer_notify: true,
        }),
      });
    }

    if (message.includes('domestic card') && message.includes('Only offers')) {
      throw new Error(
        `Plan upgrades for subscriptions with domestic card payments require cancelling the current subscription and creating a new one. Please cancel your current subscription first, then choose your new plan.`
      );
    }

    throw error;
  });
}

export async function pauseBillingSubscription(args: {
  subscriptionId: string;
}): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${args.subscriptionId}/pause`, {
    method: 'POST',
    body: JSON.stringify({ pause_at: 'now' }),
  });
}

export async function resumeBillingSubscription(args: {
  subscriptionId: string;
}): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${args.subscriptionId}/resume`, {
    method: 'POST',
    body: JSON.stringify({ resume_at: 'now' }),
  });
}

export async function cancelBillingSubscription(args: {
  subscriptionId: string;
  atCycleEnd?: boolean;
}): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${args.subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancel_at_cycle_end: Boolean(args.atCycleEnd) }),
  });
}

export async function fetchBillingSubscription(args: {
  subscriptionId: string;
}): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${args.subscriptionId}`, {
    method: 'GET',
  });
}

export async function fetchPayPalSubscription(args: {
  subscriptionId: string;
}): Promise<PayPalSubscription> {
  return paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${args.subscriptionId}`, {
    method: 'GET',
  });
}

export async function fetchPayPalOrder(args: {
  orderId: string;
}): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${args.orderId}`, {
    method: 'GET',
  });
}

export async function activatePayPalSubscription(args: {
  subscriptionId: string;
}): Promise<void> {
  await paypalRequest<Record<string, never>>(
    `/v1/billing/subscriptions/${args.subscriptionId}/activate`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Reactivating subscription from SignWorkflow account settings.',
      }),
    }
  );
}

export async function cancelPayPalSubscription(args: {
  subscriptionId: string;
}): Promise<void> {
  await paypalRequest<Record<string, never>>(
    `/v1/billing/subscriptions/${args.subscriptionId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Cancelling subscription from SignWorkflow account settings.',
      }),
    }
  );
}

export async function deletePayPalVaultToken(args: {
  vaultId: string;
}): Promise<void> {
  await paypalRequest<Record<string, never>>(`/v3/vault/payment-tokens/${args.vaultId}`, {
    method: 'DELETE',
  });
}

export function verifyRazorpayWebhookEvent(
  rawBody: string,
  signatureHeader: string | null
): RazorpayWebhookEvent {
  if (!signatureHeader) {
    throw new Error('Missing X-Razorpay-Signature header.');
  }

  const expected = createHmac('sha256', getRazorpayWebhookSecret()).update(rawBody).digest('hex');
  const received = signatureHeader.trim();

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error('Razorpay webhook signature verification failed.');
  }

  return JSON.parse(rawBody) as RazorpayWebhookEvent;
}

export async function verifyPayPalWebhookEvent(args: {
  rawBody: string;
  headers: PayPalWebhookVerificationHeaders;
}): Promise<PayPalWebhookEvent> {
  const event = JSON.parse(args.rawBody) as PayPalWebhookEvent;
  const verification = await paypalRequest<{ verification_status?: string }>(
    '/v1/notifications/verify-webhook-signature',
    {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: args.headers.authAlgo,
        cert_url: args.headers.certUrl,
        transmission_id: args.headers.transmissionId,
        transmission_sig: args.headers.transmissionSig,
        transmission_time: args.headers.transmissionTime,
        webhook_id: getPayPalWebhookId(),
        webhook_event: event,
      }),
    }
  );

  if (verification.verification_status !== 'SUCCESS') {
    throw new Error('PayPal webhook signature verification failed.');
  }

  return event;
}

export function verifyRazorpayCheckoutSignature(
  payload: RazorpayCheckoutSuccessPayload
): RazorpayCheckoutSuccessPayload {
  const received = payload.razorpay_signature.trim();
  const expected = createHmac('sha256', getRazorpayKeySecret())
    .update(`${payload.razorpay_payment_id}|${payload.razorpay_subscription_id}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error('Razorpay checkout signature verification failed.');
  }

  return payload;
}

export function resolveWebhookEventId(args: {
  event: RazorpayWebhookEvent;
  headerEventId?: string | null;
}): string {
  if (args.headerEventId?.trim()) {
    return args.headerEventId.trim();
  }

  const subscriptionId = args.event.payload?.subscription?.entity?.id || '';
  const paymentId = args.event.payload?.payment?.entity?.id || '';
  const invoiceId = args.event.payload?.invoice?.entity?.id || '';
  return [
    args.event.event || 'unknown',
    subscriptionId,
    paymentId,
    invoiceId,
    String(args.event.created_at || ''),
  ].join(':');
}

export function resolvePayPalWebhookEventId(event: PayPalWebhookEvent): string {
  return event.id || [
    event.event_type || 'unknown',
    String(event.resource?.id || event.resource?.billing_agreement_id || ''),
    String(event.create_time || ''),
  ].join(':');
}

export function mapRazorpaySubscriptionStatusToOrganizationStatus(
  subscriptionStatus?: string | null
): OrganizationStatus | null {
  switch ((subscriptionStatus || '').toLowerCase()) {
    case 'pending':
    case 'halted':
      return 'past_due';
    case 'paused':
    case 'cancelled':
    case 'completed':
    case 'expired':
      return 'suspended';
    case 'created':
    case 'authenticated':
      return null;
    case 'active':
      return 'active';
    default:
      return null;
  }
}

export function shouldApplyPlanFromSubscriptionStatus(subscriptionStatus?: string | null): boolean {
  switch ((subscriptionStatus || '').toLowerCase()) {
    case 'authenticated':
    case 'active':
    case 'pending':
    case 'halted':
    case 'paused':
      return true;
    default:
      return false;
  }
}

export function canProvisionOrgFromSubscriptionStatus(subscriptionStatus?: string | null): boolean {
  switch ((subscriptionStatus || '').toLowerCase()) {
    case 'authenticated':
    case 'active':
    case 'pending':
    case 'halted':
    case 'paused':
      return true;
    default:
      return false;
  }
}

export function mapPayPalSubscriptionStatusToOrganizationStatus(
  subscriptionStatus?: string | null
): OrganizationStatus | null {
  switch ((subscriptionStatus || '').toUpperCase()) {
    case 'SUSPENDED':
      return 'past_due';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'suspended';
    case 'ACTIVE':
      return 'active';
    default:
      return null;
  }
}

export function shouldApplyPlanFromPayPalStatus(subscriptionStatus?: string | null): boolean {
  switch ((subscriptionStatus || '').toUpperCase()) {
    case 'ACTIVE':
    case 'SUSPENDED':
      return true;
    default:
      return false;
  }
}

export function canProvisionOrgFromPayPalStatus(subscriptionStatus?: string | null): boolean {
  switch ((subscriptionStatus || '').toUpperCase()) {
    case 'ACTIVE':
    case 'SUSPENDED':
      return true;
    default:
      return false;
  }
}

export function extractBillingStateFromRazorpaySubscription(
  subscription: RazorpaySubscription,
  webhookEventId?: string | null
): OrganizationBillingState {
  const status = (subscription.status || '').toLowerCase();

  return {
    provider: 'razorpay',
    customerId: subscription.customer_id || undefined,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status || undefined,
    targetPlan: isOrganizationTierId(subscription.notes?.targetPlan)
      ? subscription.notes?.targetPlan
      : undefined,
    planId: subscription.plan_id || undefined,
    billingCycle: getBillingCycleFromRazorpayPlanId(subscription.plan_id) || undefined,
    currentPeriodStart: toDate(subscription.current_start),
    currentPeriodEnd: toDate(subscription.current_end || subscription.charge_at),
    cancelAtPeriodEnd:
      status === 'cancelled' || status === 'completed' || status === 'expired' ? false : undefined,
    hasScheduledChange:
      typeof subscription.has_scheduled_changes === 'boolean'
        ? subscription.has_scheduled_changes
        : undefined,
    lastCheckoutReference: subscription.id,
    lastWebhookEventId: webhookEventId || undefined,
    updatedAt: new Date(),
  };
}

function toIsoDate(value?: string | null): Date | null | undefined {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function extractBillingStateFromPayPalSubscription(
  subscription: PayPalSubscription,
  webhookEventId?: string | null
): OrganizationBillingState {
  return {
    provider: 'paypal',
    market: 'international',
    customerId: subscription.subscriber?.payer_id || undefined,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status || undefined,
    targetPlan: getTierFromPayPalPlanId(subscription.plan_id) || parsePayPalCustomId(subscription.custom_id).targetPlan,
    planId: subscription.plan_id || undefined,
    billingCycle:
      getBillingCycleFromPayPalPlanId(subscription.plan_id) ||
      parsePayPalCustomId(subscription.custom_id).billingCycle ||
      undefined,
    currencyCode:
      subscription.billing_info?.last_payment?.amount?.currency_code || 'USD',
    currentPeriodStart:
      toIsoDate(subscription.billing_info?.last_payment?.time) ||
      toIsoDate(subscription.start_time) ||
      toIsoDate(subscription.create_time) ||
      undefined,
    currentPeriodEnd: toIsoDate(subscription.billing_info?.next_billing_time),
    cancelAtPeriodEnd: false,
    hasScheduledChange: false,
    lastCheckoutReference: getPayPalApprovalUrl(subscription) || subscription.id,
    lastWebhookEventId: webhookEventId || undefined,
    updatedAt: new Date(),
  };
}

export function extractBillingStateFromPayPalOrder(
  order: PayPalOrder,
  args: {
    subscriptionId: string;
    subscriptionStatus: PayPalSubscriptionStatus | string;
    targetPlan: OrganizationTierId;
    billingCycle: BillingCycle;
    billingMarket: BillingMarket;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    webhookEventId?: string | null;
  }
): OrganizationBillingState {
  const capture = getPayPalPrimaryCapture(order);
  const vault = getPayPalVaultTokenFromOrder(order);

  return {
    provider: 'paypal',
    market: args.billingMarket,
    customerId: vault?.customer?.id || undefined,
    subscriptionId: args.subscriptionId,
    subscriptionStatus: args.subscriptionStatus,
    targetPlan: args.targetPlan,
    planId: buildPayPalLocalPlanId(args.targetPlan, args.billingCycle),
    billingCycle: args.billingCycle,
    currencyCode: capture?.amount?.currency_code || 'USD',
    vaultId: vault?.id || undefined,
    vaultStatus: vault?.status || undefined,
    paymentMethodType: getPayPalPaymentMethodTypeFromOrder(order) || undefined,
    paymentMethodBrand: order.payment_source?.card?.brand || undefined,
    paymentMethodLast4: order.payment_source?.card?.last_digits || undefined,
    currentPeriodStart:
      args.currentPeriodStart ||
      toIsoDate(capture?.create_time) ||
      toIsoDate(order.update_time) ||
      toIsoDate(order.create_time) ||
      new Date(),
    currentPeriodEnd: args.currentPeriodEnd || undefined,
    cancelAtPeriodEnd: false,
    hasScheduledChange: false,
    lastCheckoutReference: order.id,
    lastPaymentId: capture?.id || undefined,
    lastWebhookEventId: args.webhookEventId || undefined,
    updatedAt: new Date(),
  };
}

export function resolvePayPalSubscriptionIdFromWebhookEvent(
  event: PayPalWebhookEvent
): string | null {
  const resource = event.resource || {};
  const directId = typeof resource.id === 'string' ? resource.id : null;
  if (directId && /^I-[A-Z0-9]+$/i.test(directId)) {
    return directId;
  }

  const billingAgreementId =
    typeof resource.billing_agreement_id === 'string'
      ? resource.billing_agreement_id
      : null;
  if (billingAgreementId) {
    return billingAgreementId;
  }

  const relatedSubscriptionId =
    typeof (resource.supplementary_data as { related_ids?: { subscription_id?: string } } | undefined)
      ?.related_ids?.subscription_id === 'string'
      ? (resource.supplementary_data as { related_ids?: { subscription_id?: string } }).related_ids
          ?.subscription_id || null
      : null;

  return relatedSubscriptionId;
}
