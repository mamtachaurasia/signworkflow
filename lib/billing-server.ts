import mongoose from 'mongoose';

import { writeAuditEvent } from '@/lib/audit';
import {
  activatePayPalSubscription,
  buildRazorpayCheckoutSession,
  canProvisionOrgFromPayPalStatus,
  canProvisionOrgFromSubscriptionStatus,
  capturePayPalOrder,
  cancelPayPalSubscription,
  cancelBillingSubscription,
  createBillingCheckoutSession,
  createPayPalCardCheckoutOrder,
  createPayPalBillingCheckoutSession,
  createPayPalRecurringOrder,
  deletePayPalVaultToken,
  extractBillingStateFromPayPalOrder,
  extractBillingStateFromPayPalSubscription,
  extractBillingStateFromRazorpaySubscription,
  fetchPayPalSubscription,
  fetchBillingSubscription,
  getBillingCycleFromPayPalPlanId,
  getBillingCycleFromRazorpayPlanId,
  getBillingProviderForMarket,
  getPayPalPlanId,
  getPayPalOrderCustomId,
  getPayPalPrimaryCapture,
  getTierFromPayPalPlanId,
  getTierFromRazorpayPlanId,
  getPayPalVaultTokenFromOrder,
  isLegacyPayPalSubscriptionId,
  mapPayPalSubscriptionStatusToOrganizationStatus,
  mapRazorpaySubscriptionStatusToOrganizationStatus,
  parsePayPalCustomId,
  parsePayPalMerchantCustomerId,
  pauseBillingSubscription,
  resolvePayPalSubscriptionIdFromWebhookEvent,
  resolvePayPalWebhookEventId,
  resolveWebhookEventId,
  resumeBillingSubscription,
  shouldApplyPlanFromPayPalStatus,
  shouldApplyPlanFromSubscriptionStatus,
  supportsSelfServeBilling,
  updateBillingSubscriptionPlan,
  type BillingCheckoutSession,
  type BillingCheckoutSuccessPayload,
  verifyRazorpayCheckoutSignature,
  type BillingActionTiming,
  type BillingCycle,
  type BillingMarket,
  type BillingManagementAction,
  type BillingProvider,
  type PayPalOrder,
  type PayPalSubscription,
  type PayPalWebhookEvent,
  type RazorpaySubscription,
  type RazorpayWebhookEvent,
} from '@/lib/billing';
import { getDashboardAccountPath } from '@/lib/account-routing';
import { sendSubscriptionPlanChangedEmail } from '@/lib/email';
import { createOrganizationWorkspaceForUser, getActiveOrgContextForUser } from '@/lib/orgs';
import {
  getDefaultSeatLimitForTier,
  getOrganizationPlanLabel,
  getOrganizationTier,
  type OrganizationTierId,
} from '@/lib/subscription-plans';
import BillingWebhookEventModel from '@/models/BillingWebhookEvent';
import OrganizationModel from '@/models/Organization';
import Users from '@/models/Users';
import connectDB from '@/utils/db';

type OrgBillingProjection = {
  _id: mongoose.Types.ObjectId;
  name: string;
  ownerUserId: mongoose.Types.ObjectId;
  plan: string;
  status: string;
  billing?: {
    provider?: BillingProvider;
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
    paymentMethodType?: 'paypal' | 'card';
    paymentMethodBrand?: string;
    paymentMethodLast4?: string;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    lastCheckoutReference?: string;
  };
};

function isOrganizationTierId(value: string | null | undefined): value is OrganizationTierId {
  return value === 'business' || value === 'business_plus' || value === 'enterprise';
}

function toTierFromNotes(value: string | null | undefined): OrganizationTierId | null {
  return isOrganizationTierId(value || null) ? (value as OrganizationTierId) : null;
}

function resolveRazorpayWebhookTargetPlan(args: {
  notes?: Record<string, string>;
  planId?: string | null;
}): OrganizationTierId | null {
  return toTierFromNotes(args.notes?.targetPlan) || getTierFromRazorpayPlanId(args.planId) || null;
}

function resolvePayPalWebhookTargetPlan(args: {
  customId?: string | null;
  planId?: string | null;
}): OrganizationTierId | null {
  return parsePayPalCustomId(args.customId).targetPlan || getTierFromPayPalPlanId(args.planId) || null;
}

function buildBillingUpdateFields(prefix: string, values: Record<string, unknown>) {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  for (const [key, value] of Object.entries(values)) {
    const path = `${prefix}.${key}`;
    if (value === undefined) {
      $unset[path] = 1;
      continue;
    }

    $set[path] = value;
  }

  return { $set, $unset };
}

function inferBillingProvider(billing?: OrgBillingProjection['billing'] | null): BillingProvider | null {
  if (billing?.provider) {
    return billing.provider;
  }

  const subscriptionId = billing?.subscriptionId || '';
  if (!subscriptionId) {
    return null;
  }

  if (isLegacyPayPalSubscriptionId(subscriptionId) || subscriptionId.startsWith('ppchk_')) {
    return 'paypal';
  }

  return 'razorpay';
}

function canUpdateExistingSubscription(status?: string | null) {
  const normalized = (status || '').toLowerCase();
  return normalized === 'active';
}

function canUpdateExistingPayPalSubscription(status?: string | null) {
  const normalized = (status || '').toUpperCase();
  return normalized === 'ACTIVE' || normalized === 'SUSPENDED';
}

function toBillingCycle(value?: string | null): BillingCycle | null {
  return value === 'monthly' || value === 'annually' ? value : null;
}

function addBillingPeriod(startDate: Date, billingCycle: BillingCycle) {
  const next = new Date(startDate);
  if (billingCycle === 'monthly') {
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  next.setFullYear(next.getFullYear() + 1);
  return next;
}

function resolvePayPalPeriodWindow(args: {
  billingCycle: BillingCycle;
  anchorDate?: Date | null;
  previousPeriodEnd?: Date | null;
}) {
  const currentPeriodStart =
    args.previousPeriodEnd && args.previousPeriodEnd.getTime() > 0
      ? new Date(args.previousPeriodEnd)
      : args.anchorDate && !Number.isNaN(args.anchorDate.getTime())
        ? new Date(args.anchorDate)
        : new Date();

  return {
    currentPeriodStart,
    currentPeriodEnd: addBillingPeriod(currentPeriodStart, args.billingCycle),
  };
}

function isLegacyPayPalBillingRecord(billing?: OrgBillingProjection['billing'] | null) {
  return Boolean(isLegacyPayPalSubscriptionId(billing?.subscriptionId));
}

function isPayPalResourceNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('Requested resource ID was not found') ||
    message.includes('RESOURCE_NOT_FOUND')
  );
}

function isStaleRazorpayPendingCheckoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return (
    message.includes('Subscription is not cancellable in cancelled status') ||
    message.includes('Subscription is not cancellable in completed status') ||
    message.includes('Subscription is not cancellable in expired status') ||
    message.includes('Requested resource ID was not found')
  );
}

async function clearStaleLegacyPayPalPendingCheckout(args: {
  org: OrgBillingProjection;
  billing?: OrgBillingProjection['billing'] | null;
}) {
  await persistOrganizationBillingSnapshot({
    org: args.org,
    provider: 'paypal',
    targetPlan: null,
    nextStatus: null,
    billingState: {
      market: args.billing?.market || 'international',
      customerId: undefined,
      subscriptionId: undefined,
      subscriptionStatus: undefined,
      targetPlan: undefined,
      planId: undefined,
      billingCycle: undefined,
      currencyCode: undefined,
      vaultId: undefined,
      vaultStatus: undefined,
      paymentMethodType: undefined,
      paymentMethodBrand: undefined,
      paymentMethodLast4: undefined,
      currentPeriodStart: undefined,
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
      hasScheduledChange: false,
      lastCheckoutReference: undefined,
      lastPaymentId: undefined,
      lastWebhookEventId: undefined,
    },
  });
}

async function clearPendingPayPalCheckout(args: {
  org: OrgBillingProjection;
  billing?: OrgBillingProjection['billing'] | null;
}) {
  await clearStaleLegacyPayPalPendingCheckout(args);
}

async function clearStaleRazorpayPendingCheckout(args: {
  org: OrgBillingProjection;
  billing?: OrgBillingProjection['billing'] | null;
}) {
  await persistOrganizationBillingSnapshot({
    org: args.org,
    provider: 'razorpay',
    targetPlan: null,
    nextStatus: null,
    billingState: {
      market: args.billing?.market || 'india',
      customerId: undefined,
      subscriptionId: undefined,
      subscriptionStatus: undefined,
      targetPlan: undefined,
      planId: undefined,
      billingCycle: undefined,
      currencyCode: undefined,
      vaultId: undefined,
      vaultStatus: undefined,
      paymentMethodType: undefined,
      paymentMethodBrand: undefined,
      paymentMethodLast4: undefined,
      currentPeriodStart: undefined,
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
      hasScheduledChange: false,
      lastCheckoutReference: undefined,
      lastPaymentId: undefined,
      lastWebhookEventId: undefined,
    },
  });
}

function isPendingPayPalCheckoutStatus(status?: string | null) {
  return (status || '').toUpperCase() === 'APPROVAL_PENDING';
}

function isPendingRazorpayCheckoutStatus(status?: string | null) {
  const normalized = (status || '').toLowerCase();
  return (
    normalized === 'created' ||
    normalized === 'authenticated' ||
    normalized === 'pending' ||
    normalized === 'halted'
  );
}

function matchesCommercialTarget(args: {
  provider?: BillingProvider | null;
  market?: BillingMarket | null;
  targetPlan?: OrganizationTierId | null;
  billingCycle?: BillingCycle | null;
  expectedProvider: BillingProvider;
  expectedMarket: BillingMarket;
  expectedTargetPlan: OrganizationTierId;
  expectedBillingCycle: BillingCycle;
}) {
  return (
    args.provider === args.expectedProvider &&
    args.market === args.expectedMarket &&
    args.targetPlan === args.expectedTargetPlan &&
    args.billingCycle === args.expectedBillingCycle
  );
}

