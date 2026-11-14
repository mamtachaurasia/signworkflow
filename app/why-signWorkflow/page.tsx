import { ArrowRight, BrainCircuit, Briefcase, Building2, CheckCircle2, FileCheck, GitBranch, Hash, Receipt, Scale, Settings, ShieldCheck, Users, Workflow, Lock } from 'lucide-react';
import { Button, Card } from '@ui';

const reasons = [
  {
    icon: BrainCircuit,
    title: 'AI-powered document understanding',
    description:
      'Summaries, translation, clause explanations, and risk analysis help reviewers understand documents before signature.',
  },
  {
    icon: Workflow,
    title: 'Repeatable team workflows',
    description:
      'Templates, routing choices, and shared process visibility make it easier to run the same flow consistently.',
  },
  {
    icon: Users,
    title: 'Workspace-first controls',
    description:
      'Roles, teams, ownership, and account-level controls help the product behave more like a business system than a solo signer tool.',
  },
  {
    icon: Hash,
    title: 'Audit-ready records',
    description:
      'Version history, signing events, and evidence-oriented records help keep completed documents reviewable.',
  },
  {
    icon: ShieldCheck,
    title: 'Security-focused product behavior',
    description:
      'The platform is built with secure-access patterns and controlled document handling in mind.',
  },
];
const comparisonRows = [
  { feature: "Electronic Signatures", us: true, them: true },
  { feature: "Approval Workflows", us: true, them: false },
  { feature: "AI Summaries & Clause Review", us: true, them: false },
  { feature: "Role Based Access", us: true, them: false },
  { feature: "Document Retention Policies", us: true, them: false },
  { feature: "Legal Hold Management", us: true, them: false },
  { feature: "Multi-Team Workspaces", us: true, them: false },
  { feature: "Audit Trails", us: true, them: true },
  { feature: "Governance Controls", us: true, them: false },
];

const differentiators = [
  {
    icon: BrainCircuit,
    title: "AI Document Review",
    description:
      "Summarize agreements, translate document text, explain clauses and surface risk before signature.",
  },
  {
    icon: Building2,
    title: "Built for Teams",
    description:
      "Organize documents by departments, projects and teams with centralized controls.",
  },
  {
    icon: Lock,
    title: "Governance First",
    description:
      "Track ownership, access history, document activity and compliance records.",
  },
  {
    icon: GitBranch,
    title: "Approval Workflows",
    description:
      "Route documents through reviewers and approvers before signatures are requested.",
  },
  {
    icon: FileCheck,
    title: "Retention & Legal Hold",
    description:
      "Preserve important records and support compliance requirements.",
  },
];

const teamUseCases = [
  {
    icon: Briefcase,
    title: "Human Resources",
    description: "Offer letters, onboarding and policy acknowledgements.",
  },
  {
    icon: Scale,
    title: "Legal",
    description: "AI-assisted contract reviews, approvals and compliance workflows.",
  },
  {
    icon: Receipt,
    title: "Finance",
    description: "Vendor agreements, purchase approvals and authorizations.",
  },
  {
    icon: Settings,
    title: "Operations",
    description: "SOP approvals, compliance records and internal governance.",
  },
];

