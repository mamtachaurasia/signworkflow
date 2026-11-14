import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  Building2,
  FileCheck,
  Globe,
  Linkedin,
  Mail,
  MapPin,
  Scale,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import { COMPANY } from '@/lib/site';

const principles = [
  {
    icon: Workflow,
    title: 'Workflow over one-off signing',
    description:
      'The product is designed for repeatable team processes, not just isolated document uploads.',
  },
  {
    icon: BrainCircuit,
    title: 'AI-assisted document review',
    description:
      'Summaries, translation, clause explanations, and risk analysis help teams understand documents before signature.',
  },
  {
    icon: Users,
    title: 'Built for shared work',
    description:
      'Workspaces, teams, roles, and permissions are treated as core product behavior rather than add-ons.',
  },
  {
    icon: ShieldCheck,
    title: 'Trust-conscious by design',
    description:
      'Audit trails, signing history, retention-aware controls, and secure access patterns stay close to the workflow.',
  },
];

const capabilities = [
  {
    title: 'Electronic signatures',
    description:
      'Send documents for electronic signature with guided recipient flows, signature, initial, date, and text fields. Legal effect depends on the transaction and applicable law.',
  },
  {
    title: 'Document workflows',
    description:
      'Route documents through preparation, review, sending, signing, and completion with status tracking at every step.',
  },
  {
    title: 'Workspace organization',
    description:
      'Workspaces, teams, roles, and permissions keep documents scoped to the right people across legal, HR, finance, and operations.',
  },
  {
    title: 'AI document review',
    description:
      'Summarize documents, explain clauses, translate content, and analyze risk before signature to speed up understanding.',
  },
  {
    title: 'Audit trails',
    description:
      'Every signing event is recorded with tamper-evident audit logs, giving teams evidence they can verify after completion.',
  },
  {
    title: 'Templates and reuse',
    description:
      'Turn completed documents into reusable templates with predefined recipients, fields, and routing for repeatable processes.',
  },
  {
    title: 'Retention and legal holds',
    description:
      'Retention-aware controls and legal holds keep records available for compliance review and dispute resolution.',
  },
  {
    title: 'Cloud import and export',
    description:
      'Import documents from Google Drive and Dropbox, and export signed records back to cloud storage for archival.',
  },
];

const audienceRows = [
  {
    team: 'Legal',
    need: 'Contract packets, NDA routing, AI clause review, completion evidence, and audit-ready records.',
  },
  {
    team: 'HR',
    need: 'Offer letters, onboarding forms, employee acknowledgments, policy updates, and repeatable templates.',
  },
  {
    team: 'Finance',
    need: 'Approval flows, vendor documents, AI risk review, payment-assisted signing, and records that remain easy to verify.',
  },
  {
    team: 'Operations',
    need: 'Standardized forms, recurring document packets, workspace visibility, and controlled exports.',
  },
  {
    team: 'Compliance',
    need: 'Retention-aware workflows, legal-hold-aware records, audit exports, and role-separated access.',
  },
];

