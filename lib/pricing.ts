import { Briefcase, Building2, Layers, Shield, type LucideIcon } from 'lucide-react';
import {
  getOrganizationPlanLabel as getOrganizationPlanLabelFromTier,
  type PricingTierId,
} from '@/lib/subscription-plans';
import type { BillingCycle, BillingMarket } from './billing';


export type FeatureAvailability = 'included' | 'not_included' | 'contact_sales' | 'roadmap';

export type PricingFeatureGroup = {
  title: string;
  rows: Array<{
    feature: string;
    description: string;
    availability: Record<PricingTierId, FeatureAvailability>;
  }>;
};

export type CurrentPackageMapping = {
  tier: PricingTierId;
  title: string;
  status: 'ready' | 'partial';
  summary: string;
  notes: string[];
};

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface PricingPlan {
  id: string;
  name: string;
  tagline: string;
  prices: Record<
    BillingMarket,
    {
      currencyCode: 'INR' | 'USD';
      monthly: number | null;
      annually: number | null;
      locale: string;
    }
  >;
  stats: string[];
  features: PlanFeature[];
  ctaLabel: string;
  ctaHref: string;
  isPopular?: boolean;
  isCustom?: boolean;
  icon: LucideIcon;
  description?: string;
}

export const BILLING_MARKET_OPTIONS = [
  {
    id: 'india',
    label: 'India',
    shortLabel: 'INR',
    description: '',
    providerLabel: 'Razorpay',
    currencyCode: 'INR',
  },
  {
    id: 'international',
    label: 'International',
    shortLabel: 'USD',
    description: '',
    providerLabel: 'PayPal',
    currencyCode: 'USD',
  },
] as const satisfies ReadonlyArray<{
  id: BillingMarket;
  label: string;
  shortLabel: string;
  description: string;
  providerLabel: string;
  currencyCode: 'INR' | 'USD';
}>;

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'trial',
    name: 'Free Trial',
    tagline: 'Business Plus features during evaluation',
    prices: {
      india: {
        currencyCode: 'INR',
        monthly: 0,
        annually: 0,
        locale: 'en-IN',
      },
      international: {
        currencyCode: 'USD',
        monthly: 0,
        annually: 0,
        locale: 'en-US',
      },
    },
    stats: ['30-day trial access', 'No credit card required', 'Upgrade anytime'],
    features: [
      { text: 'Free trial:', included: true },
      { text: 'Business Plus features during evaluation', included: true },
      { text: 'AI summaries, translation, clause explanations, and risk analysis during evaluation', included: true },
      { text: 'Core document workflows, templates, and reminders', included: true },
      { text: 'Multi-team collaboration and governance controls for evaluation', included: true },
      { text: 'Upgrade to Business, Business Plus, or Enterprise when ready', included: true },
    ],
    ctaLabel: 'Start Free Trial',
    ctaHref: '/register',
    isPopular: false,
    icon: Briefcase,
    description:
      'Start with a free trial workspace that includes Business Plus features during evaluation, then choose the paid plan that fits your team.',
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'For small teams needing the first paid team plan',
    prices: {
      india: {
        currencyCode: 'INR',
        monthly: 599,
        annually: 499,
        locale: 'en-IN',
      },
      international: {
        currencyCode: 'USD',
        monthly: 7,
        annually: 5,
        locale: 'en-US',
      },
    },
    stats: ['One shared team', 'Reusable templates', 'AI selected summaries'],
    features: [
      { text: 'Core features:', included: true },
      { text: 'One shared team for team-based routing and collaboration', included: true },
      { text: 'Reusable templates & advanced fields', included: true },
      { text: 'AI selected-text summaries', included: true },
      { text: 'Automated reminders for repeat send flows', included: true },
      { text: 'Workspace roles (Owner/Admin/Auditor/User) with owner-managed member invites', included: true },
      { text: 'Shared workspace audit trail', included: true },
      { text: 'Centralized billing ownership', included: true },
      { text: 'Document sending', included: true },
    ],
    ctaLabel: 'Choose Business',
    ctaHref: '/register',
    isPopular: false,
    icon: Building2,
    description:
      'Move into a collaborative workspace with audit visibility, member roles, and the foundations for secure team use.',
  },
  {
    id: 'business_plus',
    name: 'Business Plus',
    tagline: 'For growing teams that need multi-team collaboration',
    prices: {
      india: {
        currencyCode: 'INR',
        monthly: 999,
        annually: 799,
        locale: 'en-IN',
      },
      international: {
        currencyCode: 'USD',
        monthly: 12,
        annually: 10,
        locale: 'en-US',
      },
    },
    stats: ['Multiple teams', 'AI document intelligence', 'Retention policies'],
    features: [
      { text: 'Everything in Business +', included: true },
      { text: 'Full-document AI summaries, translation, clause explanations, and risk analysis', included: true },
      { text: 'Multiple teams across workspace', included: true },
      { text: 'Workspace branding & notification rules', included: true },
      { text: 'Org-wide document defaults', included: true },
      { text: 'Retention policies', included: true },
      { text: 'Deeper governance settings', included: true },
      { text: 'Multi-team collaboration', included: true },
    ],
    ctaLabel: 'Choose Business Plus',
    ctaHref: '/register',
    isPopular: true,
    icon: Layers,
    description:
      'Add multi-team operations, shared templates, bulk send, workspace defaults, payment requests, and retention controls.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For larger teams needing the strongest governance package',
    prices: {
      india: {
        currencyCode: 'INR',
        monthly: 1699,
        annually: 1499,
        locale: 'en-IN',
      },
      international: {
        currencyCode: 'USD',
        monthly: 20,
        annually: 18,
        locale: 'en-US',
      },
    },
    stats: ['Legal holds', 'AI document intelligence', 'Audit export'],
    features: [
      { text: 'Everything in Business Plus +', included: true },
      { text: 'Legal holds for documents under review', included: true },
      { text: 'Audit export & audit verification', included: true },
      { text: 'Higher included seat capacity', included: true },
      { text: 'Compliance-grade record preservation', included: true },
    ],
    ctaLabel: 'Choose Enterprise',
    ctaHref: '/register',
    isPopular: false,
    icon: Shield,
    description:
      'Designed for organizations that need legal holds, audit export, verification, and the highest level of packaged oversight.',
  },
  {
    id: 'site_license',
    name: 'Site License',
    tagline: 'For high-volume teams with custom commercial terms',
    prices: {
      india: {
        currencyCode: 'INR',
        monthly: null,
        annually: null,
        locale: 'en-IN',
      },
      international: {
        currencyCode: 'USD',
        monthly: null,
        annually: null,
        locale: 'en-US',
      },
    },
    stats: ['Custom usage terms', 'Sales-assisted onboarding', 'Account planning support'],
    features: [
      { text: 'Everything in Enterprise +', included: true },
      { text: 'AI-assisted document review aligned to custom rollout needs', included: true },
      { text: 'Custom pricing based on usage & rollout', included: true },
      { text: 'Centralized commercial terms', included: true },
      { text: 'Sales-assisted onboarding', included: true },
      { text: 'Account planning support', included: true },
    ],
    ctaLabel: 'Talk to Sales',
    ctaHref: '/request-demo',
    isPopular: false,
    isCustom: true,
    icon: Briefcase,
    description:
      'A sales-led package for larger sending programs, centralized procurement, and custom commercial terms.',
  },
];



