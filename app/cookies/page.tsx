import Link from 'next/link';

import { CookieSettingsButton } from '@/components/cookie/CookieSettingsButton';

const cookieCategories = [
  {
    name: 'Necessary',
    status: 'Always active',
    examples: 'Authentication, secure sessions, CSRF protection, fraud prevention, signing flow continuity.',
    basis: 'Legitimate interest in providing and securing the service.',
  },
  {
    name: 'Functional',
    status: 'Optional',
    examples: 'Saved preferences, product settings, chat widgets, and future experience helpers.',
    basis: 'Consent, unless the feature is strictly required for a requested service.',
  },
  {
    name: 'Analytics',
    status: 'Optional',
    examples: 'Google Analytics 4, session measurement, reliability and product usage analysis.',
    basis: 'Consent.',
  },
  {
    name: 'Marketing',
    status: 'Optional',
    examples: 'Google Ads, Meta Pixel, LinkedIn Insight Tag, attribution and campaign measurement.',
    basis: 'Consent.',
  },
];

const consentRecord = [
  { label: 'Cookie name', value: 'sw_cookie_consent' },
  { label: 'Storage locations', value: 'Browser cookie and localStorage' },
  { label: 'Duration', value: '365 days, unless you clear it earlier' },
  { label: 'Versioning', value: 'When the consent version changes, SignWorkflow asks again' },
  { label: 'Region helper', value: 'sw_consent_region helps decide whether to show the banner' },
];

export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
          Legal
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Cookie Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Effective July 18, 2026</p>
        <p className="mt-5 text-sm leading-7 text-slate-600">
          This Cookie Policy explains how SignWorkflow uses cookies and similar technologies
          to run the service, secure document workflows, remember preferences, measure product
          performance, and support optional marketing or analytics tools. It should be read
          together with our <Link href="/privacy" className="font-medium text-brand-600 hover:text-brand-700">Privacy Policy</Link>.
        </p>

        <div className="mt-8 space-y-10 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">What cookies are</h2>
            <p className="mt-2">
              Cookies are small text files placed on your browser or device by websites you visit.
              Similar technologies, including localStorage, pixels, tags, SDKs, and device identifiers,
              can be used for related purposes such as remembering preferences, keeping sessions secure,
              measuring traffic, or understanding how a page is used.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">How SignWorkflow uses cookies</h2>
            <p className="mt-2">
              SignWorkflow uses necessary cookies for core service behavior, including authentication,
              secure session management, workspace access, document signing flows, anti-abuse protections,
              and request integrity. Optional cookies are used only after you give consent through the
              cookie banner or preferences modal.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Cookie categories</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 md:grid-cols-[0.8fr_0.7fr_1.7fr_1.1fr]">
                <span>Category</span>
                <span className="hidden md:block">Status</span>
                <span className="hidden md:block">Examples</span>
                <span className="hidden md:block">Legal basis</span>
              </div>
              <div className="divide-y divide-slate-200">
                {cookieCategories.map((category) => (
                  <div
                    key={category.name}
                    className="grid gap-2 px-4 py-4 md:grid-cols-[0.8fr_0.7fr_1.7fr_1.1fr] md:gap-4"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{category.name}</p>
                      <p className="text-xs text-slate-500 md:hidden">{category.status}</p>
                    </div>
                    <p className="hidden text-slate-600 md:block">{category.status}</p>
                    <p className="text-slate-600">{category.examples}</p>
                    <p className="text-slate-600">{category.basis}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Google Consent Mode and analytics</h2>
            <p className="mt-2">
              SignWorkflow initializes Google Consent Mode before Google Analytics runs. By default,
              analytics storage, advertising storage, ad user data, ad personalization, and personalization
              storage are denied. Functionality and security storage are granted so the application can
              operate safely. If you accept analytics cookies, SignWorkflow may configure Google Analytics 4.
              If analytics consent is not granted, SignWorkflow does not fire GA events.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Consent storage</h2>
            <p className="mt-2">
              Your choices are saved in both a browser cookie and localStorage so they can be respected
              across page loads. The consent record stores the consent version, acceptance time, and your
              choices for necessary, analytics, marketing, and functional cookies.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {consentRecord.map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 font-medium text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Managing preferences on SignWorkflow</h2>
            <p className="mt-2">
              You can accept all optional cookies, reject all optional cookies, or customize by category.
              Necessary cookies cannot be disabled because they are required for security and core service
              operation. You can update or withdraw consent at any time.
            </p>
            <div className="mt-4">
              <CookieSettingsButton className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                Open Cookie Settings
              </CookieSettingsButton>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Browser and mobile controls</h2>
            <p className="mt-2">
              Most browsers let you block cookies, delete existing cookies, or control cookies for specific
              websites. Mobile operating systems may also provide settings for advertising identifiers,
              app tracking, or interest-based advertising. Blocking or deleting cookies may affect login,
              signing flows, saved preferences, or other parts of SignWorkflow.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Third-party providers</h2>
            <p className="mt-2">
              Optional cookies or similar technologies may be set by providers that support analytics,
              advertising, payments, communication, support, or security features. These providers process
              information under their own policies. Where consent is required, SignWorkflow seeks consent
              before enabling optional analytics or marketing technologies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Regional privacy rights</h2>
            <p className="mt-2">
              For visitors in the EEA, UK, Switzerland, and other regions that require prior consent,
              optional analytics, marketing, and functional cookies are controlled through the consent
              banner and preferences modal. California residents and other users may also have rights
              described in the Privacy Policy, including rights to know, delete, correct, or opt out
              where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Updates to this policy</h2>
            <p className="mt-2">
              We may update this Cookie Policy to reflect changes in technology, legal requirements,
              vendors, or product behavior. If the consent version changes, SignWorkflow will ask you
              to make a fresh cookie choice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Questions</h2>
            <p className="mt-2">
              If you have questions about cookies or related privacy controls, contact the team through
              the <Link href="/contact" className="font-medium text-brand-600 hover:text-brand-700">contact page</Link>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