const approach = [
  {
    title: 'Security by default',
    description:
      'Audit trails, role-based access, and SHA-256 document integrity are built into the workflow rather than added later.',
  },
  {
    title: 'Usability over complexity',
    description:
      'The interface stays approachable for senders and signers, so teams adopt it without extensive training.',
  },
  {
    title: 'Automation where it matters',
    description:
      'Templates, bulk send, and AI-assisted review remove repetitive manual work from high-volume signing processes.',
  },
  {
    title: 'Transparency after signature',
    description:
      'Completed records remain readable, with audit history, retention context, and export options for long-term verification.',
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Company</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-900">About SignWorkflow</h1>
        <p className="mt-5 text-base leading-8 text-slate-600">
          {COMPANY.legalName} builds SignWorkflow, a workspace-first e-signature platform for teams
          that need more than a simple upload-and-sign tool. The focus is on operational signing
          workflows, AI-assisted review, shared controls, and completed records that remain
          understandable after signature.
        </p>
      </section>

      {/* What we do / Why SignWorkflow */}
      <section className="mt-14 rounded-2xl border border-slate-200 bg-slate-50 p-8">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-3 text-slate-900">
              <Building2 className="h-5 w-5 text-sky-700" />
              <h2 className="text-xl font-semibold">What we do</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              SignWorkflow is a B2B e-signature and document workflow platform. Teams prepare
              documents, add recipients and fields, route them for review and signature, and retain
              completed records with audit trails. AI-assisted review helps legal, HR, finance, and
              operations teams understand content before signing.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-3 text-slate-900">
              <FileCheck className="h-5 w-5 text-sky-700" />
              <h2 className="text-xl font-semibold">Why SignWorkflow</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Document signing in growing teams often means scattered emails, manual chasing, and
              records that are hard to verify later. SignWorkflow brings preparation, review,
              signing, and retention into one workspace with role-based access, audit trails, and AI
              assistance, so teams can move faster without losing control.
            </p>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="mt-14 grid gap-6 lg:grid-cols-4">
        {principles.map((item) => (
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <item.icon className="h-5 w-5" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">{item.title}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
          </div>
        ))}
      </section>

      {/* Our Platform — capabilities */}
      <section className="mt-16">
        <div className="flex items-center gap-3 text-slate-900">
          <Workflow className="h-5 w-5 text-sky-700" />
          <h2 className="text-2xl font-semibold">Our platform</h2>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-700">
          SignWorkflow covers the full document lifecycle, from preparation to long-term retention.
          The capabilities below are part of the product today.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {capabilities.map((cap) => (
            <div key={cap.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{cap.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{cap.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Our Approach */}
      <section className="mt-16">
        <div className="flex items-center gap-3 text-slate-900">
          <ShieldCheck className="h-5 w-5 text-sky-700" />
          <h2 className="text-2xl font-semibold">Our approach</h2>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {approach.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Business context and audience */}
      <section className="mt-16">
        <div className="flex items-center gap-3 text-slate-900">
          <Scale className="h-5 w-5 text-sky-700" />
          <h2 className="text-2xl font-semibold">Business context and audience</h2>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-700">
          SignWorkflow sits in the B2B e-signature workflow software category. It is built for
          organizations that need signing to connect with AI document understanding, ownership,
          permissions, audit review, retention decisions, and document operations after a PDF is
          signed.
        </p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <dl className="divide-y divide-slate-200">
            {audienceRows.map((row) => (
              <div key={row.team} className="grid gap-2 p-5 sm:grid-cols-[10rem_1fr]">
                <dt className="text-sm font-semibold text-slate-950">{row.team}</dt>
                <dd className="text-sm leading-7 text-slate-600">{row.need}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Company information */}
      <section className="mt-16 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-slate-900">
          <Building2 className="h-5 w-5 text-sky-700" />
          <h2 className="text-2xl font-semibold">Company information</h2>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <InfoRow icon={Building2} label="Company" value={COMPANY.legalName} />
            <InfoRow icon={FileCheck} label="Product" value={COMPANY.productName} />
            <InfoRow
              icon={MapPin}
              label="Headquarters"
              value={
                <>
                  {COMPANY.hq.street}
                  <br />
                  {COMPANY.hq.city}, {COMPANY.hq.region} {COMPANY.hq.postalCode}
                  <br />
                  {COMPANY.hq.country}
                </>
              }
            />
          </div>
          <div className="space-y-4">
            <InfoRow icon={Globe} label="Website" value={COMPANY.website} href={COMPANY.website} />
            <InfoRow
              icon={Mail}
              label="General contact"
              value={COMPANY.contact.general}
              href={`mailto:${COMPANY.contact.general}`}
            />
            <InfoRow
              icon={Linkedin}
              label="LinkedIn"
              value={COMPANY.social.linkedin}
              href={COMPANY.social.linkedin}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Contact us
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/security"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Security overview
          </Link>
        </div>
      </section>
    </main>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        {href ? (
          <a
            href={href}
            className="mt-1 block break-all text-sm font-medium text-sky-700 hover:text-sky-800"
          >
            {value}
          </a>
        ) : (
          <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
        )}
      </div>
    </div>
  );
}
