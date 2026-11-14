export type PricingTierId = 'trial' | 'business' | 'business_plus' | 'enterprise';
export type OrganizationTierId = Exclude<PricingTierId, 'trial'>;
export type OrganizationPlanCode =
  | 'free'
  | 'trial'
  | 'pro'
  | 'business'
  | 'business_plus'
  | 'enterprise';

export type PlanFeatureKey =
  | 'organization_members'
  | 'teams'
  | 'multiple_teams'
  | 'audit_trail'
  | 'admin_governance'
  | 'org_settings'
  | 'retention_policies'
  | 'legal_holds'
  | 'audit_export'
  | 'cloud_library'
  | 'invite_links'
  | 'template_collaboration'
  | 'bulk_send'
  | 'payment_requests'
  | 'ai_selection_summary'
  | 'ai_full_document'
  | 'ai_translation'
  | 'ai_explanation'
  | 'ai_risk_analysis';

type PlanEntitlement = {
  seatLimit: number;
  maxTeams: number | null;
  features: ReadonlySet<PlanFeatureKey>;
};

const PLAN_LABELS: Record<OrganizationPlanCode, string> = {
  free: 'Legacy Business',
  trial: 'Free Trial',
  pro: 'Legacy Business Plus',
  business: 'Business',
  business_plus: 'Business Plus',
  enterprise: 'Enterprise',
};

const LEGACY_PLAN_TO_TIER: Record<OrganizationPlanCode, OrganizationTierId> = {
  free: 'business',
  trial: 'business_plus',
  pro: 'business_plus',
  business: 'business',
  business_plus: 'business_plus',
  enterprise: 'enterprise',
};

const FEATURE_MIN_TIER: Record<PlanFeatureKey, OrganizationTierId> = {
  organization_members: 'business',
  teams: 'business',
  multiple_teams: 'business_plus',
  audit_trail: 'business',
  admin_governance: 'business_plus',
  org_settings: 'business_plus',
  retention_policies: 'business_plus',
  legal_holds: 'enterprise',
  audit_export: 'enterprise',
  cloud_library: 'business',
  invite_links: 'business_plus',
  template_collaboration: 'business_plus',
  bulk_send: 'business_plus',
  payment_requests: 'business_plus',
  ai_selection_summary: 'business',
  ai_full_document: 'business_plus',
  ai_translation: 'business_plus',
  ai_explanation: 'business_plus',
  ai_risk_analysis: 'business_plus',
};

const PLAN_ENTITLEMENTS: Record<OrganizationTierId, PlanEntitlement> = {
  business: {
    seatLimit: 5,
    maxTeams: 1,
    features: new Set<PlanFeatureKey>([
      'organization_members',
      'teams',
      'audit_trail',
      'cloud_library',
      'ai_selection_summary',
    ]),
  },
  business_plus: {
    seatLimit: 15,
    maxTeams: null,
    features: new Set<PlanFeatureKey>([
      'organization_members',
      'teams',
      'multiple_teams',
      'audit_trail',
      'admin_governance',
      'org_settings',
      'retention_policies',
      'cloud_library',
      'invite_links',
      'template_collaboration',
      'bulk_send',
      'payment_requests',
      'ai_selection_summary',
      'ai_full_document',
      'ai_translation',
      'ai_explanation',
      'ai_risk_analysis',
    ]),
  },
  enterprise: {
    seatLimit: 100,
    maxTeams: null,
    features: new Set<PlanFeatureKey>([
      'organization_members',
      'teams',
      'multiple_teams',
      'audit_trail',
      'admin_governance',
      'org_settings',
      'retention_policies',
      'legal_holds',
      'audit_export',
      'cloud_library',
      'invite_links',
      'template_collaboration',
      'bulk_send',
      'payment_requests',
      'ai_selection_summary',
      'ai_full_document',
      'ai_translation',
      'ai_explanation',
      'ai_risk_analysis',
    ]),
  },
};

export const ORGANIZATION_PLAN_OPTIONS = [
  'business',
  'business_plus',
  'enterprise',
] as const satisfies readonly OrganizationTierId[];

