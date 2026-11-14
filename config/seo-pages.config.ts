import type { StructuredFaq } from '@/lib/structured-data';

export type SeoPageGroup = 'use-cases' | 'integrations' | 'alternatives' | 'compare';

export type SeoLandingPage = {
  group: SeoPageGroup;
  slug: string;
  name: string;
  eyebrow: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  audience: string;
  heroBullets: string[];
  painTitle: string;
  painPoints: string[];
  outcomeTitle: string;
  outcomes: Array<{ title: string; description: string }>;
  processTitle: string;
  steps: Array<{ title: string; description: string }>;
  proofTitle: string;
  proofPoints: string[];
  faqs: StructuredFaq[];
  relatedLinks: Array<{ label: string; href: string }>;
  statusLabel?: string;
  comparisonRows?: Array<{ feature: string; signWorkflow: string; alternative: string }>;
};

type UseCaseConfig = {
  slug: string;
  name: string;
  audience: string;
  documentNoun: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  specificBenefit: string;
};

type IntegrationAvailability = 'cloud_export' | 'public_api' | 'planning';

type IntegrationConfig = {
  slug: string;
  name: string;
  audience: string;
  system: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  statusLabel: string;
  workflowVerb: string;
  availability: IntegrationAvailability;
};

type AlternativeConfig = {
  slug: string;
  competitor: string;
  audience: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  competitorPositioning: string;
};

const commonRelatedLinks = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Security', href: '/security' },
  { label: 'Request demo', href: '/request-demo' },
];

function makeUseCasePage(config: UseCaseConfig): SeoLandingPage {
  return {
    group: 'use-cases',
    slug: config.slug,
    name: config.name,
    eyebrow: 'Use case',
    title: `${config.name} eSignature Workflows`,
    metaTitle: `${config.name} eSignature Software | SignWorkflow`,
    metaDescription: `Send, approve, sign, and retain ${config.documentNoun} with SignWorkflow. Built for ${config.audience} that need secure e-signatures and audit-ready workflows.`,
    description: `SignWorkflow helps ${config.audience} prepare, route, sign, and retain ${config.documentNoun} without scattering approvals across email, chat, and shared folders.`,
    primaryKeyword: config.primaryKeyword,
    secondaryKeywords: config.secondaryKeywords,
    audience: config.audience,
    heroBullets: [
      `Target workflow: ${config.primaryKeyword}`,
      'Approval routing before signature',
      'Templates, reminders, and reusable recipients',
      'Completed records with audit context',
    ],
    painTitle: `Why ${config.name.toLowerCase()} need a workflow-first signing process`,
    painPoints: [
      `${config.name} often wait on internal review before anyone can send a signature request.`,
      `Teams lose time when ${config.documentNoun} are rebuilt manually for each recipient.`,
      'Status follow-up becomes messy when approvals, reminders, and signed PDFs live in different tools.',
      'Completed records need enough evidence to support HR, legal, finance, and operations review later.',
    ],
    outcomeTitle: `What SignWorkflow improves for ${config.name.toLowerCase()}`,
    outcomes: [
      {
        title: 'Reusable document starts',
        description: `Launch ${config.documentNoun} from templates so the sender does not recreate fields, roles, and instructions each time.`,
      },
      {
        title: 'Clear signer ownership',
        description: 'Assign signers, approvers, and viewers with visible status so the team knows what is still pending.',
      },
      {
        title: 'Review-ready records',
        description: `Keep the signed ${config.documentNoun} together with activity history, retention context, and workspace ownership.`,
      },
    ],
    processTitle: `A practical ${config.name.toLowerCase()} workflow`,
    steps: [
      {
        title: 'Prepare the template',
        description: `Upload the document, place signing fields, and save common ${config.name.toLowerCase()} layouts for reuse.`,
      },
      {
        title: 'Route for review',
        description: 'Add approvers or internal viewers before the signing request goes to the final recipient.',
      },
      {
        title: 'Send, remind, and retain',
        description: `Send the request, track completion, and keep the final ${config.documentNoun} easy to find.`,
      },
    ],
    proofTitle: 'Why teams choose this workflow',
    proofPoints: [
      config.specificBenefit,
      'Useful for teams moving from one-off e-signature links to repeatable document workflows.',
      'Keeps document ownership, status, and final records easier to manage as volume grows.',
    ],
    faqs: [
      {
        question: `Can I send ${config.documentNoun} for electronic signature?`,
        answer: `Yes. SignWorkflow lets teams prepare ${config.documentNoun}, assign recipients, collect electronic signatures, and keep the completed document record in the workspace.`,
      },
      {
        question: `Can ${config.name.toLowerCase()} include an approval step?`,
        answer: 'Yes. Teams can add internal review and signer roles so approval happens before or alongside the signing request.',
      },
      {
        question: 'Can I reuse the same workflow?',
        answer: 'Yes. Templates and repeatable recipient patterns help teams avoid rebuilding common signing processes from scratch.',
      },
      {
        question: 'Where should users go next?',
        answer: 'Most teams start with the pricing page, request a demo, or compare SignWorkflow against a larger e-signature platform.',
      },
    ],
    relatedLinks: [
      { label: 'Use cases', href: '/use-cases' },
      { label: 'DocuSign alternative', href: '/alternatives/docusign' },
      ...commonRelatedLinks,
    ],
  };
}