function isTerminalSubscriptionStatus(status?: string | null) {
  const normalized = (status || '').toLowerCase();
  return normalized === 'cancelled' || normalized === 'completed' || normalized === 'expired';
}

function isTerminalPayPalSubscriptionStatus(status?: string | null) {
  const normalized = (status || '').toUpperCase();
  return normalized === 'CANCELLED' || normalized === 'EXPIRED';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CHECKOUT_SYNC_RETRY_ATTEMPTS = Math.max(
  0,
  Number(process.env.RAZORPAY_CHECKOUT_SYNC_RETRY_ATTEMPTS || 4)
);
const IS_TEST_RUNTIME =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST_WORKER_ID !== undefined;
const CHECKOUT_SYNC_RETRY_DELAY_MS =
  IS_TEST_RUNTIME
    ? 0
    : Math.max(0, Number(process.env.RAZORPAY_CHECKOUT_SYNC_RETRY_DELAY_MS || 500));

async function getOrgById(orgId?: string | null): Promise<OrgBillingProjection | null> {
  if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
    return null;
  }

  return OrganizationModel.findById(orgId)
    .select('name ownerUserId plan status billing')
    .lean<OrgBillingProjection | null>();
}

async function getOrgByBillingIdentity(args: {
  customerId?: string | null;
  subscriptionId?: string | null;
  vaultId?: string | null;
}): Promise<OrgBillingProjection | null> {
  if (args.subscriptionId) {
    const bySubscription = await OrganizationModel.findOne({
      'billing.subscriptionId': args.subscriptionId,
    })
      .select('name ownerUserId plan status billing')
      .lean<OrgBillingProjection | null>();
    if (bySubscription) {
      return bySubscription;
    }
  }

  if (args.vaultId) {
    const byVault = await OrganizationModel.findOne({
      'billing.vaultId': args.vaultId,
    })
      .select('name ownerUserId plan status billing')
      .lean<OrgBillingProjection | null>();
    if (byVault) {
      return byVault;
    }
  }

  if (!args.customerId) {
    return null;
  }

  return OrganizationModel.findOne({
    'billing.customerId': args.customerId,
  })
    .select('name ownerUserId plan status billing')
    .lean<OrgBillingProjection | null>();
}

async function ensureOrgForWebhook(args: {
  userId?: string | null;
  orgId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  vaultId?: string | null;
  targetPlan?: OrganizationTierId | null;
  canCreateIfMissing?: boolean;
}): Promise<OrgBillingProjection | null> {
  const directOrg = await getOrgById(args.orgId);
  if (directOrg) return directOrg;

  const billingOrg = await getOrgByBillingIdentity({
    customerId: args.customerId,
    subscriptionId: args.subscriptionId,
    vaultId: args.vaultId,
  });
  if (billingOrg) return billingOrg;

  if (!args.userId) return null;

  const activeOrgContext = await getActiveOrgContextForUser(args.userId);
  if (activeOrgContext?.orgId) {
    const activeOrg = await getOrgById(String(activeOrgContext.orgId));
    if (activeOrg) return activeOrg;
  }

  if (!args.canCreateIfMissing || !args.targetPlan || !supportsSelfServeBilling(args.targetPlan)) {
    return null;
  }

  const created = await createOrganizationWorkspaceForUser(args.userId, args.targetPlan);
  return getOrgById(String(created.orgId));
}

async function persistOrganizationBillingSnapshot(args: {
  org: OrgBillingProjection;
  provider: BillingProvider;
  billingState: Record<string, unknown>;
  targetPlan?: OrganizationTierId | null;
  nextStatus?: string | null;
  webhookEventId?: string | null;
}): Promise<void> {
  const billingUpdateFields = buildBillingUpdateFields('billing', {
    provider: args.provider,
    ...args.billingState,
    ...(args.webhookEventId ? { lastWebhookEventId: args.webhookEventId } : {}),
    updatedAt: new Date(),
  });
  const $set: Record<string, unknown> = {
    ...billingUpdateFields.$set,
  };
  const $unset = billingUpdateFields.$unset;
  const subscriptionStatus =
    typeof args.billingState.subscriptionStatus === 'string'
      ? args.billingState.subscriptionStatus
      : null;
  const shouldApplyTargetPlan =
    Boolean(args.targetPlan) &&
    (args.provider === 'paypal'
      ? shouldApplyPlanFromPayPalStatus(subscriptionStatus)
      : shouldApplyPlanFromSubscriptionStatus(subscriptionStatus));

  if (shouldApplyTargetPlan && args.targetPlan) {
    $set.plan = args.targetPlan;
    $set.seatLimit = getDefaultSeatLimitForTier(args.targetPlan);
  }

  if (args.nextStatus) {
    $set.status = args.nextStatus;
  }

  const update: Record<string, Record<string, unknown>> = { $set };
  if (Object.keys($unset).length > 0) {
    update.$unset = $unset;
  }

  await OrganizationModel.updateOne({ _id: args.org._id }, update).exec();
}

async function sendPlanChangeEmailIfNeeded(args: {
  email?: string | null;
  recipientName?: string | null;
  workspaceName?: string | null;
  targetPlan?: OrganizationTierId | null;
  billingCycle?: BillingCycle | null;
  subscriptionStatus?: string | null;
  provider?: BillingProvider;
}) {
  const shouldSend =
    args.provider === 'paypal'
      ? shouldApplyPlanFromPayPalStatus(args.subscriptionStatus)
      : shouldApplyPlanFromSubscriptionStatus(args.subscriptionStatus);

  if (!args.email || !args.targetPlan || !shouldSend) {
    return;
  }

  try {
    await sendSubscriptionPlanChangedEmail({
      email: args.email,
      recipientName: args.recipientName,
      workspaceName: args.workspaceName,
      planLabel: getOrganizationPlanLabel(args.targetPlan),
      billingCycle: args.billingCycle ?? null,
    });
  } catch (error) {
    console.error('Failed to send subscription plan change email:', error);
  }
}

async function fetchCheckoutCompletionSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  let subscription = await fetchBillingSubscription({ subscriptionId });

  for (let attempt = 0; attempt < CHECKOUT_SYNC_RETRY_ATTEMPTS; attempt += 1) {
    if (
      canProvisionOrgFromSubscriptionStatus(subscription.status) ||
      isTerminalSubscriptionStatus(subscription.status) ||
      (subscription.status || '').toLowerCase() !== 'created'
    ) {
      return subscription;
    }

    if (CHECKOUT_SYNC_RETRY_DELAY_MS > 0) {
      await sleep(CHECKOUT_SYNC_RETRY_DELAY_MS);
    }

    subscription = await fetchBillingSubscription({ subscriptionId });
  }

  return subscription;
}

async function fetchPayPalCheckoutCompletionSubscription(
  subscriptionId: string
): Promise<PayPalSubscription> {
  let subscription = await fetchPayPalSubscription({ subscriptionId });

  for (let attempt = 0; attempt < CHECKOUT_SYNC_RETRY_ATTEMPTS; attempt += 1) {
    if (
      canProvisionOrgFromPayPalStatus(subscription.status) ||
      isTerminalPayPalSubscriptionStatus(subscription.status) ||
      !['APPROVAL_PENDING', 'APPROVED'].includes(String(subscription.status || '').toUpperCase())
    ) {
      return subscription;
    }

    if (CHECKOUT_SYNC_RETRY_DELAY_MS > 0) {
      await sleep(CHECKOUT_SYNC_RETRY_DELAY_MS);
    }

    subscription = await fetchPayPalSubscription({ subscriptionId });
  }

  return subscription;
}

async function markWebhookEvent(args: {
  provider: BillingProvider;
  eventId: string;
  type: string;
  status: 'processed' | 'failed';
  orgId?: string | null;
  subscriptionId?: string | null;
  errorMessage?: string | null;
}) {
  await BillingWebhookEventModel.updateOne(
    { provider: args.provider, eventId: args.eventId },
    {
      $set: {
        type: args.type,
        status: args.status,
        orgId: args.orgId && mongoose.Types.ObjectId.isValid(args.orgId) ? args.orgId : null,
        subscriptionId: args.subscriptionId || null,
        errorMessage: args.errorMessage || null,
        processedAt: new Date(),
      },
    },
    { upsert: true }
  ).exec();
}

async function resolveRazorpaySubscriptionForWebhook(event: RazorpayWebhookEvent): Promise<RazorpaySubscription | null> {
  const directSubscription = event.payload?.subscription?.entity;
  if (directSubscription?.id) {
    return directSubscription;
  }

  const invoiceSubscriptionId = event.payload?.invoice?.entity?.subscription_id;
  if (invoiceSubscriptionId) {
    return fetchBillingSubscription({ subscriptionId: invoiceSubscriptionId });
  }

  return null;
}

async function syncOrganizationBillingFromRazorpaySubscription(args: {
  subscription: RazorpaySubscription;
  paymentId?: string | null;
  webhookEventId?: string | null;
  userIdFallback?: string | null;
  orgIdFallback?: string | null;
  canCreateIfMissing?: boolean;
}): Promise<{
  organization: OrgBillingProjection | null;
  targetPlan: OrganizationTierId | null;
}> {
  const notes = args.subscription.notes || {};
  const targetPlan = resolveRazorpayWebhookTargetPlan({
    notes,
    planId: args.subscription.plan_id,
  });

  const organization = await ensureOrgForWebhook({
    userId: notes.userId || args.userIdFallback || null,
    orgId: notes.orgId || args.orgIdFallback || null,
    customerId: args.subscription.customer_id || null,
    subscriptionId: args.subscription.id,
    targetPlan,
    canCreateIfMissing:
      args.canCreateIfMissing ?? canProvisionOrgFromSubscriptionStatus(args.subscription.status),
  });

  if (!organization) {
    return {
      organization: null,
      targetPlan,
    };
  }

  await persistOrganizationBillingSnapshot({
    org: organization,
    provider: 'razorpay',
    targetPlan:
      targetPlan && shouldApplyPlanFromSubscriptionStatus(args.subscription.status) ? targetPlan : null,
    nextStatus: mapRazorpaySubscriptionStatusToOrganizationStatus(args.subscription.status),
    webhookEventId: args.webhookEventId,
    billingState: {
      ...extractBillingStateFromRazorpaySubscription(args.subscription, args.webhookEventId),
      lastPaymentId: args.paymentId || undefined,
    },
  });

  return {
    organization,
    targetPlan,
  };
}