export function normalizeOrganizationPlanCode(plan?: string | null): OrganizationPlanCode | null {
  if (!plan) return null;
  const normalized = plan.trim().toLowerCase();
  if (
    normalized === 'free' ||
    normalized === 'trial' ||
    normalized === 'pro' ||
    normalized === 'business' ||
    normalized === 'business_plus' ||
    normalized === 'enterprise'
  ) {
    return normalized;
  }
  return null;
}

export function getOrganizationTier(plan?: string | null): OrganizationTierId | null {
  const normalizedPlan = normalizeOrganizationPlanCode(plan);
  return normalizedPlan ? LEGACY_PLAN_TO_TIER[normalizedPlan] : null;
}

export function getWorkspaceTier(plan?: string | null): PricingTierId {
  const normalizedPlan = normalizeOrganizationPlanCode(plan);
  if (normalizedPlan === 'trial') return 'trial';
  return getOrganizationTier(normalizedPlan) ?? 'trial';
}

export function getOrganizationPlanLabel(plan?: string | null): string {
  const normalizedPlan = normalizeOrganizationPlanCode(plan);
  if (!normalizedPlan) return 'Unassigned';
  return PLAN_LABELS[normalizedPlan];
}

export const getWorkspacePlanLabel = getOrganizationPlanLabel;

export function getTierLabel(tier: PricingTierId): string {
  if (tier === 'trial') return 'Free Trial';
  return getOrganizationPlanLabel(tier);
}

export function getDefaultSeatLimitForTier(tier: OrganizationTierId): number {
  return PLAN_ENTITLEMENTS[tier].seatLimit;
}

export function getTeamLimitForTier(tier: OrganizationTierId): number | null {
  return PLAN_ENTITLEMENTS[tier].maxTeams;
}

export function getRequiredTierForFeature(feature: PlanFeatureKey): OrganizationTierId {
  return FEATURE_MIN_TIER[feature];
}

export function getRequiredTierLabelForFeature(feature: PlanFeatureKey): string {
  return getTierLabel(getRequiredTierForFeature(feature));
}

export function hasOrganizationFeature(plan: string | null | undefined, feature: PlanFeatureKey): boolean {
  const tier = getOrganizationTier(plan);
  if (!tier) return false;
  return PLAN_ENTITLEMENTS[tier].features.has(feature);
}

export function canCreateAdditionalTeams(
  plan: string | null | undefined,
  currentTeamCount: number
): boolean {
  const tier = getOrganizationTier(plan);
  if (!tier) return false;
  const maxTeams = PLAN_ENTITLEMENTS[tier].maxTeams;
  if (maxTeams === null) return true;
  return currentTeamCount < maxTeams;
}

export function getPlanGateMessage(feature: PlanFeatureKey): string {
  const tierLabel = getRequiredTierLabelForFeature(feature);
  switch (feature) {
    case 'teams':
      return `${tierLabel} is required to manage teams.`;
    case 'multiple_teams':
      return `${tierLabel} is required to create more than one team.`;
    case 'audit_trail':
      return `${tierLabel} is required to view workspace audit logs.`;
    case 'admin_governance':
      return `${tierLabel} is required to use Admin Governance.`;
    case 'org_settings':
      return `${tierLabel} is required to manage workspace branding and defaults.`;
    case 'retention_policies':
      return `${tierLabel} is required to manage retention policies.`;
    case 'legal_holds':
      return `${tierLabel} is required to manage legal holds.`;
    case 'audit_export':
      return `${tierLabel} is required to export or verify audit logs.`;
    case 'cloud_library':
      return `${tierLabel} is required to manage cloud-backed signed document storage.`;
    case 'invite_links':
      return `${tierLabel} is required to share invite links from sent documents.`;
    case 'template_collaboration':
      return `${tierLabel} is required to share templates with your workspace.`;
    case 'bulk_send':
      return `${tierLabel} is required to send documents in bulk.`;
    case 'payment_requests':
      return `${tierLabel} is required to attach payment requests to signing flows.`;
    default:
      return `${tierLabel} is required for this feature.`;
  }
}
