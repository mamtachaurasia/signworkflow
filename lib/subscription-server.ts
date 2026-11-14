import mongoose from 'mongoose';

import OrganizationModel from '@/models/Organization';
import type { OrganizationPlan } from '@/models/Organization';
import MembershipModel from '@/models/Membership';
import TeamModel from '@/models/Team';
import Users from '@/models/Users';
import connectDB from '@/utils/db';
import { getActiveOrgContextForUser } from '@/lib/orgs';
import {
  getBillingConfigForMarket,
  getBillingConfigForProvider,
  getBillingProviderForMarket,
  getDefaultBillingMarket,
  getTierFromPayPalPlanId,
  getTierFromRazorpayPlanId,
  supportsSelfServeBilling,
  type BillingManagementAction,
  type BillingCycle,
  type BillingMarket,
  type BillingProvider,
} from '@/lib/billing';
import {
  ORGANIZATION_PLAN_OPTIONS,
  canCreateAdditionalTeams,
  getDefaultSeatLimitForTier,
  getOrganizationTier,
  normalizeOrganizationPlanCode,
  getPlanGateMessage,
  getRequiredTierLabelForFeature,
  getTeamLimitForTier,
  getWorkspaceTier,
  hasOrganizationFeature,
  type OrganizationTierId,
  type PlanFeatureKey,
  type PricingTierId,
} from '@/lib/subscription-plans';
import { getTrialStatusInfo } from '@/lib/trial-status';

export type SubscriptionSummary = {
  workspaceTier: PricingTierId;
  trialAccess: {
    isExpired: boolean;
    hasRestrictedControls: boolean;
    message: string | null;
  };
  organization: {
    id: string;
    name: string;
    plan: string;
    normalizedTier: OrganizationTierId;
    status: string;
    seatLimit: number;
    activeMembers: number;
    teamCount: number;
    maxTeams: number | null;
    trialEndsAt: string | null;
    role: string | null;
  } | null;
  billing: {
    providerConfigured: boolean;
    provider: BillingProvider;
    market: BillingMarket | null;
    defaultMarket: BillingMarket;
    supportedMarkets: BillingMarket[];
    missingConfig: string[];
    canStartCheckout: boolean;
    canManageSubscription: boolean;
    managementActions: BillingManagementAction[];
    statusMessage: string | null;
    customerId: string | null;
    subscriptionId: string | null;
    subscriptionStatus: string | null;
    pendingPlan: OrganizationTierId | null;
    billingCycle: BillingCycle | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasScheduledChange: boolean;
    selfServePlans: OrganizationTierId[];
  };
  entitlements: {
    teams: boolean;
    multipleTeams: boolean;
    auditTrail: boolean;
    adminGovernance: boolean;
    orgSettings: boolean;
    retentionPolicies: boolean;
    legalHolds: boolean;
    auditExport: boolean;
    cloudLibrary: boolean;
    inviteLinks: boolean;
    templateCollaboration: boolean;
    bulkSend: boolean;
    paymentRequests: boolean;
    aiSelectionSummary: boolean;
    aiFullDocument: boolean;
    aiTranslation: boolean;
    aiExplanation: boolean;
    aiRiskAnalysis: boolean;
  };
  availablePlans: Array<{
    id: OrganizationTierId;
    seatLimit: number;
    maxTeams: number | null;
  }>;
};

type TrialAccessState = SubscriptionSummary['trialAccess'];

type OrganizationSnapshot = {
  _id: mongoose.Types.ObjectId;
  name: string;
  plan: OrganizationPlan;
  status: string;
  seatLimit: number;
  trialEndsAt?: Date | null;
  billing?: {
    provider?: BillingProvider;
    market?: BillingMarket;
    customerId?: string;
    subscriptionId?: string;
    subscriptionStatus?: string;
    targetPlan?: OrganizationTierId;
    planId?: string;
    billingCycle?: BillingCycle;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    hasScheduledChange?: boolean;
  };
};

function resolveEffectiveOrganizationPlan(plan?: string | null): string {
  return normalizeOrganizationPlanCode(plan) ?? getOrganizationTier(plan) ?? 'business';
}