async function syncOrganizationBillingFromPayPalSubscription(args: {
  subscription: PayPalSubscription;
  webhookEventId?: string | null;
  userIdFallback?: string | null;
  orgIdFallback?: string | null;
  canCreateIfMissing?: boolean;
}): Promise<{
  organization: OrgBillingProjection | null;
  targetPlan: OrganizationTierId | null;
}> {
  const metadata = parsePayPalCustomId(args.subscription.custom_id);
  const targetPlan = resolvePayPalWebhookTargetPlan({
    customId: args.subscription.custom_id,
    planId: args.subscription.plan_id,
  });

  const organization = await ensureOrgForWebhook({
    userId: metadata.userId || args.userIdFallback || null,
    orgId: metadata.orgId || args.orgIdFallback || null,
    customerId: args.subscription.subscriber?.payer_id || null,
    subscriptionId: args.subscription.id,
    targetPlan,
    canCreateIfMissing:
      args.canCreateIfMissing ?? canProvisionOrgFromPayPalStatus(args.subscription.status),
  });

  if (!organization) {
    return {
      organization: null,
      targetPlan,
    };
  }

  await persistOrganizationBillingSnapshot({
    org: organization,
    provider: 'paypal',
    targetPlan:
      targetPlan && shouldApplyPlanFromPayPalStatus(args.subscription.status) ? targetPlan : null,
    nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus(args.subscription.status),
    webhookEventId: args.webhookEventId,
    billingState: extractBillingStateFromPayPalSubscription(args.subscription, args.webhookEventId),
  });

  return {
    organization,
    targetPlan,
  };
}

async function syncOrganizationBillingFromPayPalOrder(args: {
  order: PayPalOrder;
  checkoutSessionId: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  userIdFallback?: string | null;
  orgIdFallback?: string | null;
}): Promise<{
  organization: OrgBillingProjection | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}> {
  const metadata = parsePayPalCustomId(getPayPalOrderCustomId(args.order));
  const vault = getPayPalVaultTokenFromOrder(args.order);
  const capture = getPayPalPrimaryCapture(args.order);
  const anchorDate =
    capture?.create_time && !Number.isNaN(new Date(capture.create_time).getTime())
      ? new Date(capture.create_time)
      : new Date();
  const periodWindow = resolvePayPalPeriodWindow({
    billingCycle: args.billingCycle,
    anchorDate,
  });
  const organization = await ensureOrgForWebhook({
    userId: metadata.userId || args.userIdFallback || null,
    orgId: metadata.orgId || args.orgIdFallback || null,
    customerId: vault?.customer?.id || null,
    subscriptionId: args.checkoutSessionId,
    vaultId: vault?.id || null,
    targetPlan: args.targetPlan,
    canCreateIfMissing: true,
  });

  if (!organization) {
    return {
      organization: null,
      currentPeriodStart: periodWindow.currentPeriodStart,
      currentPeriodEnd: periodWindow.currentPeriodEnd,
    };
  }

  await persistOrganizationBillingSnapshot({
    org: organization,
    provider: 'paypal',
    targetPlan: args.targetPlan,
    nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus('ACTIVE'),
    billingState: extractBillingStateFromPayPalOrder(args.order, {
      subscriptionId: args.checkoutSessionId,
      subscriptionStatus: 'ACTIVE',
      targetPlan: args.targetPlan,
      billingCycle: args.billingCycle,
      billingMarket: args.billingMarket,
      currentPeriodStart: periodWindow.currentPeriodStart,
      currentPeriodEnd: periodWindow.currentPeriodEnd,
    }),
  });

  return {
    organization,
    currentPeriodStart: periodWindow.currentPeriodStart,
    currentPeriodEnd: periodWindow.currentPeriodEnd,
  };
}

function getPlanLabelForError(targetPlan: OrganizationTierId) {
  return getOrganizationPlanLabel(targetPlan);
}

function getBillingCycleLabel(billingCycle?: BillingCycle | null) {
  if (billingCycle === 'annually') {
    return 'annual';
  }

  if (billingCycle === 'monthly') {
    return 'monthly';
  }

  return null;
}

function getPendingBillingConflictMessage(args: {
  pendingPlan?: OrganizationTierId | null;
  pendingBillingCycle?: BillingCycle | null;
  requestedPlan: OrganizationTierId;
}) {
  const pendingPlanLabel = args.pendingPlan ? getOrganizationPlanLabel(args.pendingPlan) : 'another';
  const billingCycleLabel = getBillingCycleLabel(args.pendingBillingCycle);
  const pendingCheckoutLabel = billingCycleLabel
    ? `${billingCycleLabel} ${pendingPlanLabel}`
    : pendingPlanLabel;
  const article = billingCycleLabel === 'annual' ? 'An' : 'A';

  if (args.pendingPlan && args.pendingPlan !== args.requestedPlan) {
    return `${article} ${pendingCheckoutLabel} checkout is already processing for this workspace, so it cannot be switched yet. Wait for activation, or cancel pending activation if it appears stuck. Your workspace data, documents, and trial history stay intact.`;
  }

  return `${article} ${pendingCheckoutLabel} checkout is already processing for this workspace. Wait for activation, or cancel pending activation if it appears stuck. Your workspace data, documents, and trial history stay intact.`;
}

function canReplacePendingBillingCheckout(args: {
  provider?: BillingProvider | null;
  subscriptionStatus?: string | null;
}) {
  if (args.provider === 'paypal') {
    return (args.subscriptionStatus || '').toUpperCase() === 'APPROVAL_PENDING';
  }

  return (args.subscriptionStatus || '').toLowerCase() === 'created';
}

function getPendingBillingSwitchedMessage(args: {
  previousPlan?: OrganizationTierId | null;
  requestedPlan: OrganizationTierId;
}) {
  const previousPlanLabel = args.previousPlan
    ? getOrganizationPlanLabel(args.previousPlan)
    : 'unfinished checkout';
  const requestedPlanLabel = getOrganizationPlanLabel(args.requestedPlan);

  return `We replaced the unfinished ${previousPlanLabel} checkout with ${requestedPlanLabel}. Your workspace data, documents, and trial history stay intact.`;
}

function getPendingCheckoutResumeBlockedMessage(args: {
  provider: BillingProvider;
  subscriptionStatus?: string | null;
}) {
  if (args.provider === 'paypal') {
    const normalized = (args.subscriptionStatus || '').toUpperCase();
    if (normalized === 'APPROVED' || normalized === 'ACTIVE') {
      return 'This PayPal approval was already received and is still being confirmed. Refresh the page, or cancel it if it stays stuck.';
    }

    return 'This pending billing step is already processing and cannot be reopened. Refresh the page, or cancel it if it stays stuck.';
  }

  const normalized = (args.subscriptionStatus || '').toLowerCase();
  if (normalized === 'authenticated') {
    return 'This payment was already received and is still being confirmed. Refresh the page, or cancel it if it stays stuck.';
  }

  if (normalized === 'pending' || normalized === 'halted') {
    return 'This pending billing step is still being set up and cannot be reopened. Refresh the page, or cancel it if it stays stuck.';
  }

  return 'This pending billing step is already processing and cannot be reopened. Refresh the page, or cancel it if it stays stuck.';
}

