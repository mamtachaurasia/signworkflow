export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
          Legal
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Privacy Policy</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          This page explains, at a high level, how SignWorkflow handles account information,
          document-related data, and operational records across the product.
        </p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">Information we process</h2>
            <p className="mt-2">
              SignWorkflow may process profile details, workspace membership data, signer details,
              document metadata, audit events, and operational logs needed to deliver the service.
              Contact and support submissions may include your name, business email, team size,
              selected topic, message, and request reference. Network metadata may be processed for
              abuse prevention and service security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">How data is used</h2>
            <p className="mt-2">
              Data is used to authenticate users, route signing requests, maintain document history,
              support billing and workspace administration, and operate retention or audit-related workflows.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Sharing and subprocessors</h2>
            <p className="mt-2">
              Limited service providers may be used for infrastructure, storage, email delivery,
              cloud export connections, and payment processing when required to run the product.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Retention and deletion</h2>
            <p className="mt-2">
              Depending on workspace settings and document state, records may be retained for
              operational, legal, or audit purposes before deletion or purge flows are allowed.
              Closed contact and support messages are generally retained for up to 12 months, then
              deleted from active support systems unless a legal, security, fraud-prevention, or
              contractual requirement requires longer retention.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Questions</h2>
            <p className="mt-2">
              If you need help with privacy or data-handling questions, contact the team through the public contact page.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