function getAvailableManagementActions(
  subscriptionStatus?: string | null,
  provider: BillingProvider = 'razorpay'
): BillingManagementAction[] {
  if (provider === 'paypal') {
    const normalized = (subscriptionStatus || '').toUpperCase();
    if (normalized === 'ACTIVE') {
      return ['cancel'];
    }
    if (normalized === 'SUSPENDED') {
      return ['resume', 'cancel'];
    }
    if (normalized === 'APPROVAL_PENDING' || normalized === 'APPROVED') {
      return ['cancel'];
    }
    return [];
  }

  const normalized = (subscriptionStatus || '').toLowerCase();
  if (normalized === 'active') {
    return ['cancel'];
  }
  if (normalized === 'paused') {
    return ['resume', 'cancel'];
  }
  if (
    normalized === 'authenticated' ||
    normalized === 'created' ||
    normalized === 'pending' ||
    normalized === 'halted'
  ) {
    return ['cancel'];
  }
  return [];
}

function getTrialAccessState(args: {
  plan?: string | null;
  trialEndsAt?: Date | string | null;
}): TrialAccessState {
  const status = getTrialStatusInfo(args.trialEndsAt ?? null);
  const isExpired = args.plan === 'trial' && status?.state === 'expired';

  return {
    isExpired,
    hasRestrictedControls: isExpired,
    message: isExpired
      ? 'Your free trial has ended. Upgrade to keep creating, editing, and sending in this workspace. You can still review existing records and perform cleanup actions.'
      : null,
  };
}

export async function getOrganizationPlanSnapshot(orgId: string): Promise<OrganizationSnapshot | null> {
  if (!mongoose.Types.ObjectId.isValid(orgId)) {
    return null;
  }

  return OrganizationModel.findById(orgId)
    .select('name plan status seatLimit trialEndsAt billing')
    .lean<OrganizationSnapshot | null>();
}