export async function resumePendingBillingCheckoutForUser(args: {
  userId: string;
  orgId?: string | null;
}): Promise<{
  mode: 'checkout';
  sessionId: string;
  checkout: BillingCheckoutSession;
  organizationId: string | null;
  message: null;
}> {
  await connectDB();

  const user = await Users.findById(args.userId)
    .select('_id email firstName lastName name')
    .lean<{ _id: mongoose.Types.ObjectId; email?: string; firstName?: string; lastName?: string; name?: string } | null>();

  if (!user?._id || !user.email) {
    throw new Error('Unable to start billing checkout for this account.');
  }

  const organization = args.orgId ? await getOrgById(args.orgId) : null;
  const currentBilling = organization?.billing;
  const currentBillingProvider = inferBillingProvider(currentBilling);

  if (!currentBilling?.subscriptionId || !currentBillingProvider) {
    throw new Error('There is no pending billing checkout to continue for this workspace.');
  }

  if (currentBillingProvider === 'paypal') {
    if ((currentBilling.subscriptionStatus || '').toUpperCase() !== 'APPROVAL_PENDING') {
      throw new Error(
        'This pending billing step can no longer be reopened. Cancel it first, then choose your package again.'
      );
    }

    if (isLegacyPayPalBillingRecord(currentBilling)) {
      if (!currentBilling.lastCheckoutReference) {
        throw new Error(
          'This pending billing step can no longer be reopened. Cancel it first, then choose your package again.'
        );
      }

      const pendingSubscription = await fetchPayPalSubscription({
        subscriptionId: currentBilling.subscriptionId,
      }).catch(async (error) => {
        if (organization && isPayPalResourceNotFoundError(error)) {
          await clearStaleLegacyPayPalPendingCheckout({
            org: organization,
            billing: currentBilling,
          });
          throw new Error(
            'This pending billing step can no longer be reopened. Refresh the page, then choose your package again.'
          );
        }

        throw error;
      });

      if ((pendingSubscription.status || '').toUpperCase() !== 'APPROVAL_PENDING') {
        const targetPlan = resolvePayPalWebhookTargetPlan({
          customId: pendingSubscription.custom_id,
          planId: pendingSubscription.plan_id,
        });

        if (organization) {
          await persistOrganizationBillingSnapshot({
            org: organization,
            provider: 'paypal',
            targetPlan:
              targetPlan && shouldApplyPlanFromPayPalStatus(pendingSubscription.status)
                ? targetPlan
                : null,
            nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus(pendingSubscription.status),
            billingState: {
              ...extractBillingStateFromPayPalSubscription(pendingSubscription),
              market: currentBilling.market || 'international',
            },
          });
        }

        throw new Error(
          getPendingCheckoutResumeBlockedMessage({
            provider: 'paypal',
            subscriptionStatus: pendingSubscription.status,
          })
        );
      }

      return {
        mode: 'checkout',
        sessionId: currentBilling.subscriptionId,
        checkout: {
          provider: 'paypal',
          flow: 'hosted_approval',
          subscriptionId: currentBilling.subscriptionId,
          approvalUrl: currentBilling.lastCheckoutReference,
        },
        organizationId: organization ? String(organization._id) : null,
        message: null,
      };
    }

    const targetPlan =
      currentBilling.targetPlan ||
      getTierFromPayPalPlanId(currentBilling.planId) ||
      getOrganizationTier(organization?.plan);
    const billingCycle =
      currentBilling.billingCycle ||
      getBillingCycleFromPayPalPlanId(currentBilling.planId);
    const billingMarket = currentBilling.market || 'international';

    if (!targetPlan || !billingCycle) {
      throw new Error(
        'This older pending billing step cannot be reopened automatically. Cancel it first, then choose your package again.'
      );
    }

    const checkoutSession = await createPayPalBillingCheckoutSession({
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
      userId: args.userId,
      userEmail: user.email,
      targetPlan,
      billingCycle,
      billingMarket,
      orgId: organization ? String(organization._id) : null,
      checkoutSessionId: currentBilling.subscriptionId,
    });

    return {
      mode: 'checkout',
      sessionId: checkoutSession.sessionId,
      checkout: checkoutSession.checkout,
      organizationId: organization ? String(organization._id) : null,
      message: null,
    };
  }

  if ((currentBilling.subscriptionStatus || '').toLowerCase() !== 'created') {
    throw new Error(
      'This pending billing step is already processing and cannot be reopened. Refresh the page, or cancel it if it stays stuck.'
    );
  }

  const pendingSubscription = await fetchBillingSubscription({
    subscriptionId: currentBilling.subscriptionId,
  });

  if ((pendingSubscription.status || '').toLowerCase() !== 'created') {
    const targetPlan = resolveRazorpayWebhookTargetPlan({
      notes: pendingSubscription.notes,
      planId: pendingSubscription.plan_id,
    });

    if (organization) {
      await persistOrganizationBillingSnapshot({
        org: organization,
        provider: 'razorpay',
        targetPlan:
          targetPlan && shouldApplyPlanFromSubscriptionStatus(pendingSubscription.status)
            ? targetPlan
            : null,
        nextStatus: mapRazorpaySubscriptionStatusToOrganizationStatus(pendingSubscription.status),
        billingState: {
          ...extractBillingStateFromRazorpaySubscription(pendingSubscription),
          market: currentBilling.market || 'india',
        },
      });
    }

    throw new Error(
      getPendingCheckoutResumeBlockedMessage({
        provider: 'razorpay',
        subscriptionStatus: pendingSubscription.status,
      })
    );
  }

  const targetPlan =
    resolveRazorpayWebhookTargetPlan({
      notes: pendingSubscription.notes,
      planId: pendingSubscription.plan_id,
    }) ||
    currentBilling.targetPlan ||
    getTierFromRazorpayPlanId(currentBilling.planId) ||
    getOrganizationTier(organization?.plan);
  const billingCycle =
    getBillingCycleFromRazorpayPlanId(pendingSubscription.plan_id) ||
    toBillingCycle(pendingSubscription.notes?.billingCycle) ||
    currentBilling.billingCycle ||
    getBillingCycleFromRazorpayPlanId(currentBilling.planId);

  if (!targetPlan || !billingCycle) {
    throw new Error(
      'This older pending billing step cannot be reopened automatically. Cancel it first, then choose your package again.'
    );
  }

  return {
    mode: 'checkout',
    sessionId: pendingSubscription.id,
    checkout: buildRazorpayCheckoutSession({
      subscriptionId: pendingSubscription.id,
      userId: args.userId,
      userEmail: user.email,
      targetPlan,
      billingCycle,
      orgId: organization ? String(organization._id) : null,
      orgName: organization?.name || null,
    }),
    organizationId: organization ? String(organization._id) : null,
    message: null,
  };
}