const practicalBenefits = [
  "Less time rebuilding recurring signing processes",
  "Faster understanding of contracts with AI summaries, translations, clause explanations, and risk analysis",
  "Clearer ownership across admins, senders, signers, and reviewers",
  "Better confidence in the final record after a workflow completes",
  "A stronger fit for growing teams than generic one-off signature tools",
];
export default function WhySignWorkflowPage() {
  return (
      <main className="mt-24">
      {/* Hero */}
      <section className="mx-auto max-w-6xl p-6">
          <h1 className="mt-3 font-display text-4xl font-semibold text-foreground">
            Why teams choose SignWorkflow
          </h1>
          <p className="mt-5 text-base leading-8 text-muted-foreground">
            Teams usually adopt SignWorkflow when a lightweight signature tool
            stops being enough. The product is strongest where signing needs to
            fit into a repeatable business process with AI-assisted review, shared controls and
            better post-signature visibility.
          </p>
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center mt-12">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold text-foreground">
                Stop Managing Documents Across Multiple Tools
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                SignWorkflow combines electronic signatures, approval workflows,
                AI document intelligence, team governance, audit trails, retention
                controls and document management in one platform.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Button
                asChild
                className="transition-smooth hover:-translate-y-0.5"
                data-ocid="cta.start_trial_button"
              >
                <a href="/register">Start Free Trial</a>
              </Button>
              <Button
                variant="outline"
                asChild
                className="transition-smooth hover:-translate-y-0.5"
                data-ocid="cta.book_demo_button"
              >
                <a href="/request-demo">Book a Demo</a>
              </Button>
            </div>
          </div>
        
      </section>

      {/* Before / During / After */}
      <section className="mx-auto max-w-6xl p-6">
        <div className="max-w-3xl">
          <h2 className="font-display text-3xl font-semibold text-foreground">
            Traditional eSignature Platforms Only Solve One Part of the Process
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Most solutions focus on collecting signatures. After signing, teams
            still struggle with document understanding, approvals, ownership,
            compliance, retention policies, audits and collaboration.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              phase: "Before Signing",
              items: [
                "Approval routing",
                "AI summary and risk review",
                "Review process",
                "Access permissions",
              ],
            },
            {
              phase: "Signing",
              items: ["Electronic signatures", "Audit trails", "Notifications"],
            },
            {
              phase: "After Signing",
              items: [
                "Retention management",
                "Compliance readiness",
                "Legal hold support",
              ],
            },
          ].map((col) => (
            <Card
              key={col.phase}
              className="rounded-xl border bg-card p-6 transition-smooth hover:-translate-y-1 hover:shadow-md"
              data-ocid="process.phase_card"
            >
              <h3 className="font-display text-lg font-semibold text-foreground">
                {col.phase}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-semibold text-foreground">
            SignWorkflow vs Traditional eSignature Tools
          </h2>
          <div className="mt-10 overflow-hidden rounded-xl border bg-card">

  <table className="w-full border-collapse">
    <thead>
      <tr className="bg-gray-100">
        <th className="px-4 py-3 text-left font-semibold text-gray-900">
          Feature
        </th>
        <th className="px-4 py-3 text-center font-semibold text-gray-900">
          SignWorkflow
        </th>
        <th className="px-4 py-3 text-center font-semibold text-gray-900">
          Most eSign Platforms
        </th>
      </tr>
    </thead>

    <tbody>
      {comparisonRows.map((row, i) => (
        <tr
          key={row.feature}
          className={i % 2 === 1 ? "bg-gray-50" : ""}
        >
          <td className="px-4 py-3 font-medium text-gray-900">
            {row.feature}
          </td>

          <td className="px-4 py-3 text-center">
            <CheckCircle2 className="mx-auto h-5 w-5 text-blue-600" />
          </td>

          <td className="px-4 py-3 text-center text-gray-500">
            {row.them ? (
              <CheckCircle2 className="mx-auto h-5 w-5 text-blue-600" />
            ) : (
              <span className="text-sm">Limited</span>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section className="mx-auto max-w-6xl p-6">
        <h2 className="font-display text-3xl font-semibold text-foreground">
          What Makes SignWorkflow Different?
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {differentiators.map((d) => (
            <Card
              key={d.title}
              className="rounded-xl border bg-card p-6 transition-smooth hover:-translate-y-1 hover:shadow-md"
              data-ocid="differentiator.card"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <d.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-foreground">
                {d.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {d.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Team Use Cases */}
      <section className="bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-semibold text-foreground">
            Teams That Use SignWorkflow
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {teamUseCases.map((t) => (
              <Card
                key={t.title}
                className="rounded-xl border bg-card p-6 text-center transition-smooth hover:-translate-y-1 hover:shadow-md"
                data-ocid="team_use_case.card"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <t.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                  {t.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {t.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border bg-card p-10 text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground">
            Ready to Simplify Your Document Workflows?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Manage approvals, signatures, compliance and governance from one
            platform with AI document intelligence built into the review flow.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 transition-smooth hover:-translate-y-0.5"
            data-ocid="final_cta.start_trial_button"
          >
            <a href="/register">
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2">
            {reasons.map((reason) => (
              <Card
                key={reason.title}
                className="rounded-xl border bg-card p-6 transition-smooth hover:-translate-y-1 hover:shadow-md"
                data-ocid="feature.reason_card"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <reason.icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 font-display text-xl font-semibold text-foreground">
                  {reason.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {reason.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Practical Benefits */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border bg-card p-8">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            What this means in practice
          </h2>
          <ul className="mt-6 space-y-4">
            {practicalBenefits.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm leading-7 text-muted-foreground"
              >
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
