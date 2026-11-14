'use client';

import type { LucideIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  BrainCircuit,
  Building2,
  CheckCircle,
  CheckCircle2,
  Cloud,
  Code2,
  CodeXml,
  Download,
  FileCheck,
  FileSearch,
  FileText,
  Fingerprint,
  Hash,
  HeadphonesIcon,
  History,
  Landmark,
  Languages,
  Link2,
  LockKeyhole,
  PenTool,
  Scale,
  ScrollText,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wallet,
  Webhook,
  Workflow,
  Zap,
} from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent
} from '@ui';
const FeaturedCarousel = dynamic(() => import('@/components/home/FeaturedCarousel'), { ssr: false });
const TestimonialsCarousel = dynamic(() => import('@/components/home/TestimonialsCarousel'), { ssr: false });
import { testimonials } from '@/lib/testimonials';
import useContextStore from '@/hooks/useContextStore';
import { useAutoBillingMarket } from '@/hooks/useAutoBillingMarket';

import Reveal from '@/components/common/Reveal';
import { PRICING_PLANS, getMaximumAnnualSavingsPercent } from '@/lib/pricing';
import BillingToggle from '@/components/BillingToggle';
import type { BillingCycle, BillingMarket } from '@/lib/billing';

const Stats = dynamic(() => import('@/components/common/Stats'));
const Carousel = dynamic(() => import('@/components/Carousel'), { ssr: false });
const FAQ = dynamic(() => import('@/components/common/FAQ'));
const PricingCard = dynamic(() =>
  import('@/components/common/PricingCard').then((mod) => mod.PricingCard)
);

type FeatureCard = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  gradient?: string;
};

type Step = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type SecurityPoint = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type Story = {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
};

const aiFeatures = [
  {
    icon: FileText,
    title: 'Summaries',
    description: 'Turn long contracts into plain-language summaries before teams review or sign.',
  },
  {
    icon: Languages,
    title: 'Translation',
    description: 'Translate full documents or selected text so recipients can understand terms faster.',
  },
  {
    icon: ScrollText,
    title: 'Clause explanations',
    description: 'Explain dense clauses, obligations, renewals, and unusual wording in context.',
  },
  {
    icon: FileSearch,
    title: 'Risk analysis',
    description: 'Surface contract risks, missing details, and negotiation points for business review.',
  },
];

const featureCards: FeatureCard[] = [
  {
    icon: BrainCircuit,
    eyebrow: 'AI Intelligence',
    title: 'AI Document Assistant',
    description:
      'Summarize documents, translate selected text, explain clauses, and analyze contract risk before teams sign.',
    gradient: 'from-sky-500/20 to-violet-600/10',
  },
  {
    icon: PenTool,
    eyebrow: 'Signing Workflows',
    title: 'Secure E-Signature',
    description:
      'Prepare agreements, assign fields, and move contracts through secure signing flows with clear evidence after completion.',
    gradient: 'from-brand-500/20 to-brand-600/10',
  },
  {
    icon: Workflow,
    eyebrow: 'Team Operations',
    title: 'Contract Workflows',
    description:
      'Use templates, approvals, recipient ordering, reminders, and shared processes across recurring contract workflows.',
    gradient: 'from-purple-500/20 to-purple-600/10',
  },
  {
    icon: Users,
    eyebrow: 'Workspace Control',
    title: 'Teams And Roles',
    description:
      'Run signing inside shared workspaces with owners, admins, auditors, users, and team-aware access boundaries.',
    gradient: 'from-emerald-500/20 to-emerald-600/10',
  },
  {
    icon: Hash,
    eyebrow: 'Document Integrity',
    title: 'Execute And Verify',
    description:
      'Hash-backed document integrity, version history, and completion evidence keep executed contracts review-ready.',
    gradient: 'from-amber-500/20 to-amber-600/10',
  },
  {
    icon: Activity,
    eyebrow: 'Compliance Controls',
    title: 'Retain And Govern',
    description:
      'Track contract activity, keep retention policies close to the workflow, and support legal-hold-aware record handling.',
    gradient: 'from-cyan-500/20 to-cyan-600/10',
  },
  {
    icon: CodeXml,
    eyebrow: 'Integrations',
    title: 'Developer API, Webhooks And Cloud Exports',
    description:
      'Use scoped API keys to create and manage signing workflows, receive signed webhooks, and export completed PDFs to connected cloud storage.',
    gradient: 'from-rose-500/20 to-rose-600/10',
  },
];
const steps: Step[] = [
  {
    icon: Upload,
    title: 'Create or upload',
    description: 'Start with a reusable template or bring an existing agreement into the workspace.',
  },
  {
    icon: BrainCircuit,
    title: 'Review with AI',
    description: 'Summarize, translate, explain clauses, and surface risks before the contract moves forward.',
  },
  {
    icon: Users,
    title: 'Route for approval',
    description: 'Choose signer, approver, or viewer roles, place fields, and set sequential or parallel routing.',
  },
  {
    icon: PenTool,
    title: 'Sign and execute',
    description: 'Recipients complete assigned fields on desktop or mobile with a clear completion record.',
  },
  {
    icon: Download,
    title: 'Retain and reuse',
    description: 'Track status, keep the final PDF audit-ready, export it, and launch the next workflow from a template.',
  },
];