export async function startBillingCheckoutForUser(args: {
  baseUrl?: string | null;
  userId: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  orgId?: string | null;
}): Promise<{
  mode: 'checkout' | 'updated';
  sessionId: string;
  checkout: BillingCheckoutSession | null;
  organizationId: string | null;
  message: string | null;
}> {
  await connectDB();

  const user = await Users.findById(args.userId)
    .select('_id email firstName lastName name')
    .lean<{ _id: mongoose.Types.ObjectId; email?: string; firstName?: string; lastName?: string; name?: string } | null>();

  if (!user?._id || !user.email) {
    throw new Error('Unable to start billing checkout for this account.');
  }

  const organization = args.orgId ? await getOrgById(args.orgId) : null;
  const currentBilling = organization?.billing;
  const targetProvider = getBillingProviderForMarket(args.billingMarket);
  const currentBillingProvider = inferBillingProvider(currentBilling);
  const currentBillingMarket =
    currentBilling?.market ||
    (currentBillingProvider === 'paypal' ? 'international' : currentBillingProvider === 'razorpay' ? 'india' : null);
  const currentBillingCycle =
    currentBilling?.billingCycle ||
    (currentBillingProvider === 'paypal'
      ? getBillingCycleFromPayPalPlanId(currentBilling?.planId)
      : getBillingCycleFromRazorpayPlanId(currentBilling?.planId));
  const currentBillingTier =
    currentBilling?.targetPlan ||
    (currentBillingProvider === 'paypal'
      ? getTierFromPayPalPlanId(currentBilling?.planId)
      : getTierFromRazorpayPlanId(currentBilling?.planId)) || getOrganizationTier(organization?.plan);
  const isSameCommercialTarget = matchesCommercialTarget({
    provider: currentBillingProvider,
    market: currentBillingMarket,
    targetPlan: currentBillingTier,
    billingCycle: currentBillingCycle,
    expectedProvider: targetProvider,
    expectedMarket: args.billingMarket,
    expectedTargetPlan: args.targetPlan,
    expectedBillingCycle: args.billingCycle,
  });

  if (
    currentBilling?.subscriptionId &&
    currentBillingProvider === 'razorpay' &&
    currentBilling.subscriptionStatus === 'created'
  ) {
    const pendingSubscription = await fetchBillingSubscription({ subscriptionId: currentBilling.subscriptionId });
    const pendingBillingTier =
      resolveRazorpayWebhookTargetPlan({
        notes: pendingSubscription.notes,
        planId: pendingSubscription.plan_id,
      }) || currentBillingTier;
    const pendingBillingCycle =
      getBillingCycleFromRazorpayPlanId(pendingSubscription.plan_id) ||
      toBillingCycle(pendingSubscription.notes?.billingCycle) ||
      currentBillingCycle;
    const pendingBillingMarket = currentBillingMarket || 'india';

    if (
      String(pendingSubscription.status || '').toLowerCase() === 'created' &&
      matchesCommercialTarget({
        provider: 'razorpay',
        market: pendingBillingMarket,
        targetPlan: pendingBillingTier,
        billingCycle: pendingBillingCycle,
        expectedProvider: targetProvider,
        expectedMarket: args.billingMarket,
        expectedTargetPlan: args.targetPlan,
        expectedBillingCycle: args.billingCycle,
      })
    ) {
      return {
        mode: 'checkout',
        sessionId: pendingSubscription.id,
        checkout: buildRazorpayCheckoutSession({
          subscriptionId: pendingSubscription.id,
          userId: args.userId,
          userEmail: user.email,
          targetPlan: args.targetPlan,
          billingCycle: args.billingCycle,
          orgId: organization ? String(organization._id) : null,
          orgName: organization?.name || null,
        }),
        organizationId: organization ? String(organization._id) : null,
        message: null,
      };
    }
  }

  if (
    currentBilling?.subscriptionId &&
    currentBillingProvider === 'paypal' &&
    currentBilling.subscriptionStatus === 'APPROVAL_PENDING'
  ) {
    if (isLegacyPayPalBillingRecord(currentBilling) && currentBilling.lastCheckoutReference) {
      const pendingSubscription = await fetchPayPalSubscription({
        subscriptionId: currentBilling.subscriptionId,
      }).catch(async (error) => {
        if (organization && isPayPalResourceNotFoundError(error)) {
          await clearStaleLegacyPayPalPendingCheckout({
            org: organization,
            billing: currentBilling,
          });
          return null;
        }

        throw error;
      });

      if (!pendingSubscription) {
        return startBillingCheckoutForUser(args);
      }
      const pendingMetadata = parsePayPalCustomId(pendingSubscription.custom_id);
      const pendingBillingTier =
        resolvePayPalWebhookTargetPlan({
          customId: pendingSubscription.custom_id,
          planId: pendingSubscription.plan_id,
        }) || currentBillingTier;
      const pendingBillingCycle =
        pendingMetadata.billingCycle ||
        getBillingCycleFromPayPalPlanId(pendingSubscription.plan_id) ||
        currentBillingCycle;
      const pendingBillingMarket =
        pendingMetadata.billingMarket || currentBillingMarket || 'international';

      if (
        String(pendingSubscription.status || '').toUpperCase() === 'APPROVAL_PENDING' &&
        matchesCommercialTarget({
          provider: 'paypal',
          market: pendingBillingMarket,
          targetPlan: pendingBillingTier,
          billingCycle: pendingBillingCycle,
          expectedProvider: targetProvider,
          expectedMarket: args.billingMarket,
          expectedTargetPlan: args.targetPlan,
          expectedBillingCycle: args.billingCycle,
        })
      ) {
        return {
          mode: 'checkout',
          sessionId: currentBilling.subscriptionId,
          checkout: {
            provider: 'paypal',
            flow: 'hosted_approval',
            subscriptionId: currentBilling.subscriptionId,
            approvalUrl: currentBilling.lastCheckoutReference,
          },
          organizationId: organization ? String(organization._id) : null,
          message: null,
        };
      }
    } else {
      const pendingBillingTier =
        currentBilling.targetPlan ||
        getTierFromPayPalPlanId(currentBilling.planId) ||
        currentBillingTier;
      const pendingBillingCycle =
        currentBilling.billingCycle ||
        getBillingCycleFromPayPalPlanId(currentBilling.planId) ||
        currentBillingCycle;
      const pendingBillingMarket = currentBilling.market || currentBillingMarket || 'international';

      if (
        matchesCommercialTarget({
          provider: 'paypal',
          market: pendingBillingMarket,
          targetPlan: pendingBillingTier,
          billingCycle: pendingBillingCycle,
          expectedProvider: targetProvider,
          expectedMarket: args.billingMarket,
          expectedTargetPlan: args.targetPlan,
          expectedBillingCycle: args.billingCycle,
        })
      ) {
        const pendingCheckoutSession = await createPayPalBillingCheckoutSession({
          baseUrl: args.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
          userId: args.userId,
          userEmail: user.email,
          targetPlan: args.targetPlan,
          billingCycle: args.billingCycle,
          billingMarket: args.billingMarket,
          orgId: organization ? String(organization._id) : null,
          checkoutSessionId: currentBilling.subscriptionId,
        });

        return {
          mode: 'checkout',
          sessionId: pendingCheckoutSession.sessionId,
          checkout: pendingCheckoutSession.checkout,
          organizationId: organization ? String(organization._id) : null,
          message: null,
        };
      }
    }
  }

  if (
    organization?._id &&
    currentBilling?.subscriptionId &&
    canReplacePendingBillingCheckout({
      provider: currentBillingProvider,
      subscriptionStatus: currentBilling.subscriptionStatus,
    }) &&
    !isSameCommercialTarget
  ) {
    const pendingBillingPlan =
      currentBilling?.targetPlan ||
      (currentBillingProvider === 'paypal'
        ? getTierFromPayPalPlanId(currentBilling?.planId)
        : getTierFromRazorpayPlanId(currentBilling?.planId));

    await manageBillingSubscription({
      orgId: String(organization._id),
      action: 'cancel',
      timing: 'now',
    });

    const replacementCheckout = await startBillingCheckoutForUser(args);
    return {
      ...replacementCheckout,
      message: getPendingBillingSwitchedMessage({
        previousPlan: pendingBillingPlan,
        requestedPlan: args.targetPlan,
      }),
    };
  }

  if (
    organization?.billing?.subscriptionId &&
    currentBillingProvider === 'razorpay' &&
    canUpdateExistingSubscription(organization.billing.subscriptionStatus)
  ) {
    if (isSameCommercialTarget) {
      throw new Error(`${getPlanLabelForError(args.targetPlan)} is already active for this workspace.`);
    }

    if (targetProvider !== 'razorpay') {
      throw new Error(
        'Switching this workspace from Razorpay to PayPal requires cancelling the current subscription first, then starting the new international checkout.'
      );
    }

    const updatedSubscription = await updateBillingSubscriptionPlan({
      subscriptionId: organization.billing.subscriptionId,
      targetPlan: args.targetPlan,
      billingCycle: args.billingCycle,
    });

    await persistOrganizationBillingSnapshot({
      org: organization,
      provider: 'razorpay',
      targetPlan: args.targetPlan,
      nextStatus: mapRazorpaySubscriptionStatusToOrganizationStatus(updatedSubscription.status),
      billingState: {
        ...extractBillingStateFromRazorpaySubscription(updatedSubscription),
        market: args.billingMarket,
        cancelAtPeriodEnd: false,
      },
    });

    await sendPlanChangeEmailIfNeeded({
      email: user.email,
      recipientName: user.firstName || user.name || null,
      workspaceName: organization.name,
      targetPlan: args.targetPlan,
      billingCycle: args.billingCycle,
      subscriptionStatus: updatedSubscription.status || null,
      provider: 'razorpay',
    });

    return {
      mode: 'updated',
      sessionId: updatedSubscription.id,
      checkout: null,
      organizationId: String(organization._id),
      message: updatedSubscription.has_scheduled_changes
        ? `${getPlanLabelForError(args.targetPlan)} will be active at the end of your current billing cycle.`
        : `${getPlanLabelForError(args.targetPlan)} is now active for this workspace.`,
    };
  }

  if (
    organization?.billing?.subscriptionId &&
    currentBillingProvider === 'paypal' &&
    canUpdateExistingPayPalSubscription(organization.billing.subscriptionStatus)
  ) {
    if (isSameCommercialTarget) {
      throw new Error(`${getPlanLabelForError(args.targetPlan)} is already active for this workspace.`);
    }

    throw new Error(
      'Changing an existing international subscription plan requires cancelling the current subscription first, then starting a new checkout.'
    );
  }

  if (
    organization?.billing?.subscriptionId &&
    ((currentBillingProvider === 'paypal' &&
      !isTerminalPayPalSubscriptionStatus(organization.billing.subscriptionStatus)) ||
      (currentBillingProvider !== 'paypal' &&
        !isTerminalSubscriptionStatus(organization.billing.subscriptionStatus)))
  ) {
    if (currentBillingProvider === 'razorpay') {
      try {
        const liveSubscription = await fetchBillingSubscription({
          subscriptionId: organization.billing.subscriptionId,
        });
        if (
          isTerminalSubscriptionStatus(liveSubscription.status) ||
          liveSubscription.status === 'cancelled'
        ) {
          console.log('[startBillingCheckoutForUser] Subscription is cancelled in Razorpay, clearing from database...');
          await persistOrganizationBillingSnapshot({
            org: organization,
            provider: 'razorpay',
            targetPlan: null,
            nextStatus: null,
            billingState: {
              market: organization.billing?.market || 'india',
              customerId: undefined,
              subscriptionId: undefined,
              subscriptionStatus: undefined,
              targetPlan: undefined,
              planId: undefined,
              billingCycle: undefined,
              currencyCode: undefined,
              vaultId: undefined,
              vaultStatus: undefined,
              paymentMethodType: undefined,
              paymentMethodBrand: undefined,
              paymentMethodLast4: undefined,
              currentPeriodStart: undefined,
              currentPeriodEnd: undefined,
              cancelAtPeriodEnd: false,
              hasScheduledChange: false,
              lastCheckoutReference: undefined,
              lastPaymentId: undefined,
              lastWebhookEventId: undefined,
            },
          });
          return startBillingCheckoutForUser(args);
        }
      } catch (error) {
        console.log('[startBillingCheckoutForUser] Error checking Razorpay subscription:', error);
      }
    }

    const pendingBillingPlan =
      currentBilling?.targetPlan ||
      (currentBillingProvider === 'paypal'
        ? getTierFromPayPalPlanId(currentBilling?.planId)
        : getTierFromRazorpayPlanId(currentBilling?.planId));
    const pendingBillingCycle =
      currentBilling?.billingCycle ||
      (currentBillingProvider === 'paypal'
        ? getBillingCycleFromPayPalPlanId(currentBilling?.planId)
        : getBillingCycleFromRazorpayPlanId(currentBilling?.planId));
    throw new Error(
      getPendingBillingConflictMessage({
        pendingPlan: pendingBillingPlan,
        pendingBillingCycle,
        requestedPlan: args.targetPlan,
      })
    );
  }

  let checkoutSession:
    | Awaited<ReturnType<typeof createPayPalBillingCheckoutSession>>
    | Awaited<ReturnType<typeof createBillingCheckoutSession>>;
  let billingStateForCheckout: Record<string, unknown>;
  let lastCheckoutReference: string;

  if (targetProvider === 'paypal') {
    checkoutSession = await createPayPalBillingCheckoutSession({
      baseUrl: args.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
      userId: args.userId,
      userEmail: user.email,
      targetPlan: args.targetPlan,
      billingCycle: args.billingCycle,
      billingMarket: args.billingMarket,
      orgId: organization ? String(organization._id) : null,
    });
    billingStateForCheckout = {
      provider: 'paypal',
      market: args.billingMarket,
      subscriptionId: checkoutSession.sessionId,
      subscriptionStatus: 'APPROVAL_PENDING',
      targetPlan: args.targetPlan,
      planId: getPayPalPlanId(args.targetPlan, args.billingCycle) || undefined,
      billingCycle: args.billingCycle,
      currencyCode: 'USD',
      cancelAtPeriodEnd: false,
      hasScheduledChange: false,
      updatedAt: new Date(),
    };
    lastCheckoutReference = checkoutSession.sessionId;
  } else {
    checkoutSession = await createBillingCheckoutSession({
      userId: args.userId,
      userEmail: user.email,
      targetPlan: args.targetPlan,
      billingCycle: args.billingCycle,
      orgId: organization ? String(organization._id) : null,
      orgName: organization?.name || null,
    });
    billingStateForCheckout = extractBillingStateFromRazorpaySubscription(checkoutSession.subscription);
    lastCheckoutReference = checkoutSession.sessionId;
  }

  if (organization?._id) {
    await persistOrganizationBillingSnapshot({
      org: organization,
      provider: targetProvider,
      billingState: {
        ...billingStateForCheckout,
        market: args.billingMarket,
        targetPlan: args.targetPlan,
        lastCheckoutReference,
      },
    });
  }

  return {
    mode: 'checkout',
    sessionId: checkoutSession.sessionId,
    checkout: checkoutSession.checkout,
    organizationId: organization ? String(organization._id) : null,
    message: null,
  };
}

