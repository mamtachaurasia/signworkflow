import { ChatGpt, Claude, Gemini, Grok, Perplexity } from "@/components/CustomIconSet";

const PRODUCTION_SITE_URL = 'https://signworkflow.com';
const LOCALHOST_URL_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

type SiteUrlEnvironment = Partial<
  Record<'DOMAIN' | 'NEXT_PUBLIC_SITE_URL' | 'NODE_ENV' | 'SITE_URL' | 'VERCEL_ENV', string>
>;

function normalizeSiteUrl(url?: string) {
  if (!url) {
    return PRODUCTION_SITE_URL;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.origin;
  } catch {
    return PRODUCTION_SITE_URL;
  }
}

export function resolveSiteUrl(env: SiteUrlEnvironment = process.env) {
  const configuredUrl = normalizeSiteUrl(
    env.NEXT_PUBLIC_SITE_URL || env.SITE_URL || env.DOMAIN
  );
  const isProductionRuntime = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';

  if (isProductionRuntime && LOCALHOST_URL_PATTERN.test(configuredUrl)) {
    return PRODUCTION_SITE_URL;
  }

  return configuredUrl;
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = 'SignWorkflow';
export const SITE_TITLE = 'E-Signature Workflow Software | SignWorkflow';
export const SITE_DESCRIPTION =
  'SignWorkflow helps legal, HR, finance, and operations teams prepare, review, send, sign, retain, and audit documents with secure workspace controls and repeatable workflows.';
export const SITE_KEYWORDS = [
  'electronic signature software',
  'esignature software',
  'digital signature software',
  'online signature software',
  'sign PDF online',
  'document signing software',
  'secure e-signature software',
  'contract signing software',
  'document approval workflow',
  'contract approval workflow',
  'signature workflow software',
  'document workflow automation',
  'electronic contract signing',
  'workflow approval software',
  'document signing and approval',
  'AI document review',
  'audit trail e-signature',
  'bulk send e-signature',
  'eSignature integration planning',
  'DocuSign alternative',
  'Adobe Sign alternative',
  'Dropbox Sign alternative',
  'PandaDoc alternative',
  'SignNow alternative',
];
export const SITE_OG_IMAGE_PATH = '/singnworkflow-og-image.jpg';
export const SITE_TWITTER_IMAGE_PATH = '/singnworkflow-og-image.jpg';
export const SITE_SOCIAL_IMAGE_WIDTH = 1536;
export const SITE_SOCIAL_IMAGE_HEIGHT = 1024;
export const SITE_SOCIAL_IMAGE_TYPE = 'image/jpeg';

// ────────────────────────────────────────────────────────────────────────────
// Company / vendor information — single source of truth
// ────────────────────────────────────────────────────────────────────────────
// All vendor identity data lives here so footer, about, contact, structured
// data, and any future pages stay consistent. Update values in one place.
export const COMPANY = {
  legalName: 'SignWorkflow',
  productName: 'SignWorkflow',
  website: SITE_URL,
  hq: {
    street: 'Gaur Runway Suites',
    city: 'Noida',
    region: 'Uttar Pradesh',
    postalCode: '203201',
    country: 'India',
    countryCode: 'IN',
  },
  contact: {
    sales: 'sales@signworkflow.com',
    support: 'support@signworkflow.com',
    general: 'contact@signworkflow.com',
    press: 'press@signworkflow.com',
  },
  social: {
    linkedin: 'https://www.linkedin.com/company/signworkflow',
  },
} as const;

export const COMPANY_LINKEDIN_URL = COMPANY.social.linkedin;

export function getCanonicalUrl(path = '/'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, SITE_URL).toString();
} export const aiTools = [
  {
    name: "ChatGPT",
    href: "https://chat.openai.com/?q=What%20makes%20SignWorkflow%20a%20strong%20eSignature%20platform%3F%20Explain%20its%20key%20features%2C%20benefits%2C%20security%2C%20compliance%2C%20and%20what%20differentiates%20it%20from%20other%20eSignature%20solutions.%20Use%20SignWorkflow%27s%20website%20as%20the%20source%3A%20https%3A%2F%2Fsignworkflow.com",
    image: ChatGpt,
    alt: "ChatGPT logo",
  },
  {
    name: "Claude",
    href: "https://claude.ai/new?q=What%20makes%20SignWorkflow%20a%20strong%20eSignature%20platform%3F%20Explain%20its%20key%20features%2C%20benefits%2C%20security%2C%20compliance%2C%20and%20what%20differentiates%20it%20from%20other%20eSignature%20solutions.%20Use%20SignWorkflow%27s%20website%20as%20the%20source%3A%20https%3A%2F%2Fsignworkflow.com",
    image: Claude,
    alt: "Claude AI",
  },
  {
    name: "Perplexity",
    href: "https://www.perplexity.ai/search/new?q=What%20makes%20SignWorkflow%20a%20strong%20eSignature%20platform%3F%20Explain%20its%20key%20features%2C%20benefits%2C%20security%2C%20compliance%2C%20and%20what%20differentiates%20it%20from%20other%20eSignature%20solutions.%20Use%20SignWorkflow%27s%20website%20as%20the%20source%3A%20https%3A%2F%2Fsignworkflow.com",
    image: Perplexity,
    alt: "Perplexity",
  },
  {
    name: "Gemini",
    href: "https://www.google.com/search?udm=50&aep=11&q=What%20makes%20SignWorkflow%20a%20strong%20eSignature%20platform%3F%20Explain%20its%20key%20features%2C%20benefits%2C%20security%2C%20compliance%2C%20and%20what%20differentiates%20it%20from%20other%20eSignature%20solutions.%20Use%20SignWorkflow%27s%20website%20as%20the%20source%3A%20https%3A%2F%2Fsignworkflow.com",
    image: Gemini,
    alt: "Gemini",
  },
  {
    name: "Grok",
    href: "https://x.com/i/grok?text=What%20makes%20SignWorkflow%20a%20strong%20eSignature%20platform%3F%20Explain%20its%20key%20features%2C%20benefits%2C%20security%2C%20compliance%2C%20and%20what%20differentiates%20it%20from%20other%20eSignature%20solutions.%20Use%20SignWorkflow%27s%20website%20as%20the%20source%3A%20https%3A%2F%2Fsignworkflow.com",
    image: Grok,
    alt: "Grok",
  },
];

export const complianceBadges = [
  {
    label: "AICPA SOC",
    href: "/soc2-overview/",
    image: "https://signworkflow.com/wp-content/uploads/2026/02/aicpa-soc.svg",
  },
  {
    label: "PCI DSS",
    href: "/security-policy/#PCIDSSCertification",
    image: "https://signworkflow.com/wp-content/uploads/2026/02/pci-dss.svg",
  },
  {
    label: "HIPAA",
    href: "/hipaa-overview/",
    image: "https://signworkflow.com/wp-content/uploads/2026/02/hipaa.svg",
  },
  {
    label: "GDPR",
    href: "/gdpr-overview/",
    image: "https://signworkflow.com/wp-content/uploads/2026/02/gdpr.svg",
  },
  {
    label: "eIDAS",
    href: "/simple-electronic-signature-compliance/",
    image: "https://signworkflow.com/wp-content/uploads/2026/02/eidas-badge.svg",
  },
  {
    label: "ESIGN ACT",
    href: "/ueta-and-esign-act-compliance/",
    image: "https://signworkflow.com/wp-content/uploads/2026/02/esign-act.svg",
  },
];