const securityPoints: SecurityPoint[] = [
  {
    icon: Fingerprint,
    title: 'Tamper-evident audit sequencing',
    description: 'Hash-chained events help teams review signing activity with strong evidence and timeline clarity.',
  },
  {
    icon: LockKeyhole,
    title: 'Secure transport and protected secrets',
    description: 'Authenticated routes, secure cookies, CSRF checks, and encrypted sensitive values protect key flows.',
  },
  {
    icon: History,
    title: 'Retention rules and legal holds',
    description: 'Control how long documents stay, when purge automation runs, and when records must remain untouched.',
  },
  {
    icon: Webhook,
    title: 'Developer API and signed webhooks',
    description: 'Scoped API keys support document workflows, and versioned signed webhooks deliver completion and signing events to your systems.',
  },
];

const complianceCards = [
  {
    icon: Scale,
    title: 'e-sign workflow considerations',
    description: 'Evidence-backed workflows and clear records help teams evaluate electronic signing requirements with counsel.',
  },
  {
    icon: Landmark,
    title: 'Regional signing considerations',
    description: 'Strong auditability and workflow controls support teams evaluating region-specific signing requirements.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy-conscious handling',
    description: 'Workspace controls, cloud export permissions, and retention rules help teams align product behavior with privacy expectations.',
  },
  {
    icon: ScrollText,
    title: 'Evidence-ready completion',
    description: 'Signed PDFs, completion summaries, and downloadable audit attachments keep completed records reviewable.',
  },
];

const stories: Story[] = [
  {
    icon: Building2,
    title: 'Legal and compliance teams',
    description:
      'Move NDA packets, contracts, and audit-sensitive documents through a controlled signing flow without losing proof.',
    bullets: ['Signer, approver, and viewer roles', 'Evidence-rich downloads', 'Retention and legal hold controls'],
  },
  {
    icon: Users,
    title: 'HR and people operations',
    description:
      'Launch onboarding packets, offer letters, and recurring forms from templates instead of rebuilding the process each time.',
    bullets: ['Template-driven starts', 'Bulk send for repeated workflows', 'Shared team visibility'],
  },
  {
    icon: Wallet,
    title: 'Sales, finance, and operations',
    description:
      'Keep proposals, renewals, payment-assisted signing, and archive-ready exports inside one operational workspace.',
    bullets: ['Sequential or parallel routing', 'Payment-link-friendly flows', 'Cloud export when requested'],
  },
];