export async function createPayPalCardOrderForUser(args: {
  userId: string;
  orgId?: string | null;
  checkoutSessionId: string;
  targetPlan: OrganizationTierId;
  billingCycle: BillingCycle;
  billingMarket: BillingMarket;
  paymentMethod?: 'paypal' | 'card';
}): Promise<{
  orderId: string;
}> {
  await connectDB();

  const user = await Users.findById(args.userId)
    .select('_id email')
    .lean<{ _id: mongoose.Types.ObjectId; email?: string } | null>();

  if (!user?._id || !user.email) {
    throw new Error('Unable to start billing checkout for this account.');
  }

  const organization = args.orgId ? await getOrgById(args.orgId) : null;
  const currentBilling = organization?.billing;

  if (organization && currentBilling?.provider === 'paypal' && !isLegacyPayPalBillingRecord(currentBilling)) {
    if (
      currentBilling.subscriptionId !== args.checkoutSessionId ||
      (currentBilling.subscriptionStatus || '').toUpperCase() !== 'APPROVAL_PENDING'
    ) {
      throw new Error('This pending billing checkout is no longer available. Start a new checkout.');
    }

    if (
      currentBilling.targetPlan !== args.targetPlan ||
      currentBilling.billingCycle !== args.billingCycle ||
      (currentBilling.market || 'international') !== args.billingMarket
    ) {
      throw new Error('This pending billing checkout no longer matches the selected plan. Start a new checkout.');
    }
  }

  const order = await createPayPalCardCheckoutOrder({
    checkoutSessionId: args.checkoutSessionId,
    userId: args.userId,
    targetPlan: args.targetPlan,
    billingCycle: args.billingCycle,
    billingMarket: args.billingMarket,
    orgId: organization ? String(organization._id) : null,
    customerId: currentBilling?.customerId || null,
    paymentMethod: args.paymentMethod || 'card',
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  });

  if (organization) {
    await persistOrganizationBillingSnapshot({
      org: organization,
      provider: 'paypal',
      billingState: {
        lastCheckoutReference: order.id,
      },
    });
  }

  return {
    orderId: order.id,
  };
}

export async function manageBillingSubscription(args: {
  orgId: string;
  action: BillingManagementAction;
  timing?: BillingActionTiming;
}): Promise<{
  orgId: string;
  subscriptionId: string;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  message: string;
}> {
  await connectDB();

  const organization = await getOrgById(args.orgId);
  if (!organization?.billing?.subscriptionId) {
    throw new Error('This workspace does not have an active subscription yet.');
  }

  const provider = organization.billing.provider || 'razorpay';
  const subscriptionId = organization.billing.subscriptionId;
  const normalizedStatus =
    provider === 'paypal'
      ? (organization.billing.subscriptionStatus || '').toUpperCase()
      : (organization.billing.subscriptionStatus || '').toLowerCase();
  const timing = args.timing || 'cycle_end';

  let subscription:
    | RazorpaySubscription
    | PayPalSubscription
    | PayPalOrder;
  let message = 'Subscription updated.';
  let cancelAtPeriodEnd = Boolean(organization.billing.cancelAtPeriodEnd);

  if (provider === 'paypal') {
    if (args.action === 'pause') {
      throw new Error('Pause is not available for PayPal subscriptions in this release.');
    }

    if (args.action === 'cancel' && isPendingPayPalCheckoutStatus(normalizedStatus)) {
      if (isLegacyPayPalBillingRecord(organization.billing)) {
        await cancelPayPalSubscription({ subscriptionId }).catch((error) => {
          if (!isPayPalResourceNotFoundError(error)) {
            throw error;
          }
        });
      }

      await clearPendingPayPalCheckout({
        org: organization,
        billing: organization.billing,
      });

      return {
        orgId: String(organization._id),
        subscriptionId,
        subscriptionStatus: null,
        cancelAtPeriodEnd: false,
        message: 'Checkout was cancelled. Your current workspace plan did not change.',
      };
    }

    if (isLegacyPayPalBillingRecord(organization.billing)) {
      if (args.action === 'resume') {
        if (normalizedStatus !== 'SUSPENDED') {
          throw new Error('Only suspended PayPal subscriptions can be resumed.');
        }
        await activatePayPalSubscription({ subscriptionId });
        subscription = await fetchPayPalSubscription({ subscriptionId });
        message = 'Subscription resumed. The workspace is back on its active billing cycle.';
        cancelAtPeriodEnd = false;
      } else {
        if (isTerminalPayPalSubscriptionStatus(normalizedStatus)) {
          throw new Error('This subscription has already ended. Start a new checkout to reactivate billing.');
        }
        await cancelPayPalSubscription({ subscriptionId });
        subscription = await fetchPayPalSubscription({ subscriptionId });
        cancelAtPeriodEnd = false;
        message =
          timing === 'cycle_end'
            ? 'PayPal cancellations are immediate in this release, so the subscription was cancelled now.'
            : 'Subscription cancelled immediately.';
      }
    } else {
      const targetPlan =
        organization.billing.targetPlan || getTierFromPayPalPlanId(organization.billing.planId);
      const billingCycle =
        organization.billing.billingCycle ||
        getBillingCycleFromPayPalPlanId(organization.billing.planId);
      if (!targetPlan || !billingCycle) {
        throw new Error('This PayPal billing record is missing plan details. Start a new checkout to restore billing.');
      }

      if (args.action === 'resume') {
        if (normalizedStatus !== 'SUSPENDED') {
          throw new Error('Only suspended PayPal subscriptions can be resumed.');
        }
        if (!organization.billing.vaultId) {
          throw new Error('No saved payment method is available for this subscription. Start a new checkout to reactivate billing.');
        }

        subscription = await createPayPalRecurringOrder({
          checkoutSessionId: subscriptionId,
          vaultId: organization.billing.vaultId,
          userId: String(organization.ownerUserId),
          targetPlan,
          billingCycle,
          billingMarket: organization.billing.market || 'international',
          orgId: String(organization._id),
          paymentMethodType: organization.billing.paymentMethodType || 'card',
        });
        message = 'Subscription resumed. The workspace is back on its active billing cycle.';
        cancelAtPeriodEnd = false;
      } else if (timing === 'cycle_end' && normalizedStatus === 'ACTIVE') {
        cancelAtPeriodEnd = true;
        await persistOrganizationBillingSnapshot({
          org: organization,
          provider,
          targetPlan,
          nextStatus: null,
          billingState: {
            cancelAtPeriodEnd: true,
            updatedAt: new Date(),
          },
        });

        return {
          orgId: String(organization._id),
          subscriptionId,
          subscriptionStatus: organization.billing.subscriptionStatus || null,
          cancelAtPeriodEnd: true,
          message: 'Subscription will cancel at the end of the current billing cycle.',
        };
      } else {
        if (isTerminalPayPalSubscriptionStatus(normalizedStatus)) {
          throw new Error('This subscription has already ended. Start a new checkout to reactivate billing.');
        }

        if (organization.billing.vaultId) {
          await deletePayPalVaultToken({ vaultId: organization.billing.vaultId }).catch((error) => {
            console.error('Failed to delete PayPal vault token during cancellation:', error);
          });
        }

        const now = new Date();
        await persistOrganizationBillingSnapshot({
          org: organization,
          provider,
          targetPlan: null,
          nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus('CANCELLED'),
          billingState: {
            provider: 'paypal',
            market: organization.billing.market || 'international',
            customerId: organization.billing.customerId || undefined,
            subscriptionId,
            subscriptionStatus: 'CANCELLED',
            targetPlan,
            planId: organization.billing.planId || undefined,
            billingCycle,
            currencyCode: organization.billing.currencyCode || 'USD',
            vaultId: undefined,
            vaultStatus: 'DELETED',
            paymentMethodType: organization.billing.paymentMethodType || undefined,
            paymentMethodBrand: organization.billing.paymentMethodBrand || undefined,
            paymentMethodLast4: organization.billing.paymentMethodLast4 || undefined,
            currentPeriodStart: organization.billing.currentPeriodStart || now,
            currentPeriodEnd: now,
            cancelAtPeriodEnd: false,
            hasScheduledChange: false,
            lastCheckoutReference: organization.billing.lastCheckoutReference || undefined,
            updatedAt: now,
          },
        });

        return {
          orgId: String(organization._id),
          subscriptionId,
          subscriptionStatus: 'CANCELLED',
          cancelAtPeriodEnd: false,
          message: 'Subscription cancelled immediately.',
        };
      }
    }
  } else {
    if (args.action === 'pause') {
      if (normalizedStatus !== 'active') {
        throw new Error('Only active Razorpay subscriptions can be paused.');
      }
      subscription = await pauseBillingSubscription({ subscriptionId });
      message = 'Subscription paused. Organization access now stays in a suspended state until you resume it.';
      cancelAtPeriodEnd = false;
    } else if (args.action === 'resume') {
      if (normalizedStatus !== 'paused') {
        throw new Error('Only paused Razorpay subscriptions can be resumed.');
      }
      subscription = await resumeBillingSubscription({ subscriptionId });
      message = 'Subscription resumed. The workspace is back on its active billing cycle.';
      cancelAtPeriodEnd = false;
    } else {
      if (isTerminalSubscriptionStatus(normalizedStatus)) {
        throw new Error('This subscription has already ended. Start a new checkout to reactivate billing.');
      }

      if (isPendingRazorpayCheckoutStatus(normalizedStatus)) {
        try {
          await cancelBillingSubscription({ subscriptionId, atCycleEnd: false });
        } catch (error) {
          if (!isStaleRazorpayPendingCheckoutError(error)) {
            throw error;
          }
        }

        await clearStaleRazorpayPendingCheckout({
          org: organization,
          billing: organization.billing,
        });

        return {
          orgId: String(organization._id),
          subscriptionId,
          subscriptionStatus: null,
          cancelAtPeriodEnd: false,
          message: 'Checkout was cancelled. Your current workspace plan did not change.',
        };
      }

      try {
        subscription = await cancelBillingSubscription({ subscriptionId, atCycleEnd: timing === 'cycle_end' });
      } catch (error) {
        if (
          isStaleRazorpayPendingCheckoutError(error) &&
          ['created', 'authenticated', 'pending', 'halted'].includes(normalizedStatus)
        ) {
          await clearStaleRazorpayPendingCheckout({
            org: organization,
            billing: organization.billing,
          });

          return {
            orgId: String(organization._id),
            subscriptionId,
            subscriptionStatus: null,
            cancelAtPeriodEnd: false,
            message: 'The unfinished checkout had already expired, so it was cleared. You can start a fresh upgrade now.',
          };
        }

        throw error;
      }
      cancelAtPeriodEnd = timing === 'cycle_end' && (subscription.status || '').toLowerCase() !== 'cancelled';
      message = cancelAtPeriodEnd
        ? 'Subscription will cancel at the end of the current billing cycle.'
        : 'Subscription cancelled immediately.';
    }
  }

  const targetPlanForUpdate =
    provider === 'paypal'
      ? isLegacyPayPalBillingRecord(organization.billing)
        ? resolvePayPalWebhookTargetPlan({
            customId: (subscription as PayPalSubscription).custom_id,
            planId: (subscription as PayPalSubscription).plan_id,
          })
        : organization.billing.targetPlan || getTierFromPayPalPlanId(organization.billing.planId)
      : resolveRazorpayWebhookTargetPlan({ planId: (subscription as RazorpaySubscription).plan_id });
  const nextStatus =
    cancelAtPeriodEnd
      ? null
      : provider === 'paypal'
        ? mapPayPalSubscriptionStatusToOrganizationStatus(
            isLegacyPayPalBillingRecord(organization.billing) ? subscription.status : 'ACTIVE'
          )
        : mapRazorpaySubscriptionStatusToOrganizationStatus(subscription.status);
  const billingState =
    provider === 'paypal'
      ? isLegacyPayPalBillingRecord(organization.billing)
        ? extractBillingStateFromPayPalSubscription(subscription as PayPalSubscription)
        : extractBillingStateFromPayPalOrder(subscription as PayPalOrder, {
            subscriptionId,
            subscriptionStatus: 'ACTIVE',
            targetPlan:
              organization.billing.targetPlan ||
              getTierFromPayPalPlanId(organization.billing.planId) ||
              'business',
            billingCycle:
              organization.billing.billingCycle ||
              getBillingCycleFromPayPalPlanId(organization.billing.planId) ||
              'annually',
            billingMarket: organization.billing.market || 'international',
            ...resolvePayPalPeriodWindow({
              billingCycle:
                organization.billing.billingCycle ||
                getBillingCycleFromPayPalPlanId(organization.billing.planId) ||
                'annually',
              previousPeriodEnd: organization.billing.currentPeriodEnd || null,
            }),
          })
      : extractBillingStateFromRazorpaySubscription(subscription as RazorpaySubscription);

  await persistOrganizationBillingSnapshot({
    org: organization,
    provider,
    targetPlan: targetPlanForUpdate,
    nextStatus,
    billingState: {
      ...billingState,
      cancelAtPeriodEnd,
    },
  });

  return {
    orgId: String(organization._id),
    subscriptionId,
    subscriptionStatus:
      provider === 'paypal' && !isLegacyPayPalBillingRecord(organization.billing)
        ? 'ACTIVE'
        : subscription.status || null,
    cancelAtPeriodEnd,
    message,
  };
}