export async function getSubscriptionSummaryForUser(userId: string): Promise<SubscriptionSummary> {
  await connectDB();
  const user = await Users.findById(userId)
    .select('address.country')
    .lean<{ address?: { country?: string | null } } | null>();
  const defaultBillingMarket = getDefaultBillingMarket(user?.address?.country || null);
  const supportedMarkets = (['india', 'international'] as const).filter(
    (market) => getBillingConfigForMarket(market).configured
  );

  const orgContext = await getActiveOrgContextForUser(userId);
  if (!orgContext) {
    const billingConfig = getBillingConfigForMarket(defaultBillingMarket);
    return {
      workspaceTier: 'trial',
      trialAccess: {
        isExpired: false,
        hasRestrictedControls: false,
        message: null,
      },
      organization: null,
      billing: {
        providerConfigured: billingConfig.configured,
        provider: billingConfig.provider,
        market: null,
        defaultMarket: defaultBillingMarket,
        supportedMarkets: [...supportedMarkets],
        missingConfig: billingConfig.missing,
        canStartCheckout: billingConfig.configured && billingConfig.supportsCheckout,
        canManageSubscription: false,
        managementActions: [],
        statusMessage: billingConfig.statusMessage,
        customerId: null,
        subscriptionId: null,
        subscriptionStatus: null,
        pendingPlan: null,
        billingCycle: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        hasScheduledChange: false,
        selfServePlans: ORGANIZATION_PLAN_OPTIONS.filter((plan) => supportsSelfServeBilling(plan)),
      },
      entitlements: {
        teams: false,
        multipleTeams: false,
        auditTrail: false,
        adminGovernance: false,
        orgSettings: false,
        retentionPolicies: false,
        legalHolds: false,
        auditExport: false,
        cloudLibrary: false,
        inviteLinks: false,
        templateCollaboration: false,
        bulkSend: false,
        paymentRequests: false,
        aiSelectionSummary: false,
        aiFullDocument: false,
        aiTranslation: false,
        aiExplanation: false,
        aiRiskAnalysis: false,
      },
      availablePlans: ORGANIZATION_PLAN_OPTIONS.map((plan) => ({
        id: plan,
        seatLimit: getDefaultSeatLimitForTier(plan),
        maxTeams: getTeamLimitForTier(plan),
      })),
    };
  }

  const [organization, activeMembers, teamCount] = await Promise.all([
    getOrganizationPlanSnapshot(String(orgContext.orgId)),
    MembershipModel.countDocuments({ orgId: orgContext.orgId, status: 'active' }),
    TeamModel.countDocuments({ orgId: orgContext.orgId }),
  ]);

  const billingProvider =
    organization?.billing?.provider || getBillingProviderForMarket(defaultBillingMarket);
  const billingConfig = getBillingConfigForProvider(billingProvider);
  const billingMarket = organization?.billing?.market || defaultBillingMarket;

  const normalizedTier = getOrganizationTier(organization?.plan) ?? 'business';
  const effectivePlan = resolveEffectiveOrganizationPlan(organization?.plan);
  const trialAccess = getTrialAccessState({
    plan: organization?.plan,
    trialEndsAt: organization?.trialEndsAt,
  });

  return {
    workspaceTier: organization ? getWorkspaceTier(effectivePlan) : 'trial',
    trialAccess,
    organization: organization
      ? {
          id: String(organization._id),
          name: organization.name,
          plan: effectivePlan,
          normalizedTier,
          status: organization.status,
          seatLimit: organization.seatLimit,
          activeMembers,
          teamCount,
          maxTeams: getTeamLimitForTier(normalizedTier),
          trialEndsAt: organization.trialEndsAt ? organization.trialEndsAt.toISOString() : null,
          role: orgContext.role,
        }
      : null,
    billing: {
      providerConfigured: billingConfig.configured,
      provider: billingProvider,
      market: organization?.billing?.market || null,
      defaultMarket: billingMarket,
      supportedMarkets: [...supportedMarkets],
      missingConfig: billingConfig.missing,
      canStartCheckout:
        billingConfig.configured &&
        billingConfig.supportsCheckout &&
        orgContext.role === 'owner',
      canManageSubscription:
        billingConfig.configured &&
        billingConfig.supportsManagement &&
        orgContext.role === 'owner' &&
        Boolean(organization?.billing?.subscriptionId),
      managementActions:
        orgContext.role === 'owner'
          ? getAvailableManagementActions(organization?.billing?.subscriptionStatus, billingProvider)
          : [],
      statusMessage: billingConfig.statusMessage,
      customerId: organization?.billing?.customerId || null,
      subscriptionId: organization?.billing?.subscriptionId || null,
      subscriptionStatus: organization?.billing?.subscriptionStatus || null,
      pendingPlan:
        organization?.billing?.targetPlan ??
        (billingProvider === 'paypal'
          ? getTierFromPayPalPlanId(organization?.billing?.planId)
          : getTierFromRazorpayPlanId(organization?.billing?.planId)) ??
        null,
      billingCycle: organization?.billing?.billingCycle || null,
      currentPeriodEnd: organization?.billing?.currentPeriodEnd
        ? organization.billing.currentPeriodEnd.toISOString()
        : null,
      cancelAtPeriodEnd: Boolean(organization?.billing?.cancelAtPeriodEnd),
      hasScheduledChange: Boolean(organization?.billing?.hasScheduledChange),
      selfServePlans: ORGANIZATION_PLAN_OPTIONS.filter((plan) => supportsSelfServeBilling(plan)),
    },
    entitlements: {
      teams: hasOrganizationFeature(effectivePlan, 'teams'),
      multipleTeams: hasOrganizationFeature(effectivePlan, 'multiple_teams'),
      auditTrail: hasOrganizationFeature(effectivePlan, 'audit_trail'),
      adminGovernance: hasOrganizationFeature(effectivePlan, 'admin_governance'),
      orgSettings: hasOrganizationFeature(effectivePlan, 'org_settings'),
      retentionPolicies: hasOrganizationFeature(effectivePlan, 'retention_policies'),
      legalHolds: hasOrganizationFeature(effectivePlan, 'legal_holds'),
      auditExport: hasOrganizationFeature(effectivePlan, 'audit_export'),
      cloudLibrary: hasOrganizationFeature(effectivePlan, 'cloud_library'),
      inviteLinks: hasOrganizationFeature(effectivePlan, 'invite_links'),
      templateCollaboration: hasOrganizationFeature(effectivePlan, 'template_collaboration'),
      bulkSend: hasOrganizationFeature(effectivePlan, 'bulk_send'),
      paymentRequests: hasOrganizationFeature(effectivePlan, 'payment_requests'),
      aiSelectionSummary: hasOrganizationFeature(effectivePlan, 'ai_selection_summary'),
      aiFullDocument: hasOrganizationFeature(effectivePlan, 'ai_full_document'),
      aiTranslation: hasOrganizationFeature(effectivePlan, 'ai_translation'),
      aiExplanation: hasOrganizationFeature(effectivePlan, 'ai_explanation'),
      aiRiskAnalysis: hasOrganizationFeature(effectivePlan, 'ai_risk_analysis'),
    },
    availablePlans: ORGANIZATION_PLAN_OPTIONS.map((plan) => ({
      id: plan,
      seatLimit: getDefaultSeatLimitForTier(plan),
      maxTeams: getTeamLimitForTier(plan),
    })),
  };
}