export const PRICING_FEATURE_GROUPS: PricingFeatureGroup[] = [
  {
    title: 'Workspace Model',
    rows: [
      {
        feature: 'Trial workspace',
        description: 'A guided evaluation workspace for first-time customers before they move to a paid subscription.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'not_included',
          enterprise: 'not_included',
        },
      },
      {
        feature: 'Workspace',
        description: 'A shared workspace with billing ownership, member management, and centralized controls.',
        availability: {
          trial: 'included',
          business: 'included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'Owner, admin, auditor, and user roles',
        description: 'Role-based access so workspace permissions are not tied to a single super-user.',
        availability: {
          trial: 'included',
          business: 'included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'One shared team',
        description: 'The first collaboration layer inside a workspace.',
        availability: {
          trial: 'included',
          business: 'included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'Multiple teams',
        description: 'Create more than one team inside the same workspace.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
    ],
  },
  {
    title: 'AI Document Intelligence',
    rows: [
      {
        feature: 'AI selected-text summaries',
        description: 'Summarize selected clauses or passages while reviewing a document.',
        availability: {
          trial: 'included',
          business: 'included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'Full-document AI summaries',
        description: 'Generate summaries for complete uploaded documents, including longer PDFs.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'AI translation',
        description: 'Translate selected text or full documents for faster multilingual review.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'AI clause explanations',
        description: 'Explain dense contractual language, obligations, renewals, and unusual wording.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'AI risk analysis',
        description: 'Surface possible risks, missing details, and negotiation points before signature.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
    ],
  },
  {
    title: 'Signing And Productivity',
    rows: [
      {
        feature: 'Document sending, templates, reminders, and advanced fields',
        description: 'Core send-and-sign workflow for repeatable team use cases.',
        availability: {
          trial: 'included',
          business: 'included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'User settings, signing defaults, and notification preferences',
        description: 'Manage personal signing defaults, event alerts, and account preferences from the account area.',
        availability: {
          trial: 'included',
          business: 'included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'Shared workspace audit trail',
        description: 'A workspace-wide log for actions that need to be reviewed beyond a single user account.',
        availability: {
          trial: 'included',
          business: 'included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
    ],
  },
  {
    title: 'Admin And Governance',
    rows: [
      {
        feature: 'Workspace branding',
        description: 'Brand name, support email, and visual identity applied at the workspace level.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'Org-wide document and notification defaults',
        description: 'Set sending behavior and default notification behavior once for the whole workspace.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'Retention policies',
        description: 'Define retention rules that apply at the workspace level.',
        availability: {
          trial: 'included',
          business: 'not_included',
          business_plus: 'included',
          enterprise: 'included',
        },
      },
      {
        feature: 'Legal holds, audit export, and audit verification',
        description: 'Preserve documents under hold, export audit evidence, and verify audit chains from the product.',
        availability: {
          trial: 'not_included',
          business: 'not_included',
          business_plus: 'not_included',
          enterprise: 'included',
        },
      },
    ],
  },
];

export const CURRENT_PACKAGE_MAPPING: CurrentPackageMapping[] = [
  {
    tier: 'trial',
    title: 'Free Trial',
    status: 'ready',
    summary:
      'New customers start in a free trial workspace with Business Plus features during evaluation, including AI document intelligence, so they can explore the full product before choosing a paid subscription.',
    notes: [
      'Trial workspaces are owner-led and can upgrade directly into Business, Business Plus, or Enterprise.',
      'The free trial includes Business Plus-style AI, collaboration, and governance features during the evaluation window.',
    ],
  },
  {
    tier: 'business',
    title: 'Business',
    status: 'ready',
    summary: 'Business is the first paid team plan: one shared team, reusable templates, AI selected-text summaries, advanced fields, audit trail, and seat-aware member access.',
    notes: [
      'Business is the minimum paid tier for long-term shared workspace workflows.',
      'Business workspaces can create one shared team, use the workspace audit trail, and summarize selected document text with AI.',
      'Business Plus is where multi-team administration and heavier governance controls begin.',
    ],
  },
  {
    tier: 'business_plus',
    title: 'Business Plus',
    status: 'ready',
    summary: 'Business Plus is the multi-team tier: it removes the single-team cap and adds full AI document intelligence plus stronger shared controls for growing workspaces.',
    notes: [
      'Business Plus removes the single-team cap and supports multi-team workspace administration.',
      'Full-document AI summaries, translation, clause explanations, and risk analysis stay packaged here.',
      'Workspace branding, notification defaults, and retention policies stay packaged here.',
    ],
  },
  {
    tier: 'enterprise',
    title: 'Enterprise',
    status: 'ready',
    summary:
      'Enterprise is the highest packaged plan, combining Business Plus controls with legal holds, audit export, and audit verification for larger governed workspaces.',
    notes: [
      'Enterprise keeps the Business Plus collaboration foundation and adds the preserved-record and audit-evidence controls needed by more governed teams.',
      'Enterprise is the only tier that can export and verify audit chains from the product UI.',
      'Enterprise keeps the strongest built-in governance controls in the packaged self-serve lineup.',
    ],
  },
];

export function getPricingMarketDefinition(market: BillingMarket) {
  return BILLING_MARKET_OPTIONS.find((option) => option.id === market) ?? BILLING_MARKET_OPTIONS[1];
}

export function getPlanPriceValue(
  plan: PricingPlan,
  billingCycle: BillingCycle,
  billingMarket: BillingMarket = 'international'
): number | null {
  const pricing = plan.prices[billingMarket];
  return billingCycle === 'monthly' ? pricing.monthly : pricing.annually;
}

export function getPlanChargeValue(
  plan: PricingPlan,
  billingCycle: BillingCycle,
  billingMarket: BillingMarket = 'international'
): number | null {
  const value = getPlanPriceValue(plan, billingCycle, billingMarket);

  if (value === null) {
    return null;
  }

  return billingCycle === 'annually' ? value * 12 : value;
}

export function formatPlanCurrencyValue(
  plan: PricingPlan,
  billingMarket: BillingMarket,
  value: number
): string {
  const pricing = plan.prices[billingMarket];

  if (value === 0) {
    return pricing.currencyCode === 'INR' ? '₹0' : '$0';
  }

  return new Intl.NumberFormat(pricing.locale, {
    style: 'currency',
    currency: pricing.currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPlanDisplayPrice(
  plan: PricingPlan,
  billingCycle: BillingCycle,
  billingMarket: BillingMarket = 'international'
): string {
  const value = getPlanPriceValue(plan, billingCycle, billingMarket);

  if (value === null) return 'Custom';
  return formatPlanCurrencyValue(plan, billingMarket, value);
}

export function formatPlanPrice(
  plan: PricingPlan,
  billingCycle: BillingCycle,
  billingMarket: BillingMarket = 'international'
): string {
  const value = getPlanChargeValue(plan, billingCycle, billingMarket);

  if (value === null) return 'Custom';
  return formatPlanCurrencyValue(plan, billingMarket, value);
}

export function getPlanDisplayBillingUnitLabel(): string {
  return '/user/mo';
}

export function getPlanBillingUnitLabel(billingCycle: BillingCycle): string {
  return billingCycle === 'annually' ? '/user/year' : '/user/mo';
}

export function getPlanDisplayBillingCaption(billingCycle: BillingCycle): string {
  return billingCycle === 'annually' ? 'Billed annually' : 'Billed monthly';
}

export function getPlanBillingCaption(
  plan: PricingPlan,
  billingCycle: BillingCycle,
  billingMarket: BillingMarket = 'international'
): string | null {
  if (plan.isCustom) {
    return null;
  }

  if (billingCycle === 'monthly') {
    return 'Billed monthly';
  }

  const equivalentMonthlyValue = getPlanPriceValue(plan, 'annually', billingMarket);
  if (equivalentMonthlyValue === null) {
    return 'Billed annually';
  }

  return `Equivalent to ${formatPlanCurrencyValue(
    plan,
    billingMarket,
    equivalentMonthlyValue
  )}/user/mo, billed annually`;
}

export function getAnnualSavingsPercent(
  plan: PricingPlan,
  billingMarket: BillingMarket = 'international'
): number | null {
  const monthlyValue = plan.prices[billingMarket].monthly;
  const annualMonthlyEquivalentValue = plan.prices[billingMarket].annually;

  if (
    monthlyValue === null ||
    annualMonthlyEquivalentValue === null ||
    monthlyValue <= 0 ||
    annualMonthlyEquivalentValue <= 0 ||
    annualMonthlyEquivalentValue >= monthlyValue
  ) {
    return null;
  }

  return Math.floor(((monthlyValue - annualMonthlyEquivalentValue) / monthlyValue) * 100);
}

export function getMaximumAnnualSavingsPercent(
  billingMarket: BillingMarket = 'international'
): number | null {
  const savings = PRICING_PLANS.map((plan) => getAnnualSavingsPercent(plan, billingMarket)).filter(
    (value): value is number => typeof value === 'number' && value > 0
  );

  if (savings.length === 0) {
    return null;
  }

  return Math.max(...savings);
}

export function getFeatureAvailabilityLabel(value: FeatureAvailability): string {
  switch (value) {
    case 'included':
      return 'Included';
    case 'contact_sales':
      return 'Talk to sales';
    case 'roadmap':
      return 'Planned';
    default:
      return 'Not included';
  }
}

export function getOrganizationPlanLabel(plan?: string | null): string {
  return getOrganizationPlanLabelFromTier(plan);
}

export const getWorkspacePlanLabel = getOrganizationPlanLabel;