export async function completeBillingCheckoutForUser(args: {
  userId: string;
  orgId?: string | null;
  checkout: BillingCheckoutSuccessPayload;
}): Promise<{
  redirectPath: string;
  message: string;
  organizationId: string | null;
  subscriptionId: string;
  subscriptionStatus: string | null;
}> {
  await connectDB();

  if (args.checkout.provider === 'paypal' && 'paypal_order_id' in args.checkout) {
    const order = await capturePayPalOrder({
      orderId: args.checkout.paypal_order_id,
    });
    const metadata = parsePayPalCustomId(getPayPalOrderCustomId(order));

    if (metadata.userId && metadata.userId !== args.userId) {
      throw new Error('This PayPal checkout does not belong to the current account.');
    }

    if (!metadata.targetPlan || !metadata.billingCycle || !metadata.checkoutSessionId) {
      throw new Error('This PayPal card checkout is missing plan metadata. Start the checkout again.');
    }

    const { organization } = await syncOrganizationBillingFromPayPalOrder({
      order,
      checkoutSessionId: metadata.checkoutSessionId,
      targetPlan: metadata.targetPlan,
      billingCycle: metadata.billingCycle,
      billingMarket: metadata.billingMarket || 'international',
      userIdFallback: args.userId,
      orgIdFallback: args.orgId,
    });
    const user = await Users.findById(args.userId)
      .select('email firstName lastName name')
      .lean<{ email?: string; firstName?: string; lastName?: string; name?: string } | null>();

    await sendPlanChangeEmailIfNeeded({
      email: user?.email || null,
      recipientName: user?.firstName || user?.name || null,
      workspaceName: organization?.name || null,
      targetPlan: metadata.targetPlan,
      billingCycle: metadata.billingCycle,
      subscriptionStatus: 'ACTIVE',
      provider: 'paypal',
    });

    return {
      redirectPath: `${getDashboardAccountPath('subscription')}?checkout=success`,
      message: 'Subscription payment was successful. Your workspace billing is now active.',
      organizationId: organization ? String(organization._id) : null,
      subscriptionId: metadata.checkoutSessionId,
      subscriptionStatus: 'ACTIVE',
    };
  }

  if (args.checkout.provider === 'paypal') {
    const subscription = await fetchPayPalCheckoutCompletionSubscription(
      args.checkout.paypal_subscription_id
    );
    const metadata = parsePayPalCustomId(subscription.custom_id);

    if (metadata.userId && metadata.userId !== args.userId) {
      throw new Error('This PayPal checkout does not belong to the current account.');
    }

    const { organization, targetPlan } = await syncOrganizationBillingFromPayPalSubscription({
      subscription,
      userIdFallback: args.userId,
      orgIdFallback: args.orgId,
    });

    const billingCycle =
      getBillingCycleFromPayPalPlanId(subscription.plan_id) ||
      metadata.billingCycle ||
      null;
    const user = await Users.findById(args.userId)
      .select('email firstName lastName name')
      .lean<{ email?: string; firstName?: string; lastName?: string; name?: string } | null>();

    await sendPlanChangeEmailIfNeeded({
      email: user?.email || null,
      recipientName: user?.firstName || user?.name || null,
      workspaceName: organization?.name || null,
      targetPlan,
      billingCycle,
      subscriptionStatus: subscription.status || null,
      provider: 'paypal',
    });

    const normalizedStatus = String(subscription.status || '').toUpperCase();
    const checkoutState = normalizedStatus === 'ACTIVE' ? 'success' : 'processing';

    return {
      redirectPath: `${getDashboardAccountPath('subscription')}?checkout=${checkoutState}`,
      message:
        checkoutState === 'success'
          ? 'Subscription approval was successful. Your workspace billing is now active.'
          : 'Subscription approval was received. Billing activation is still syncing and should appear shortly.',
      organizationId: organization ? String(organization._id) : null,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status || null,
    };
  }

  const verifiedCheckout = verifyRazorpayCheckoutSignature(args.checkout);
  const subscription = await fetchCheckoutCompletionSubscription(
    verifiedCheckout.razorpay_subscription_id
  );

  const subscriptionUserId = subscription.notes?.userId?.trim();
  if (subscriptionUserId && subscriptionUserId !== args.userId) {
    throw new Error('This Razorpay checkout does not belong to the current account.');
  }

  const { organization, targetPlan } = await syncOrganizationBillingFromRazorpaySubscription({
    subscription,
    paymentId: verifiedCheckout.razorpay_payment_id,
    userIdFallback: args.userId,
    orgIdFallback: args.orgId,
  });

  const billingCycle = getBillingCycleFromRazorpayPlanId(subscription.plan_id) || null;
  const user = await Users.findById(args.userId)
    .select('email firstName lastName name')
    .lean<{ email?: string; firstName?: string; lastName?: string; name?: string } | null>();

  await sendPlanChangeEmailIfNeeded({
    email: user?.email || null,
    recipientName: user?.firstName || user?.name || null,
    workspaceName: organization?.name || null,
    targetPlan,
    billingCycle,
    subscriptionStatus: subscription.status || null,
    provider: 'razorpay',
  });

  const normalizedStatus = (subscription.status || '').toLowerCase();
  const checkoutState =
    normalizedStatus === 'authenticated' ||
    normalizedStatus === 'active' ||
    normalizedStatus === 'pending'
      ? 'success'
      : 'processing';
  const redirectPath = `${getDashboardAccountPath('subscription')}?checkout=${checkoutState}`;
  const message =
    checkoutState === 'success'
      ? 'Subscription payment was successful. Your workspace billing is now active.'
      : 'Payment was captured successfully. Billing activation is still syncing and should appear shortly.';

  return {
    redirectPath,
    message,
    organizationId: organization ? String(organization._id) : null,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status || null,
  };
}

async function syncOrganizationBillingFromPayPalVaultWebhook(args: {
  event: PayPalWebhookEvent;
}): Promise<OrgBillingProjection | null> {
  const resource = (args.event.resource || {}) as {
    id?: string;
    customer?: {
      id?: string;
      merchant_customer_id?: string;
    };
    payment_source?: {
      paypal?: Record<string, unknown>;
      card?: {
        brand?: string;
        last_digits?: string;
      };
    };
  };
  const vaultId = resource.id || null;
  const merchantCustomerId = resource.customer?.merchant_customer_id || null;
  const customerId = resource.customer?.id || null;
  const metadata = parsePayPalMerchantCustomerId(merchantCustomerId);

  const organization = await ensureOrgForWebhook({
    userId: metadata.userId || null,
    orgId: metadata.orgId || null,
    customerId,
    subscriptionId: metadata.checkoutSessionId || null,
    vaultId,
    canCreateIfMissing: false,
  });

  if (!organization) {
    return null;
  }

  const eventType = args.event.event_type || '';
  if (eventType === 'VAULT.PAYMENT-TOKEN.CREATED') {
    await persistOrganizationBillingSnapshot({
      org: organization,
      provider: 'paypal',
      targetPlan: null,
      nextStatus: null,
      billingState: {
        customerId: customerId || undefined,
        vaultId: vaultId || undefined,
        vaultStatus: 'VAULTED',
        paymentMethodType: resource.payment_source?.card ? 'card' : resource.payment_source?.paypal ? 'paypal' : undefined,
        paymentMethodBrand: resource.payment_source?.card?.brand || undefined,
        paymentMethodLast4: resource.payment_source?.card?.last_digits || undefined,
        updatedAt: new Date(),
      },
    });
    return organization;
  }

  if (eventType === 'VAULT.PAYMENT-TOKEN.DELETED') {
    await persistOrganizationBillingSnapshot({
      org: organization,
      provider: 'paypal',
      targetPlan: null,
      nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus('SUSPENDED'),
      billingState: {
        subscriptionStatus: 'SUSPENDED',
        vaultId: undefined,
        vaultStatus: 'DELETED',
        updatedAt: new Date(),
      },
    });
    return organization;
  }

  if (eventType === 'VAULT.PAYMENT-TOKEN.DELETION-INITIATED') {
    await persistOrganizationBillingSnapshot({
      org: organization,
      provider: 'paypal',
      targetPlan: null,
      nextStatus: null,
      billingState: {
        vaultStatus: 'DELETION_INITIATED',
        updatedAt: new Date(),
      },
    });
  }

  return organization;
}