function makeIntegrationPage(config: IntegrationConfig): SeoLandingPage {
  const isSupportedCloudExport = config.availability === 'cloud_export';
  const isPublicApi = config.availability === 'public_api';
  const isShipped = isSupportedCloudExport || isPublicApi;
  const handoffDescription = isSupportedCloudExport
    ? `Connect SignWorkflow document signing workflows with ${config.system}. Export completed records through the supported cloud-storage path.`
    : isPublicApi
      ? `Use the SignWorkflow public API and signed webhooks to ${config.workflowVerb}.`
      : `Plan how SignWorkflow document signing workflows could fit with ${config.system}. This is an integration-planning guide, not a currently shipped native connector.`;

  return {
    group: 'integrations',
    slug: config.slug,
    name: config.name,
    eyebrow: 'Integration',
    title: `${config.name} eSignature Workflows`,
    metaTitle: `${config.name} eSignature Integration | SignWorkflow`,
    metaDescription: handoffDescription,
    description: isShipped
      ? `Use SignWorkflow with ${config.system} to ${config.workflowVerb} while preserving signer status, audit context, and workspace control.`
      : `Use this guide to evaluate how SignWorkflow could ${config.workflowVerb} while preserving signer status, audit context, and workspace control.`,
    primaryKeyword: config.primaryKeyword,
    secondaryKeywords: config.secondaryKeywords,
    audience: config.audience,
    statusLabel: config.statusLabel,
    heroBullets: [
      `${config.statusLabel} integration path`,
      isShipped ? 'Available in SignWorkflow today' : 'Secure e-signature workflow planning',
      'Completed document handoff strategy',
      'Audit context stays visible',
    ],
    painTitle: `Why ${config.system} teams need controlled signing handoffs`,
    painPoints: [
      'Documents often start in one system but need approvals and signatures in another.',
      'Manual downloads and uploads make it harder to prove which file was signed.',
      'Operations teams need signed PDFs, audit trails, and owner context to arrive in the right place.',
      'Automation should reduce follow-up without weakening security or access boundaries.',
    ],
    outcomeTitle: `What a ${config.name} workflow should support`,
    outcomes: [
      {
        title: 'Cleaner handoffs',
        description: `Move completed signing records toward ${config.system} without losing the source workflow history.`,
      },
      {
        title: 'Better operational visibility',
        description: 'Keep senders, approvers, and workspace admins aligned on status before and after signature.',
      },
      {
        title: 'Scalable automation path',
        description: 'Use the public API, signed webhooks, and supported exports to reduce repeated manual handling without overstating native connectors.',
      },
    ],
    processTitle: `A practical ${config.system} workflow`,
    steps: [
      {
        title: 'Start from the source document',
        description: `Select or prepare the agreement associated with ${config.system} and move it into a controlled signing flow.`,
      },
      {
        title: 'Collect approval and signature',
        description: 'Route the document through reviewers, signers, and workspace roles with clear status tracking.',
      },
      {
        title: 'Return the completed record',
        description: `Store or reference the signed PDF and audit context in the system where the team continues its work.`,
      },
    ],
    proofTitle: 'Why this connection matters',
    proofPoints: [
      `${config.name} workflows reduce context switching when signing needs to fit an existing system of record.`,
      'Teams can combine native cloud exports, the public API, and signed webhooks while keeping unsupported connectors clearly labeled.',
      'The workflow keeps pricing, security, and rollout decisions close to the integration conversation.',
    ],
    faqs: [
      {
        question: `Does SignWorkflow integrate with ${config.system}?`,
        answer: `${config.statusLabel}. This page explains the recommended workflow path for connecting SignWorkflow signing activity with ${config.system} while keeping completed records and audit context clear.`,
      },
      {
        question: `Can completed documents be exported to ${config.system}?`,
        answer: 'For supported cloud-storage workflows, completed files can be exported to a connected account. For other systems, use the public API and signed webhooks; this does not mean a native connector is available.',
      },
      {
        question: 'Can I automate signature status updates?',
        answer: 'Use signed webhooks for supported document lifecycle events, and use the public API to create, prepare, send, inspect, retry delivery, and download completed documents. Consumers should verify signatures and handle at-least-once delivery safely.',
      },
      {
        question: 'Should I use an integration or the API?',
        answer: 'Use a native cloud export path when the handoff is simple. Use the public API and signed webhooks for custom business rules or status handoffs. Embedded signing and CRM-specific native connectors are not currently provided.',
      },
    ],
    relatedLinks: [
      { label: 'All integrations', href: '/integrations' },
      { label: 'Signature API', href: '/integrations/api' },
      { label: 'Use cases', href: '/use-cases' },
      ...commonRelatedLinks,
    ],
  };
}

