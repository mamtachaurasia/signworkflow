import { describe, expect, it } from 'vitest';

import {
  PRICING_FEATURE_GROUPS,
  PRICING_PLANS,
  formatPlanDisplayPrice,
  formatPlanPrice,
  getAnnualSavingsPercent,
  getMaximumAnnualSavingsPercent,
  getOrganizationPlanLabel,
} from '@/lib/pricing';
import { canCreateAdditionalTeams, getTeamLimitForTier, hasOrganizationFeature } from '@/lib/subscription-plans';

describe('pricing catalog', () => {
  it('maps stored organization plans to customer-facing labels', () => {
    expect(getOrganizationPlanLabel('free')).toBe('Legacy Business');
    expect(getOrganizationPlanLabel('trial')).toBe('Free Trial');
    expect(getOrganizationPlanLabel('pro')).toBe('Legacy Business Plus');
    expect(getOrganizationPlanLabel('enterprise')).toBe('Enterprise');
    expect(getOrganizationPlanLabel('business')).toBe('Business');
    expect(getOrganizationPlanLabel('business_plus')).toBe('Business Plus');
  });

  it('separates display pricing from checkout charge amounts', () => {
    const trial = PRICING_PLANS.find((plan) => plan.id === 'trial');
    const business = PRICING_PLANS.find((plan) => plan.id === 'business');
    const enterprise = PRICING_PLANS.find((plan) => plan.id === 'enterprise');

    expect(trial).toBeDefined();
    expect(business).toBeDefined();
    expect(enterprise).toBeDefined();

    expect(trial?.stats).toContain('30-day trial access');
    expect(formatPlanDisplayPrice(trial!, 'annually')).toBe('$0');
    expect(formatPlanDisplayPrice(business!, 'monthly')).toBe('$7');
    expect(formatPlanDisplayPrice(business!, 'annually')).toBe('$5');
    expect(formatPlanPrice(business!, 'annually')).toBe('$60');
    expect(formatPlanPrice(enterprise!, 'monthly')).toBe('$20');
  });

  it('calculates annual savings percentages from the monthly-equivalent plan catalog', () => {
    const business = PRICING_PLANS.find((plan) => plan.id === 'business');
    const businessPlus = PRICING_PLANS.find((plan) => plan.id === 'business_plus');

    expect(business).toBeDefined();
    expect(businessPlus).toBeDefined();
    expect(getAnnualSavingsPercent(business!, 'international')).toBe(28);
    expect(getAnnualSavingsPercent(businessPlus!, 'india')).toBe(20);
    expect(getMaximumAnnualSavingsPercent('international')).toBe(28);
  });

  it('keeps Business as the one-team tier and Business Plus as the multi-team tier', () => {
    expect(getTeamLimitForTier('business')).toBe(1);
    expect(getTeamLimitForTier('business_plus')).toBeNull();

    expect(hasOrganizationFeature('business', 'teams')).toBe(true);
    expect(hasOrganizationFeature('business', 'multiple_teams')).toBe(false);
    expect(hasOrganizationFeature('business_plus', 'multiple_teams')).toBe(true);

    expect(canCreateAdditionalTeams('business', 0)).toBe(true);
    expect(canCreateAdditionalTeams('business', 1)).toBe(false);
    expect(canCreateAdditionalTeams('business_plus', 5)).toBe(true);
  });

  it('keeps Business, Business Plus, and Enterprise governance features aligned with the marketed packages', () => {
    expect(hasOrganizationFeature('business', 'organization_members')).toBe(true);
    expect(hasOrganizationFeature('business', 'audit_trail')).toBe(true);
    expect(hasOrganizationFeature('business', 'ai_selection_summary')).toBe(true);
    expect(hasOrganizationFeature('business', 'ai_full_document')).toBe(false);
    expect(hasOrganizationFeature('business', 'ai_translation')).toBe(false);
    expect(hasOrganizationFeature('business', 'admin_governance')).toBe(false);
    expect(hasOrganizationFeature('business', 'org_settings')).toBe(false);
    expect(hasOrganizationFeature('business', 'retention_policies')).toBe(false);

    expect(hasOrganizationFeature('business_plus', 'ai_full_document')).toBe(true);
    expect(hasOrganizationFeature('business_plus', 'ai_translation')).toBe(true);
    expect(hasOrganizationFeature('business_plus', 'ai_explanation')).toBe(true);
    expect(hasOrganizationFeature('business_plus', 'ai_risk_analysis')).toBe(true);
    expect(hasOrganizationFeature('business_plus', 'admin_governance')).toBe(true);
    expect(hasOrganizationFeature('business_plus', 'org_settings')).toBe(true);
    expect(hasOrganizationFeature('business_plus', 'retention_policies')).toBe(true);
    expect(hasOrganizationFeature('business_plus', 'legal_holds')).toBe(false);
    expect(hasOrganizationFeature('business_plus', 'audit_export')).toBe(false);

    expect(hasOrganizationFeature('enterprise', 'legal_holds')).toBe(true);
    expect(hasOrganizationFeature('enterprise', 'audit_export')).toBe(true);
  });

  it('keeps the pricing copy limited to implemented settings and governance features', () => {
    const business = PRICING_PLANS.find((plan) => plan.id === 'business');
    const enterprise = PRICING_PLANS.find((plan) => plan.id === 'enterprise');
    const featureNames = PRICING_FEATURE_GROUPS.flatMap((group) => group.rows.map((row) => row.feature));
    const businessHighlights = business?.features.map((feature) => feature.text) ?? [];
    const enterpriseHighlights = enterprise?.features.map((feature) => feature.text) ?? [];

    expect(businessHighlights).toContain(
      'Workspace roles (Owner/Admin/Auditor/User) with owner-managed member invites'
    );
    expect(enterpriseHighlights).not.toContain(
      'Sales-assisted onboarding, procurement, and rollout planning'
    );
    expect(enterpriseHighlights).toContain(
      'Audit export & audit verification'
    );
    expect(businessHighlights).toContain('AI selected-text summaries');
    expect(featureNames).toContain('Full-document AI summaries');
    expect(featureNames).toContain('AI translation');
    expect(featureNames).toContain('AI clause explanations');
    expect(featureNames).toContain('AI risk analysis');
    expect(featureNames).toContain('User settings, signing defaults, and notification preferences');
    expect(featureNames).toContain('Legal holds, audit export, and audit verification');
    expect(featureNames).not.toContain('Cloud storage and payment settings');
  });
});