export async function processDuePayPalRenewals(args: {
  limit?: number;
} = {}): Promise<{
  processed: number;
  renewed: number;
  cancelled: number;
  failed: number;
}> {
  await connectDB();

  const now = new Date();
  const limit = Math.max(1, Math.min(args.limit || 50, 250));
  const organizations = await OrganizationModel.find({
    'billing.provider': 'paypal',
    'billing.subscriptionId': { $exists: true, $ne: '' },
    'billing.subscriptionStatus': 'ACTIVE',
    'billing.currentPeriodEnd': { $ne: null, $lte: now },
  })
    .select('name ownerUserId plan status billing')
    .limit(limit)
    .lean<OrgBillingProjection[]>();

  let renewed = 0;
  let cancelled = 0;
  let failed = 0;

  for (const organization of organizations) {
    const billing = organization.billing;
    if (!billing?.subscriptionId) {
      continue;
    }

    const targetPlan = billing.targetPlan || getTierFromPayPalPlanId(billing.planId);
    const billingCycle = billing.billingCycle || getBillingCycleFromPayPalPlanId(billing.planId);

    if (billing.cancelAtPeriodEnd) {
      if (billing.vaultId) {
        await deletePayPalVaultToken({ vaultId: billing.vaultId }).catch((error) => {
          console.error('Failed to delete PayPal vault token at period end:', error);
        });
      }

      await persistOrganizationBillingSnapshot({
        org: organization,
        provider: 'paypal',
        targetPlan: null,
        nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus('CANCELLED'),
        billingState: {
          subscriptionStatus: 'CANCELLED',
          vaultId: undefined,
          vaultStatus: billing.vaultId ? 'DELETED' : billing.vaultStatus || undefined,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: now,
          updatedAt: now,
        },
      });
      cancelled += 1;
      continue;
    }

    if (!targetPlan || !billingCycle || !billing.vaultId) {
      await persistOrganizationBillingSnapshot({
        org: organization,
        provider: 'paypal',
        targetPlan: null,
        nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus('SUSPENDED'),
        billingState: {
          subscriptionStatus: 'SUSPENDED',
          updatedAt: now,
        },
      });
      failed += 1;
      continue;
    }

    try {
      const order = await createPayPalRecurringOrder({
        checkoutSessionId: billing.subscriptionId,
        vaultId: billing.vaultId,
        userId: String(organization.ownerUserId),
        targetPlan,
        billingCycle,
        billingMarket: billing.market || 'international',
        orgId: String(organization._id),
        paymentMethodType: billing.paymentMethodType || 'card',
      });
      const periodWindow = resolvePayPalPeriodWindow({
        billingCycle,
        previousPeriodEnd: billing.currentPeriodEnd || now,
      });

      await persistOrganizationBillingSnapshot({
        org: organization,
        provider: 'paypal',
        targetPlan,
        nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus('ACTIVE'),
        billingState: {
          ...extractBillingStateFromPayPalOrder(order, {
            subscriptionId: billing.subscriptionId,
            subscriptionStatus: 'ACTIVE',
            targetPlan,
            billingCycle,
            billingMarket: billing.market || 'international',
            currentPeriodStart: periodWindow.currentPeriodStart,
            currentPeriodEnd: periodWindow.currentPeriodEnd,
          }),
          cancelAtPeriodEnd: false,
        },
      });
      renewed += 1;
    } catch (error) {
      console.error('PayPal recurring renewal failed:', error);
      await persistOrganizationBillingSnapshot({
        org: organization,
        provider: 'paypal',
        targetPlan: null,
        nextStatus: mapPayPalSubscriptionStatusToOrganizationStatus('SUSPENDED'),
        billingState: {
          subscriptionStatus: 'SUSPENDED',
          updatedAt: new Date(),
        },
      });
      failed += 1;
    }
  }

  return {
    processed: organizations.length,
    renewed,
    cancelled,
    failed,
  };
}

export async function syncBillingWebhookEvent(args: {
  provider: BillingProvider;
  event: RazorpayWebhookEvent | PayPalWebhookEvent;
  eventIdHeader?: string | null;
}): Promise<{
  duplicate: boolean;
  orgId: string | null;
}> {
  await connectDB();

  const eventId =
    args.provider === 'paypal'
      ? resolvePayPalWebhookEventId(args.event as PayPalWebhookEvent)
      : resolveWebhookEventId({
          event: args.event as RazorpayWebhookEvent,
          headerEventId: args.eventIdHeader,
        });

  const existing = await BillingWebhookEventModel.findOne({
    provider: args.provider,
    eventId,
    status: 'processed',
  })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId } | null>();

  if (existing) {
    return { duplicate: true, orgId: null };
  }

  let orgIdForFailure: string | null = null;
  let subscriptionIdForFailure: string | null = null;

  try {
    if (args.provider === 'paypal') {
      const event = args.event as PayPalWebhookEvent;
      if (event.event_type.startsWith('VAULT.')) {
        const organization = await syncOrganizationBillingFromPayPalVaultWebhook({ event });
        const vaultId =
          typeof (event.resource as { id?: string } | undefined)?.id === 'string'
            ? ((event.resource as { id?: string }).id || null)
            : null;
        subscriptionIdForFailure = vaultId;

        await markWebhookEvent({
          provider: 'paypal',
          eventId,
          type: event.event_type,
          status: 'processed',
          orgId: organization ? String(organization._id) : null,
          subscriptionId: organization?.billing?.subscriptionId || vaultId,
        });

        if (!organization) {
          return { duplicate: false, orgId: null };
        }

        await writeAuditEvent({
          userId: String(organization.ownerUserId),
          orgId: String(organization._id),
          action: 'subscription.billing_synced',
          metadata: {
            provider: 'paypal',
            eventId,
            eventType: event.event_type,
            subscriptionId: organization.billing?.subscriptionId || null,
            vaultId,
          },
        });

        return { duplicate: false, orgId: String(organization._id) };
      }

      const subscriptionId = resolvePayPalSubscriptionIdFromWebhookEvent(event);

      if (!subscriptionId) {
        await markWebhookEvent({
          provider: 'paypal',
          eventId,
          type: event.event_type,
          status: 'processed',
        });
        return { duplicate: false, orgId: null };
      }

      subscriptionIdForFailure = subscriptionId;
      const subscription = await fetchPayPalSubscription({ subscriptionId });
      const { organization } = await syncOrganizationBillingFromPayPalSubscription({
        subscription,
        webhookEventId: eventId,
      });

      if (!organization) {
        await markWebhookEvent({
          provider: 'paypal',
          eventId,
          type: event.event_type,
          status: 'processed',
          subscriptionId,
        });
        return { duplicate: false, orgId: null };
      }

      orgIdForFailure = String(organization._id);

      await markWebhookEvent({
        provider: 'paypal',
        eventId,
        type: event.event_type,
        status: 'processed',
        orgId: String(organization._id),
        subscriptionId,
      });

      await writeAuditEvent({
        userId: String(organization.ownerUserId),
        orgId: String(organization._id),
        action: 'subscription.billing_synced',
        metadata: {
          provider: 'paypal',
          eventId,
          eventType: event.event_type,
          subscriptionId,
          subscriptionStatus: subscription.status || null,
        },
      });

      return { duplicate: false, orgId: String(organization._id) };
    }

    const event = args.event as RazorpayWebhookEvent;
    const subscription = await resolveRazorpaySubscriptionForWebhook(event);
    const paymentId = event.payload?.payment?.entity?.id || null;

    if (!subscription) {
      await markWebhookEvent({
        provider: 'razorpay',
        eventId,
        type: event.event,
        status: 'processed',
      });
      return { duplicate: false, orgId: null };
    }

    subscriptionIdForFailure = subscription.id;
    const { organization } = await syncOrganizationBillingFromRazorpaySubscription({
      subscription,
      paymentId,
      webhookEventId: eventId,
    });

    if (!organization) {
      await markWebhookEvent({
        provider: 'razorpay',
        eventId,
        type: event.event,
        status: 'processed',
        subscriptionId: subscription.id,
      });
      return { duplicate: false, orgId: null };
    }

    orgIdForFailure = String(organization._id);

    await markWebhookEvent({
      provider: 'razorpay',
      eventId,
      type: event.event,
      status: 'processed',
      orgId: String(organization._id),
      subscriptionId: subscription.id,
    });

    await writeAuditEvent({
      userId: String(organization.ownerUserId),
      orgId: String(organization._id),
      action: 'subscription.billing_synced',
      metadata: {
        provider: 'razorpay',
        eventId,
        eventType: event.event,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status || null,
        paymentId,
      },
    });

    return { duplicate: false, orgId: String(organization._id) };
  } catch (error) {
    await markWebhookEvent({
      provider: args.provider,
      eventId,
      type: args.provider === 'paypal'
        ? (args.event as PayPalWebhookEvent).event_type
        : (args.event as RazorpayWebhookEvent).event,
      status: 'failed',
      orgId: orgIdForFailure,
      subscriptionId: subscriptionIdForFailure,
      errorMessage: error instanceof Error ? error.message : 'Unknown billing webhook failure.',
    });
    throw error;
  }
}