function makeAlternativePage(config: AlternativeConfig): SeoLandingPage {
  return {
    group: 'alternatives',
    slug: config.slug,
    name: `${config.competitor} Alternative`,
    eyebrow: 'Alternative',
    title: `${config.competitor} Alternative for Workflow-First eSignature Teams`,
    metaTitle: `${config.competitor} Alternative | SignWorkflow`,
    metaDescription: `Compare SignWorkflow as a ${config.competitor} alternative for teams that need e-signatures, approvals, AI review, templates, audit trails, and workspace controls.`,
    description: `SignWorkflow is positioned for ${config.audience} that want secure electronic signatures plus approval workflows, AI-assisted document review, team access, and better records after signature.`,
    primaryKeyword: config.primaryKeyword,
    secondaryKeywords: config.secondaryKeywords,
    audience: config.audience,
    heroBullets: [
      `Targets: ${config.primaryKeyword}`,
      'Workflow-first e-signature positioning',
      'AI review before signature',
      'Workspace governance after completion',
    ],
    painTitle: `Why teams compare SignWorkflow with ${config.competitor}`,
    painPoints: [
      config.competitorPositioning,
      'Many teams need approvals, templates, retention, and audit context in the same operating flow.',
      'Buyers often compare price, implementation effort, governance depth, and fit for recurring document work.',
      'A smaller team may want a focused platform before adopting a broad enterprise agreement suite.',
    ],
    outcomeTitle: 'Where SignWorkflow is designed to stand out',
    outcomes: [
      {
        title: 'Document workflow before signature',
        description: 'Prepare, review, route, and understand documents before they are sent to recipients.',
      },
      {
        title: 'Workspace control after signature',
        description: 'Keep ownership, records, retention, and audit visibility close to the completed document.',
      },
      {
        title: 'Focused rollout for growing teams',
        description: 'Start with a practical signing workflow and expand into templates, teams, and governance as adoption grows.',
      },
    ],
    processTitle: `How to evaluate SignWorkflow against ${config.competitor}`,
    steps: [
      {
        title: 'Pick one recurring workflow',
        description: 'Use a real NDA, offer letter, vendor agreement, sales contract, or lease workflow for evaluation.',
      },
      {
        title: 'Compare the complete path',
        description: 'Score document prep, approval routing, recipient experience, completed records, pricing, and admin controls.',
      },
      {
        title: 'Review operational fit',
        description: 'Decide whether the team needs a broad enterprise agreement suite or a focused workflow-first signing platform.',
      },
    ],
    proofTitle: 'How this comparison helps buyers',
    proofPoints: [
      `Teams comparing ${config.competitor} usually need a clear view of workflow fit, implementation effort, and governance needs.`,
      'This page connects the evaluation to pricing, security, and concrete use-case pages.',
      'The copy avoids unsupported feature claims and focuses on buyer-fit criteria.',
    ],
    faqs: [
      {
        question: `Is SignWorkflow a ${config.competitor} alternative?`,
        answer: `Yes. SignWorkflow can be evaluated as a ${config.competitor} alternative when your team needs secure e-signatures plus workflow routing, AI review, workspace access, and audit-ready records.`,
      },
      {
        question: `What should I compare before switching from ${config.competitor}?`,
        answer: 'Compare recurring workflow fit, template setup, signer experience, admin controls, retention needs, integration paths, support expectations, and total cost.',
      },
      {
        question: 'Which teams are the best fit for SignWorkflow?',
        answer: 'SignWorkflow is strongest for legal, HR, finance, operations, sales, procurement, and other teams that run repeatable document workflows.',
      },
      {
        question: 'Can I run a pilot before deciding?',
        answer: 'Yes. Start with one document type, one owner, and one team so you can measure turnaround time, signer completion, and record quality.',
      },
    ],
    comparisonRows: makeComparisonRows(config.competitor),
    relatedLinks: [
      { label: `${config.competitor} comparison`, href: `/compare/signworkflow-vs-${config.slug}` },
      { label: 'All alternatives', href: '/alternatives' },
      { label: 'Why SignWorkflow', href: '/why-signWorkflow' },
      ...commonRelatedLinks,
    ],
  };
}

