import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileClock,
  FileText,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
  UserCheck,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';

import { Card } from '@ui';
import AuthAwareCta from '@/components/marketing/AuthAwareCta';

const securityControls = [
  {
    icon: LockKeyhole,
    title: 'Encryption-focused handling',
    description:
      'SignWorkflow is designed around secure transport, controlled storage, and restricted document access patterns.',
  },
  {
    icon: UserCheck,
    title: 'Role-aware access',
    description:
      'Workspace roles, team boundaries, and permission checks help limit sensitive document actions to authorized users.',
  },
  {
    icon: ClipboardCheck,
    title: 'Audit-oriented events',
    description:
      'Document actions are recorded so teams can review signer activity, status changes, and governance events.',
  },
  {
    icon: FileClock,
    title: 'Retention-aware workflows',
    description:
      'Retention and legal-hold-aware product behavior helps teams preserve records when documents should not be removed prematurely.',
  },
  {
    icon: FileText,
    title: 'AI review boundaries',
    description:
      'AI summaries, translation, clause explanations, and risk analysis are presented as review assistance, not legal advice or certification.',
  },
];

const compliancePosture = [
  {
    title: 'SOC 2',
    status: 'No independent report published',
    description:
      'Controls are being described around security, availability, confidentiality, processing integrity, and privacy themes. SignWorkflow does not claim SOC 2 certification unless an independent report is completed.',
  },
  {
    title: 'Privacy and data rights',
    status: 'See the privacy notice',
    description:
      'Review the privacy notice for information about personal data and contact support with questions about a specific processing arrangement.',
  },
  {
    title: 'HIPAA-supportive safeguards',
    status: 'Not a blanket HIPAA claim',
    description:
      'Healthcare use cases that involve PHI require additional review, appropriate safeguards, vendor controls, and usually a Business Associate Agreement.',
  },
  {
    title: 'Security reviews',
    status: 'Available for customer evaluation',
    description:
      'Customers can review the security posture, product controls, and rollout responsibilities before using SignWorkflow for sensitive workflows.',
  },
];

const dataPractices = [
  'Documents are accessed through authenticated application flows.',
  'Private workspace actions are separated from public marketing pages.',
  'Administrative and governance actions are controlled by workspace role and plan gates.',
  'Completed document workflows are designed to keep signing and activity context reviewable.',
  'AI document features help with summaries, translation, explanations, and risk review while customers remain responsible for final decisions.',
  'Cloud exports use per-user provider connections when authorized by the user.',
  'Operational security also depends on deployment configuration, storage setup, secrets management, and customer-side access practices.',
];

const reviewItems = [
  {
    icon: FileText,
    title: 'Policies and contracts',
    items: ['Which data will the service process?', 'What data processing terms are available?', 'Which subprocessors handle the data?'],
  },
  {
    icon: Server,
    title: 'Infrastructure and vendors',
    items: ['Where will documents and backups be stored?', 'How are storage permissions configured?', 'Which providers send email or handle exports?'],
  },
  {
    icon: KeyRound,
    title: 'Access and identity',
    items: ['How are sessions and account recovery protected?', 'Which workspace roles can access documents?', 'How are privileged actions reviewed?'],
  },
  {
    icon: AlertTriangle,
    title: 'Incident readiness',
    items: ['How can a suspected incident be reported?', 'How are affected customers notified?', 'What incident response details can be shared?'],
  },
];

export default function TrustPage() {
  return (
    <main className="mt-24 bg-white">
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">
            Trust Center
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            Security and compliance posture for document workflows that need confidence.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600">
            SignWorkflow is built with security-focused product behavior such as authenticated access,
            role-aware controls, AI-assisted review boundaries, audit-oriented records, and retention-aware
            document workflows. This page explains the current posture without overstating certifications.
          </p>
          <div className="mt-8">
            <AuthAwareCta
              primaryLabel="Explore the workflow"
              secondaryLabel="Request Security Review"
              secondaryHref="/request-demo"
              ocidPrefix="trust_hero"
            />
          </div>
        </div>

        <Card className="self-start rounded-lg border-slate-200 p-6">
          <h2 className="font-display text-xl font-semibold text-slate-950">
            Current trust position
          </h2>
          <div className="mt-6 space-y-4">
            {[
              'SignWorkflow does not publish a SOC 2 or ISO 27001 audit report, claim HIPAA compliance, or claim GDPR certification.',
              'Security controls are described as product behavior and operational posture, not legal certification.',
              'AI outputs should be reviewed by users and treated as assistance for document understanding, not final legal judgment.',
              'Regulated customers should complete their own vendor review before uploading sensitive regulated data.',
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <p className="text-sm leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="font-display text-3xl font-semibold text-slate-950">
              Security controls customers can understand
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Trust improves when buyers can see the controls that matter in day-to-day document work.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {securityControls.map((control) => (
              <Card key={control.title} className="rounded-lg p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <control.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold text-slate-950">
                  {control.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {control.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <h2 className="font-display text-3xl font-semibold text-slate-950">
              Compliance posture
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              These labels are intentionally conservative. They tell customers what is being designed for without
              pretending a completed audit or certification exists.
            </p>
          </div>
          <div className="grid gap-4">
            {compliancePosture.map((item) => (
              <Card key={item.title} className="rounded-lg p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="font-display text-lg font-semibold text-slate-950">{item.title}</h3>
                  <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                    {item.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <h2 className="font-display text-3xl font-semibold text-slate-950">
              Data handling practices
            </h2>
            <div className="mt-6 grid gap-3">
              {dataPractices.map((practice) => (
                <div key={practice} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
                  <Database className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                  <p className="text-sm leading-6 text-slate-700">{practice}</p>
                </div>
              ))}
            </div>
          </div>
          <Card className="self-start rounded-lg p-6">
            <h3 className="font-display text-xl font-semibold text-slate-950">
              Customer responsibility
            </h3>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Security is shared. Customers should configure user access carefully, remove users who no longer need
              access, avoid uploading regulated data unless the right agreements are in place, and review their own
              legal obligations before using any signing platform for sensitive workflows.
            </p>
            <Link href="/security" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
              Read the security policy
              <ShieldCheck className="h-4 w-4" />
            </Link>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="font-display text-3xl font-semibold text-slate-950">
            Questions for your vendor review
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Use these questions to assess whether SignWorkflow fits your requirements. Contact us for answers about your deployment and contractual needs.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {reviewItems.map((group) => (
            <Card key={group.title} className="rounded-lg p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <group.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-slate-950">{group.title}</h3>
              <ul className="mt-5 space-y-3">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-6 text-slate-600">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-lg border border-slate-200 bg-slate-950 p-6 text-white sm:p-8 lg:grid-cols-[1fr_0.75fr] lg:p-10">
          <div>
            <h2 className="font-display text-3xl font-semibold">
              Need to review SignWorkflow for your team?
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Book a walkthrough to discuss access controls, audit trails, retention behavior, privacy questions, and
              the compliance requirements that matter for your workflow.
            </p>
            <div className="mt-8">
              <AuthAwareCta
                primaryLabel="Start Free Trial"
                secondaryLabel="Book Security Review"
                secondaryHref="/request-demo"
                surface="dark"
                ocidPrefix="trust_final"
              />
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <UsersRound className="h-5 w-5 text-brand-300" />
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-300">
                For regulated use
              </p>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Do not upload PHI, special-category personal data, or other regulated data unless your team has completed
              a vendor review and the necessary contractual terms are in place.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