const integrations = [
  { icon: Cloud, label: "Google Drive" },
  { icon: Cloud, label: "Dropbox" },
  { icon: Zap, label: 'Template library' },
  { icon: Users, label: "Bulk send" },
  { icon: Link2, label: "Audit export" },
  { icon: Users, label: "Workspace roles" },
  { icon: Zap, label: "Reminder controls" },
  { icon: Code2, label: "Retention policies" },
  { icon: Code2, label: "Legal holds" },
  { icon: Code2, label: "Developer API" },
  { icon: Webhook, label: "Signed webhooks" },
];


const darkGridShellStyle: CSSProperties = {
  backgroundColor: '#07172c',
  backgroundImage: [
    'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
  ].join(','),
  backgroundSize: '60px 60px, 60px 60px',
};

interface HomePageClientProps {
  initialBillingMarket?: BillingMarket;
}
export default function HomePageClient({
  initialBillingMarket = 'international',
}: HomePageClientProps) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annually");
  const { billingMarket } = useAutoBillingMarket(initialBillingMarket);
  const annualSavings = getMaximumAnnualSavingsPercent(billingMarket);
  const { user } = useContextStore();
  const primaryHref = user ? '/dashboard' : '/register';
  const paidPlans = PRICING_PLANS.filter((plan) => plan.id !== 'trial');

  return (
    <>
      {/* ═══════════════════════════════════════════════════════
          STATS BAR
      ═══════════════════════════════════════════════════════ */}
      <Stats />

      {/* ═══════════════════════════════════════════════════════
          SERVICES OVERVIEW
      ═══════════════════════════════════════════════════════ */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
              Contract Lifecycle Platform
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Manage contracts from first draft to final record
            </h2>
            <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
              SignWorkflow brings contract preparation, AI review, approval routing, e-signature, execution evidence, and retention into one business workspace.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((card, index) => (
              <Reveal key={card.title} delay={index * 0.08} className="h-full">
                <FeaturePanel {...card} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          AI DOCUMENT INTELLIGENCE
      ═══════════════════════════════════════════════════════ */}
      <section id="ai-document-intelligence" className="py-24 bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <Reveal>
              <Badge className="mb-4 border-sky-300/20 bg-sky-400/10 text-sky-100 uppercase tracking-wider text-xs font-semibold">
                AI Powered
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-5">
                Understand contracts before anyone clicks sign
              </h2>
              <p className="text-lg leading-8 text-slate-300">
                SignWorkflow includes an AI document assistant for summaries, translation, clause explanations,
                and risk analysis. Teams can move from contract intake to informed review without
                leaving the lifecycle workspace.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {['Full document summaries', 'Selected text translation', 'Clause-by-clause explanations', 'Risk and obligation analysis'].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <Button
                asChild
                variant="brand"
                size="lg"
                className="mt-8"
                data-ocid="ai-intelligence.primary_button"
              >
                <Link href={primaryHref}>
                  {user ? 'Try AI in your workspace' : 'Start with AI-powered signing'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Reveal>

            <div className="grid gap-4 sm:grid-cols-2">
              {aiFeatures.map((feature, index) => (
                <Reveal key={feature.title} delay={index * 0.08}>
                  <article className="h-full rounded-xl border border-white/10 bg-white/6 p-6 shadow-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{feature.description}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
              Process
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Move every agreement through its lifecycle
            </h2>
            <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
              Create or upload a contract, review it with AI, route approvals, collect signatures, and keep the executed record ready for retention or export.
            </p>
          </Reveal>
          <div className="relative mt-14">
            {/* <div className="absolute left-[10%] right-[10%] top-14 hidden border-t border-dashed border-brand-200 lg:block" /> */}
            <div className="hidden lg:block absolute top-14 left-[10%] right-[10%] h-px">
              <div
                className="w-full h-full opacity-40"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, oklch(0.54 0.22 264) 0px, oklch(0.54 0.22 264) 8px, transparent 8px, transparent 20px)',
                }}
              />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 relative">
              {steps.map((step, idx) => (
                <Reveal key={step.title} delay={idx * 0.1}>
                  <StepCard index={idx + 1} {...step} />
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delay={0.1} className="mt-12 flex justify-center">
            <Button
              asChild
              variant="brand"
              size="lg"
              data-ocid="home-button"
            >
              <Link href={primaryHref}>
                {user ? 'Open your workspace' : 'Start free trial'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECURITY & COMPLIANCE
      ═══════════════════════════════════════════════════════ */}
      <section id="security" className="py-24 text-white" style={darkGridShellStyle}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <Badge className="mb-4 bg-white/10 text-white/80 border-white/20 uppercase tracking-wider text-xs font-semibold">
              Security &amp; Compliance
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Governance for every contract stage
            </h2>
            <p className="text-lg text-white/60 max-w-4xl mx-auto">
              Every contract should stay understandable before, during, and after signature. SignWorkflow keeps proof, governance, and operational controls close to the lifecycle instead of bolting them on later.
            </p>
          </Reveal>
          <div className="grid lg:grid-cols-2 gap-6 items-start mt-14">
            <div>
              <Reveal>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-brand-400" />
                  Security Features
                </h3>
              </Reveal>

              <div className="grid sm:grid-cols-2 gap-6">
                {securityPoints.map((point, index) => (
                  <Reveal key={point.title} delay={index * 0.08}>
                    <article className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="h-11 w-11 i text-brand-200">
                          <point.icon className="h-5 w-5" />
                        </div>
                        <div className="text-white/85">
                          <h4 className="font-semibold">{point.title}</h4>
                          <p className="text-xs font-lighter">{point.description}</p>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
              {/* Highlight */}
              <Reveal delay={0.12}>
                <div className="mt-6 p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                  <div className="flex items-center gap-3">
                    <Award className="h-6 w-6 text-emerald-400" />
                    <p className="text-sm font-semibold text-white">
                      Designed for review-ready signing programs where evidence and control matter after the document is completed.
                    </p>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={0.18}>
                <article className="rounded-xl border border-brand-300/15 bg-[linear-gradient(180deg,rgba(124,58,237,0.12),rgba(15,23,42,0.25))] p-6 mt-7">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                    <Sparkles className="h-4 w-4 text-brand-300" />
                    Identity and delivery controls
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Secure cookies, CSRF validation, MFA-aware actions, role-based workspace access,
                    and cloud exports tied to user-owned connections help keep operational boundaries
                    clear.
                  </p>
                </article>
              </Reveal>

            </div>
            <div className="space-y-5">
              <Reveal>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-brand-400" />
                  Compliance Standards
                </h3>
              </Reveal>

              <Reveal delay={0.08}>
                <article className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <div className="inline-flex items-center gap-2 rounded-full border border-brand-300/20 bg-brand-400/10 px-3 py-1 text-xs font-semibold uppercase text-brand-200">
                    <BadgeCheck className="h-4 w-4" />
                    Common frameworks teams evaluate against
                  </div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {complianceCards.map((card, index) => (
                      <Reveal key={card.title} delay={index * 0.08}>
                        <div className="rounded-xl border border-white/10 bg-slate-950/35 p-5">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-brand-200">
                            <card.icon className="h-5 w-5" />
                          </div>
                          <h3 className="mt-4 text-base font-semibold text-white">{card.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </article>
              </Reveal>


            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          Teams we support
      ═══════════════════════════════════════════════════════ */}
      <section className="pt-24 pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
              Teams we support
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built for teams that own the contract lifecycle
            </h2>
            <p className="text-lg text-muted-foreground">
              SignWorkflow is designed for repeatable contract processes where speed matters, but evidence, ownership, and oversight matter just as much.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {stories.map((story) => (
              <Reveal key={story.title} className="h-full">
                <StoryCard {...story} />
              </Reveal>
            ))}
          </div>


        </div>
      </section>

      {/* Featured blog posts (carousel) */}
      <FeaturedCarousel />
      {/* ═══════════════════════════════════════════════════════
          TESTIMONIALS
      ═══════════════════════════════════════════════════════ */}
      <section className="py-12 bg-white">
        <div className="mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
              Customer Stories
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built for teams with recurring document work
            </h2>
            <p className="text-lg text-muted-foreground">
              From legal and HR to finance and operations, the product is designed for teams that need speed, clarity, and shared control.
            </p>
          </Reveal>
          <div className="mb-14">
            <TestimonialsCarousel testimonials={testimonials} />
          </div>
        </div>
      </section>
      {/* Client logo strip */}
      <LazyCarouselSection />
      {/* ═══════════════════════════════════════════════════════
          INTEGRATIONS
      ═══════════════════════════════════════════════════════ */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <Reveal>
              <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
                Integrations
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
                Connect Every Stage Of The Contract Lifecycle
                <span className="block text-brand"> To The Systems Your Team Already Uses</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                Bring contracts in, route reviews and signature requests out, and keep executed records available for archive, export, and internal tooling.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Completed files stay in SignWorkflow until your team explicitly exports them.",
                  "Cloud exports use delegated access instead of shared credentials.",
                  "Scoped API keys and signed webhooks support document workflows and event delivery.",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2.5 text-sm text-foreground"
                  >
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button size="sm"
                asChild
                variant="brand"
                data-ocid="integrations.primary_button"
              >
                <Link href="/developers/api">
                  Explore developer API
                  <Code2 className="h-4 w-4" />
                </Link>
              </Button>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="grid grid-cols-4 gap-3">
                {integrations.map((intg, i) => (
                  <div
                    key={intg.label}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover group cursor-default"
                    data-ocid={`integrations.item.${i + 1}`}
                  >

                    <intg.icon className="h-7 w-7 mx-auto mb-2 text-muted-foreground group-hover:text-brand transition-colors" />
                    <p className="text-[10px] font-semibold text-muted-foreground leading-tight">
                      {intg.label}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          PRICING
      ═══════════════════════════════════════════════════════ */}

      {/* <PricingCard /> */}
      {/* ===== PRICING CARDS ===== */}
      <section id="pricing" className="py-24 bg-white">
        <Reveal className="text-center">
          <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
            Pricing
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            Pricing for growing teams
          </h2>
          <p className="text-lg text-muted-foreground mb-4">
            Start with a trial workspace, then move into Business, Business Plus, or Enterprise as your contract volume and governance needs grow.
          </p>
          <BillingToggle
            value={billingCycle}
            onChange={setBillingCycle}
            annualSavingsLabel={annualSavings ? `Save up to ${annualSavings}%` : null}
          />
        </Reveal>
        <div className="max-w-7xl mx-auto mt-16 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
            {paidPlans.map((plan, idx) => (
              <PricingCard
                key={`${plan.id}-${billingCycle}-${billingMarket}`}
                plan={plan}
                billingCycle={billingCycle}
                billingMarket={billingMarket}
                index={idx + 1}
              />
            ))}
          </div>
        </div>
        <Reveal delay={0.1} className="mt-10 flex justify-center">
          <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 transition hover:text-brand-800">
            View the full pricing page
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>
      <section className="py-14 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal>
              <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
                 Contract Lifecycle Management
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
               Manage Contracts from First Draft to Final Record with
                <span className="block text-brand">AI-Powered Workflows and Secure E-Signature</span>
              </h2>


               <div className="space-y-3  text-gray-500">

               <p>SignWorkflow is a contract lifecycle management platform that helps businesses create, review, approve, sign, execute, and retain agreements in one secure workspace.</p>
               <p>Teams can start with a reusable template or uploaded document, use AI to understand clauses and risks, route approvals, and collect electronic signatures while keeping the contract context together. Legal effect depends on the transaction and applicable law.</p>
                <p>After execution, the workspace keeps status, version history, signing events, completion evidence, retention controls, and export options connected to the final record.</p>
                <p>For recurring agreements, templates, bulk send, team roles, reminders, API access, and signed webhooks help organizations repeat the process consistently across legal, HR, finance, sales, and operations.</p>
              </div>

            </Reveal>

        </div>
      </section>
      {/* ═══════════════════════════════════════════════════════
          FAQ
      ═══════════════════════════════════════════════════════ */}
      <section className="py-14 ">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQ />
          {/* Support cards */}
          <Reveal className="mt-12 ">
            <p className="text-center text-sm font-medium text-muted-foreground mb-6">
              Still have questions?
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              <Card className="text-center p-6">
                <BookOpen className="h-8 w-8 text-brand mx-auto mb-3" />
                <h3 className="font-bold text-foreground mb-1">Help Center</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Browse FAQs, help topics, and practical tutorials.
                </p>
                <Button
                  asChild
                  variant="outlineBrand"
                  size="sm"
                  className="w-full"
                  data-ocid="support.helpcenter.button"
                >
                  <a href="https://support.signworkflow.com/kb" target="_blank" rel="noopener noreferrer">
                    Browse Help
                  </a>
                </Button>
              </Card>
              <Card className="text-center p-6">
                <HeadphonesIcon className="h-8 w-8 text-brand mx-auto mb-3" />
                <h3 className="font-bold text-foreground mb-1">
                  Contact Support
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a ticket and track replies in the SignWorkflow Help Center.
                </p>
                <Button
                  asChild
                  variant="brand"
                  size="sm"
                  className='w-full'
                  data-ocid="support.contact.button"
                >
                  <a href="https://support.signworkflow.com/create" target="_blank" rel="noopener noreferrer">
                    Create Ticket
                  </a>
                </Button>
              </Card>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}


function LazyCarouselSection() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="min-h-32 relative overflow-hidden border-y border-slate-200/80 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_42%,#f8fbff_100%)] py-20">
      {visible ? (
        <Reveal>
          <Carousel />
        </Reveal>
      ) : null}
    </section>
  );
}

function FeaturePanel({ icon: Icon, eyebrow, title, description, gradient }: FeatureCard) {
  return (
    <Card
      className="
        group h-full rounded-xl bg-card
        py-6 shadow-sm transition-all duration-300
        hover:-translate-y-1 hover:shadow-lg
      "
    >
      {/* Header */}
      <div className="px-6 pb-3">
        {/* Icon */}
        <div
          className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/50 bg-linear-to-br ${gradient}`}
        >
          <Icon className="h-6 w-6 text-foreground" />
        </div>

        {/* Title + Badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground">{title}</h3>

          <Badge
            variant="secondary"
            className="text-xs tracking-[0] border-0"
          >
            {eyebrow}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 mt-4">
        <p className="text-sm leading-relaxed text-gray-500">
          {description}
        </p>
      </div>
    </Card>
  );
}

function StepCard({
  index,
  icon: Icon,
  title,
  description,
}: Step & {
  index: number;
}) {
  return (
    <div className="text-center relative group">
      <div className="relative inline-flex mb-6">
        {/* Icon container */}
        <div className="h-28 w-28 rounded-2xl bg-white border border-gray-200 flex flex-col items-center justify-center gap-2 transition-shadow duration-300 group-hover:shadow-lg">
          <Icon className="h-7 w-7 text-brand-600" />
          <span className="text-xs font-bold text-gray-500">
            STEP {String(index).padStart(2, '0')}
          </span>
        </div>

        {/* Step number badge */}
        <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
          {index}
        </div>
      </div>

      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

function StoryCard({ icon: Icon, title, description, bullets }: Story) {
  return (
    <Card className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
      <CardContent className="mt-5 p-0">
        <ul className="space-y-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
