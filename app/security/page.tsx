import Link from 'next/link';

import { COMPANY } from '@/lib/site';

const securityControls = [
  'Authenticated application routes separate public marketing pages from private workspace actions.',
  'Workspace roles and plan gates limit sensitive actions such as audit exports, retention changes, billing, and member administration.',
  'Document events are written into audit-oriented records so teams can review status changes, signer activity, and governance actions.',
  'AI document review features are gated by workspace access and plan entitlements before summaries, translations, explanations, or risk analysis are generated.',
  'Retention and legal-hold workflows are designed to prevent premature deletion when a record still needs to be preserved.',
  'Google Drive and Dropbox exports use per-user connections so completed PDFs are exported only when an authorized user initiates the action.',
];

const applicationSecurity = [
  {
    title: 'Authentication and sessions',
    description:
      'SignWorkflow uses authenticated sessions, refresh-session tracking, secure cookie handling, CSRF controls, and session revocation patterns to protect private application areas.',
  },
  {
    title: 'Workspace access control',
    description:
      'Workspace membership, role-aware checks, team boundaries, and plan gates help restrict sensitive actions to users with the right authority.',
  },
  {
    title: 'Auditability',
    description:
      'Document and governance events are recorded so teams can review signing activity, status transitions, retention decisions, and administrative actions.',
  },
  {
    title: 'AI review boundaries',
    description:
      'AI-assisted summaries, translations, clause explanations, and risk analysis are access-controlled and should be treated as review assistance rather than legal advice.',
  },
];

const operationalPractices = [
  'Secrets, API keys, payment credentials, and storage credentials should be managed through deployment environment controls.',
  'Production storage, database, email, and cloud export providers should be configured with least-privilege access.',
  'Customers are responsible for inviting only authorized users, removing stale access, and reviewing workspace membership regularly.',
  'Regulated workflows may require additional contractual, compliance, and vendor-review steps before sensitive data is uploaded.',
];

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
          Trust
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Security Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Effective July 18, 2026</p>
        <p className="mt-5 text-sm leading-7 text-slate-600">
          SignWorkflow is designed with security-focused application patterns for document
          workflows that need controlled access, reliable audit context, and careful operational
          handling. This policy summarizes the product controls and shared responsibilities that
          support secure use of the platform.
        </p>

        <div className="mt-8 space-y-10 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">Security principles</h2>
            <p className="mt-2">
              SignWorkflow separates public and private application surfaces, limits sensitive
              actions through workspace authorization, records security-relevant document events,
              and designs retention-aware workflows so important records are not removed prematurely.
              Security outcomes also depend on deployment configuration, vendor controls, and customer
              access practices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Application security controls</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {applicationSecurity.map((control) => (
                <article key={control.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-semibold text-slate-900">{control.title}</h3>
                  <p className="mt-2 text-slate-600">{control.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Implementation details</h2>
            <ul className="mt-3 space-y-3">
              {securityControls.map((detail) => (
                <li key={detail} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-700" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Data protection</h2>
            <p className="mt-2">
              SignWorkflow is built to protect documents through authenticated access, scoped workspace
              permissions, controlled storage access, and secure transport between the browser and the
              application. Completed documents, signing metadata, and audit-oriented records should be
              handled according to the retention and access settings chosen by each workspace.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Document integrity and audit trails</h2>
            <p className="mt-2">
              Signing flows are designed to preserve document context, signer activity, timestamps,
              status changes, and governance actions. These audit-oriented records help customers
              understand what happened during a document lifecycle and support internal review after
              a document is completed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Availability, backup, and recovery</h2>
            <p className="mt-2">
              Availability and recovery depend on the production deployment, database configuration,
              storage provider, backup policies, monitoring, and incident response process used for
              the environment. Production operators should maintain backups, recovery procedures,
              alerting, and access controls appropriate to their risk profile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Operational security</h2>
            <div className="mt-4 grid gap-3">
              {operationalPractices.map((practice) => (
                <div key={practice} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  {practice}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Compliance positioning</h2>
            <p className="mt-2">
              SignWorkflow is designed with GDPR-oriented privacy controls, auditability, role-aware
              access, and retention-aware product behavior. This page does not claim SOC 2, ISO 27001,
              HIPAA, eIDAS, or other independent certification unless a separate, current report or
              agreement explicitly states that certification or commitment.
            </p>
            <Link href="/trust" className="mt-3 inline-flex text-sm font-medium text-brand-600 hover:text-brand-700">
              View the Trust Center
            </Link>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Customer responsibilities</h2>
            <p className="mt-2">
              Customers should configure workspaces carefully, use strong passwords and MFA where available,
              invite only authorized users, review role assignments, manage connected cloud accounts,
              and avoid uploading regulated or highly sensitive data until the correct agreements and
              internal approvals are in place.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Responsible disclosure and questions</h2>
            <p className="mt-2">
              If you believe you have found a vulnerability, or if your team needs a security review,
              email <a href={`mailto:${COMPANY.contact.support}?subject=%5BSECURITY%5D%20Vulnerability%20report`} className="font-medium text-brand-600 hover:text-brand-700">{COMPANY.contact.support}</a> with <code>[SECURITY]</code> at the start of the subject.
              Please include enough detail for the team to reproduce and assess the issue, and do not
              include passwords, signing tokens, private keys, or live customer documents. Do not access,
              modify, retain, or disclose data that does not belong to you.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