export async function getExpiredTrialWriteGuard(args: { orgId?: string | null }): Promise<
  | { allowed: true }
  | { allowed: false; status: 403 | 404; message: string; reason: 'trial_expired' | 'workspace_not_found' }
> {
  if (!args.orgId) {
    return { allowed: true };
  }

  await connectDB();
  const organization = await getOrganizationPlanSnapshot(args.orgId);
  if (!organization) {
    return {
      allowed: false,
      status: 404,
      message: 'Workspace not found.',
      reason: 'workspace_not_found',
    };
  }
  const trialAccess = getTrialAccessState({
    plan: organization.plan,
    trialEndsAt: organization.trialEndsAt,
  });

  if (!trialAccess.hasRestrictedControls) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 403,
    message:
      'Your free trial has expired. Upgrade to continue creating, editing, or sending documents, templates, and contacts in this workspace.',
    reason: 'trial_expired',
  };
}

export async function getPlanGateForOrgFeature(args: {
  orgId?: string | null;
  feature: PlanFeatureKey;
}): Promise<
  | { allowed: true; plan: string; normalizedTier: OrganizationTierId }
  | { allowed: false; status: number; message: string; requiredTier: string }
> {
  if (!args.orgId) {
    return {
      allowed: false,
      status: 400,
      message: 'Workspace context is missing.',
      requiredTier: getRequiredTierLabelForFeature(args.feature),
    };
  }

  await connectDB();
  const organization = await getOrganizationPlanSnapshot(args.orgId);
  if (!organization) {
    return {
      allowed: false,
      status: 404,
      message: 'Workspace not found.',
      requiredTier: getRequiredTierLabelForFeature(args.feature),
    };
  }

  const effectivePlan = resolveEffectiveOrganizationPlan(organization.plan);

  if (!hasOrganizationFeature(effectivePlan, args.feature)) {
    return {
      allowed: false,
      status: 403,
      message: getPlanGateMessage(args.feature),
      requiredTier: getRequiredTierLabelForFeature(args.feature),
    };
  }

  return {
    allowed: true,
    plan: effectivePlan,
    normalizedTier: getOrganizationTier(organization.plan) ?? 'business',
  };
}

export async function getTeamPlanGuard(args: { orgId?: string | null }): Promise<
  | { allowed: true; plan: string; normalizedTier: OrganizationTierId; teamCount: number }
  | { allowed: false; status: number; message: string }
> {
  const baseGuard = await getPlanGateForOrgFeature({ orgId: args.orgId, feature: 'teams' });
  if (!baseGuard.allowed) {
    return baseGuard;
  }

  const teamCount = await TeamModel.countDocuments({ orgId: args.orgId });

  return {
    ...baseGuard,
    teamCount,
  };
}

export async function ensureBusinessPlanRoomForNewTeam(args: {
  orgId?: string | null;
}): Promise<{ allowed: true; plan: string; normalizedTier: OrganizationTierId; teamCount: number } | { allowed: false; status: number; message: string }> {
  const planGuard = await getTeamPlanGuard(args);
  if (!planGuard.allowed) {
    return planGuard;
  }

  if (!canCreateAdditionalTeams(planGuard.plan, planGuard.teamCount)) {
    return {
      allowed: false,
      status: 403,
      message: getPlanGateMessage('multiple_teams'),
    };
  }

  return planGuard;
}

export async function setUserAsPersonalWorkspace(userId: string): Promise<void> {
  await connectDB();
  await Users.updateOne(
    { _id: userId },
    {
      $set: {
        role: 'user',
        primaryOrgId: null,
      },
    }
  ).exec();
}