function makeComparisonRows(competitor: string) {
  return [
    {
      feature: 'Primary fit',
      signWorkflow: 'Workflow-first e-signature platform for recurring team document processes.',
      alternative: `${competitor} is usually evaluated as an established e-signature or agreement platform.`,
    },
    {
      feature: 'Before-signature work',
      signWorkflow: 'AI document review, approval routing, templates, and recipient setup in one flow.',
      alternative: 'Evaluate how review, approval, and preparation are packaged for your plan.',
    },
    {
      feature: 'After-signature control',
      signWorkflow: 'Audit visibility, retention context, workspace ownership, and completed document handling.',
      alternative: 'Review repository, reporting, retention, and admin features against your requirements.',
    },
    {
      feature: 'Rollout path',
      signWorkflow: 'Start with one document workflow, then expand into teams and governance.',
      alternative: 'May fit broader enterprise agreement programs depending on budget and implementation needs.',
    },
  ];
}

function makeComparisonPage(alternative: SeoLandingPage): SeoLandingPage {
  const competitor = alternative.name.replace(' Alternative', '');

  return {
    ...alternative,
    group: 'compare',
    slug: `signworkflow-vs-${alternative.slug}`,
    name: `SignWorkflow vs ${competitor}`,
    eyebrow: 'Comparison',
    title: `SignWorkflow vs ${competitor}`,
    metaTitle: `SignWorkflow vs ${competitor} | eSignature Comparison`,
    metaDescription: `Compare SignWorkflow vs ${competitor} for e-signatures, approval workflows, AI document review, templates, audit trails, workspace controls, and rollout fit.`,
    primaryKeyword: `SignWorkflow vs ${competitor}`,
    relatedLinks: [
      { label: `${competitor} alternative`, href: `/alternatives/${alternative.slug}` },
      { label: 'All comparisons', href: '/compare' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Request demo', href: '/request-demo' },
    ],
  };
}

export const USE_CASE_PAGES = [
  makeUseCasePage({
    slug: 'offer-letters',
    name: 'Offer Letters',
    audience: 'HR, recruiting, and people operations teams',
    documentNoun: 'offer letters and employment agreements',
    primaryKeyword: 'offer letter eSignature',
    secondaryKeywords: ['sign offer letter online', 'employment offer signing', 'HR document signing'],
    specificBenefit: 'Great for recruiting teams that need fast candidate acceptance without losing approval control.',
  }),
  makeUseCasePage({
    slug: 'nda-signing',
    name: 'NDA Signing',
    audience: 'legal, sales, partnerships, and vendor teams',
    documentNoun: 'NDAs and confidentiality agreements',
    primaryKeyword: 'NDA signing software',
    secondaryKeywords: ['sign NDA online', 'confidentiality agreement signature', 'NDA eSignature'],
    specificBenefit: 'Useful when NDAs need to move quickly before sales calls, vendor discussions, or hiring conversations.',
  }),
  makeUseCasePage({
    slug: 'sales-contracts',
    name: 'Sales Contracts',
    audience: 'sales, revenue operations, finance, and legal teams',
    documentNoun: 'sales contracts, order forms, MSAs, and SOWs',
    primaryKeyword: 'sales contract signing software',
    secondaryKeywords: ['contract signing software', 'sales agreement eSignature', 'online agreement signing'],
    specificBenefit: 'Built for teams trying to reduce delays between final commercial approval and customer signature.',
  }),
  makeUseCasePage({
    slug: 'hr-onboarding',
    name: 'HR Onboarding',
    audience: 'HR teams and employee onboarding owners',
    documentNoun: 'onboarding packets, policy acknowledgements, and employee forms',
    primaryKeyword: 'HR onboarding eSignature',
    secondaryKeywords: ['employee onboarding automation', 'HR document workflow', 'employee document signing'],
    specificBenefit: 'Helps HR teams send repeatable onboarding packets while keeping status visible for managers.',
  }),
  makeUseCasePage({
    slug: 'vendor-agreements',
    name: 'Vendor Agreements',
    audience: 'procurement, finance, legal, and operations teams',
    documentNoun: 'vendor agreements, SOWs, purchase terms, and compliance forms',
    primaryKeyword: 'vendor agreement eSignature',
    secondaryKeywords: ['vendor agreement software', 'procurement document workflow', 'vendor onboarding signing'],
    specificBenefit: 'Strong fit for procurement teams that need fewer manual vendor-contract follow-ups.',
  }),
  makeUseCasePage({
    slug: 'employee-documents',
    name: 'Employee Documents',
    audience: 'people operations, HR compliance, and department leaders',
    documentNoun: 'employee documents, acknowledgements, and internal forms',
    primaryKeyword: 'employee document signing',
    secondaryKeywords: ['employee documents eSignature', 'policy acknowledgement software', 'HR forms signing'],
    specificBenefit: 'Supports recurring employee acknowledgements where completion tracking matters.',
  }),
  makeUseCasePage({
    slug: 'invoices',
    name: 'Invoices',
    audience: 'finance, accounting, procurement, and operations teams',
    documentNoun: 'invoices, payment approvals, and finance forms',
    primaryKeyword: 'invoice approval eSignature',
    secondaryKeywords: ['invoice approval software', 'sign invoices online', 'finance approval workflow'],
    specificBenefit: 'Useful for finance workflows where signature, approval, and payment context need to stay connected.',
  }),
  makeUseCasePage({
    slug: 'purchase-orders',
    name: 'Purchase Orders',
    audience: 'procurement, finance, vendor management, and operations teams',
    documentNoun: 'purchase orders, procurement approvals, and supplier documents',
    primaryKeyword: 'purchase order eSignature',
    secondaryKeywords: ['purchase order approval workflow', 'PO signing software', 'procurement signature workflow'],
    specificBenefit: 'Helps purchasing teams standardize approvals before a supplier receives final paperwork.',
  }),
  makeUseCasePage({
    slug: 'lease-agreements',
    name: 'Lease Agreements',
    audience: 'real estate, property management, legal, and operations teams',
    documentNoun: 'lease agreements, rental forms, and property documents',
    primaryKeyword: 'lease agreement eSignature',
    secondaryKeywords: ['sign lease online', 'rental agreement signature', 'real estate document signing'],
    specificBenefit: 'Helpful for property workflows where multiple parties need a clean mobile signing experience.',
  }),
];

export const INTEGRATION_PAGES = [
  makeIntegrationPage({
    slug: 'google-drive',
    name: 'Google Drive',
    audience: 'teams using Google Drive for document storage',
    system: 'Google Drive',
    primaryKeyword: 'Google Drive eSignature integration',
    secondaryKeywords: ['sign documents from Google Drive', 'Google Drive signed PDF export', 'Google Workspace eSignature'],
    statusLabel: 'Supported cloud export',
    workflowVerb: 'export completed agreements to the connected Drive account',
    availability: 'cloud_export',
  }),
  makeIntegrationPage({
    slug: 'dropbox',
    name: 'Dropbox',
    audience: 'teams using Dropbox for shared document storage',
    system: 'Dropbox',
    primaryKeyword: 'Dropbox eSignature integration',
    secondaryKeywords: ['sign documents from Dropbox', 'Dropbox signed PDF export', 'Dropbox document workflow'],
    statusLabel: 'Supported cloud export',
    workflowVerb: 'export signed records to the connected Dropbox account after completion',
    availability: 'cloud_export',
  }),
  makeIntegrationPage({
    slug: 'onedrive',
    name: 'OneDrive',
    audience: 'Microsoft 365 teams planning document handoffs',
    system: 'OneDrive',
    primaryKeyword: 'OneDrive eSignature integration',
    secondaryKeywords: ['sign documents from OneDrive', 'Microsoft 365 eSignature workflow', 'OneDrive signed document export'],
    statusLabel: 'Workflow planning guide',
    workflowVerb: 'plan signed-document storage and Microsoft 365 handoffs',
    availability: 'planning',
  }),
  makeIntegrationPage({
    slug: 'zapier',
    name: 'Zapier',
    audience: 'operations teams automating no-code document workflows',
    system: 'Zapier',
    primaryKeyword: 'Zapier eSignature integration',
    secondaryKeywords: ['automate signature requests', 'Zapier document signing workflow', 'eSignature automation'],
    statusLabel: 'Automation planning guide',
    workflowVerb: 'connect signature triggers to the apps your team already uses',
    availability: 'planning',
  }),
  makeIntegrationPage({
    slug: 'slack',
    name: 'Slack',
    audience: 'teams coordinating approvals and follow-up in Slack',
    system: 'Slack',
    primaryKeyword: 'Slack eSignature integration',
    secondaryKeywords: ['Slack signature notifications', 'document approval Slack workflow', 'Slack contract signing'],
    statusLabel: 'Workflow planning guide',
    workflowVerb: 'route signing status and approval reminders into team conversations',
    availability: 'planning',
  }),
  makeIntegrationPage({
    slug: 'microsoft-teams',
    name: 'Microsoft Teams',
    audience: 'Microsoft Teams users coordinating document approvals',
    system: 'Microsoft Teams',
    primaryKeyword: 'Microsoft Teams eSignature integration',
    secondaryKeywords: ['Teams document approval workflow', 'Teams signature notifications', 'Microsoft eSignature workflow'],
    statusLabel: 'Workflow planning guide',
    workflowVerb: 'bring signing updates into Microsoft Teams collaboration workflows',
    availability: 'planning',
  }),
  makeIntegrationPage({
    slug: 'salesforce',
    name: 'Salesforce',
    audience: 'sales and revenue operations teams',
    system: 'Salesforce',
    primaryKeyword: 'Salesforce eSignature integration',
    secondaryKeywords: ['Salesforce contract signing', 'CRM signature workflow', 'sales agreement automation'],
    statusLabel: 'Workflow planning guide',
    workflowVerb: 'connect opportunities, contracts, and signed records to CRM processes',
    availability: 'planning',
  }),
  makeIntegrationPage({
    slug: 'hubspot',
    name: 'HubSpot',
    audience: 'sales, marketing, and customer operations teams',
    system: 'HubSpot',
    primaryKeyword: 'HubSpot eSignature integration',
    secondaryKeywords: ['HubSpot contract signing', 'HubSpot document workflow', 'CRM eSignature workflow'],
    statusLabel: 'Workflow planning guide',
    workflowVerb: 'connect deal-stage events with signature requests and completed agreements',
    availability: 'planning',
  }),
  makeIntegrationPage({
    slug: 'api',
    name: 'Signature API',
    audience: 'developers and product teams embedding signing into apps',
    system: 'SignWorkflow API',
    primaryKeyword: 'signature API',
    secondaryKeywords: ['eSignature API', 'document signing integration', 'signature webhook'],
    statusLabel: 'Public API and signed webhooks',
    workflowVerb: 'upload documents, prepare fields, send signing requests, inspect status, download completed PDFs, and receive signed lifecycle events',
    availability: 'public_api',
  }),
];

export const ALTERNATIVE_PAGES = [
  makeAlternativePage({
    slug: 'docusign',
    competitor: 'DocuSign',
    audience: 'growing teams comparing established e-signature platforms',
    primaryKeyword: 'DocuSign alternative',
    secondaryKeywords: ['best DocuSign alternative', 'DocuSign competitor', 'workflow-first eSignature'],
    competitorPositioning: 'DocuSign is a recognized market leader, so buyers often compare whether they need a broad agreement platform or a focused team workflow tool.',
  }),
  makeAlternativePage({
    slug: 'adobe-sign',
    competitor: 'Adobe Acrobat Sign',
    audience: 'teams that want e-signatures connected to document review and workflow controls',
    primaryKeyword: 'Adobe Sign alternative',
    secondaryKeywords: ['Adobe Acrobat Sign alternative', 'Adobe eSignature competitor', 'PDF signing alternative'],
    competitorPositioning: 'Adobe Acrobat Sign is often evaluated by PDF-heavy teams, especially where existing Adobe and Microsoft workflows matter.',
  }),
  makeAlternativePage({
    slug: 'dropbox-sign',
    competitor: 'Dropbox Sign',
    audience: 'teams that want simple signing plus deeper workflow governance',
    primaryKeyword: 'Dropbox Sign alternative',
    secondaryKeywords: ['HelloSign alternative', 'Dropbox Sign competitor', 'Dropbox Sign vs SignWorkflow'],
    competitorPositioning: 'Dropbox Sign is often considered for straightforward signature requests and document storage-adjacent workflows.',
  }),
  makeAlternativePage({
    slug: 'hellosign',
    competitor: 'HelloSign',
    audience: 'buyers still searching by the HelloSign brand name',
    primaryKeyword: 'HelloSign alternative',
    secondaryKeywords: ['Dropbox Sign alternative', 'HelloSign competitor', 'HelloSign replacement'],
    competitorPositioning: 'Many searchers still use the HelloSign name when looking for Dropbox Sign alternatives or replacements.',
  }),
  makeAlternativePage({
    slug: 'signnow',
    competitor: 'SignNow',
    audience: 'operations teams comparing affordable signing and API options',
    primaryKeyword: 'SignNow alternative',
    secondaryKeywords: ['airSlate SignNow alternative', 'SignNow competitor', 'embedded signing alternative'],
    competitorPositioning: 'SignNow is commonly evaluated by teams looking for templates, embedded signing, and value-oriented e-signature plans.',
  }),
  makeAlternativePage({
    slug: 'pandadoc',
    competitor: 'PandaDoc',
    audience: 'sales and operations teams comparing document automation platforms',
    primaryKeyword: 'PandaDoc alternative',
    secondaryKeywords: ['PandaDoc competitor', 'proposal signing alternative', 'contract workflow alternative'],
    competitorPositioning: 'PandaDoc is often evaluated by sales-led teams that need proposals, quotes, and document automation around revenue workflows.',
  }),
];

export const COMPARISON_PAGES = ALTERNATIVE_PAGES.map(makeComparisonPage);

export const SEO_LANDING_PAGES = [
  ...USE_CASE_PAGES,
  ...INTEGRATION_PAGES,
  ...ALTERNATIVE_PAGES,
  ...COMPARISON_PAGES,
];

export const SEO_COLLECTIONS: Record<SeoPageGroup, {
  title: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  pages: SeoLandingPage[];
}> = {
  'use-cases': {
    title: 'eSignature Use Cases',
    metaTitle: 'eSignature Use Cases | SignWorkflow',
    metaDescription: 'Explore SignWorkflow eSignature use cases for offer letters, NDAs, sales contracts, onboarding, vendor agreements, invoices, purchase orders, and leases.',
    description: 'Browse document signing workflows by business process and connect each use case to pricing, security, integrations, and comparison pages.',
    pages: USE_CASE_PAGES,
  },
  integrations: {
    title: 'eSignature Integrations',
    metaTitle: 'eSignature Integrations | SignWorkflow',
    metaDescription: 'Explore SignWorkflow cloud exports, public API and signed webhooks, plus clearly labeled planning guides for unsupported native connectors.',
    description: 'Explore supported cloud export paths, the public API and signed webhooks, and clearly labeled integration-planning guides for unsupported native connectors.',
    pages: INTEGRATION_PAGES,
  },
  alternatives: {
    title: 'SignWorkflow Alternatives',
    metaTitle: 'DocuSign, Adobe Sign, Dropbox Sign Alternatives | SignWorkflow',
    metaDescription: 'Compare SignWorkflow as an alternative to DocuSign, Adobe Acrobat Sign, Dropbox Sign, HelloSign, SignNow, and PandaDoc.',
    description: 'Review alternative pages for buyers comparing e-signature tools by workflow depth, AI review, templates, audit trails, governance, and rollout fit.',
    pages: ALTERNATIVE_PAGES,
  },
  compare: {
    title: 'eSignature Comparison Pages',
    metaTitle: 'eSignature Software Comparisons | SignWorkflow',
    metaDescription: 'Compare SignWorkflow vs DocuSign, Adobe Acrobat Sign, Dropbox Sign, HelloSign, SignNow, and PandaDoc for workflow-first e-signatures.',
    description: 'Use these comparison pages to evaluate signing workflows, AI document review, team controls, audit visibility, and implementation fit.',
    pages: COMPARISON_PAGES,
  },
};

export function getSeoLandingPage(group: SeoPageGroup, slug: string) {
  return SEO_COLLECTIONS[group].pages.find((page) => page.slug === slug);
}

export function getSeoLandingPagePath(page: Pick<SeoLandingPage, 'group' | 'slug'>) {
  return `/${page.group}/${page.slug}`;
}
