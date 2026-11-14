import { ArrowRight, CheckCircle2, GitCompare, Link2, ListChecks, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import type { SeoLandingPage as SeoLandingPageContent } from '@/config/seo-pages.config';
import { getSeoLandingPagePath } from '@/config/seo-pages.config';
import JsonLd from '@/components/marketing/JsonLd';
import {
  buildBreadcrumbStructuredData,
  buildFaqStructuredData,
  buildWebPageStructuredData,
} from '@/lib/structured-data';
import { Button } from '@ui';

type SeoLandingPageProps = {
  page: SeoLandingPageContent;
};

export default function SeoLandingPage({ page }: SeoLandingPageProps) {
  const path = getSeoLandingPagePath(page);
  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: groupLabel(page.group), url: `/${page.group}` },
    { name: page.name, url: path },
  ];

  return (
    <>
      <JsonLd
        data={buildWebPageStructuredData({
          path,
          title: page.metaTitle,
          description: page.metaDescription,
          breadcrumbs,
        })}
      />
      <JsonLd data={buildBreadcrumbStructuredData(breadcrumbs)} />
      <JsonLd data={buildFaqStructuredData(page.faqs)} />

      <main className="bg-white pt-24">
        <section className="border-b border-slate-200 bg-slate-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-200">
                  {page.eyebrow}
                </span>
                {page.statusLabel ? (
                  <span className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                    {page.statusLabel}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">
                {page.title}
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300">
                {page.description}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild variant="brand" size="lg">
                  <Link href="/register">
                    Start free trial
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                  <Link href="/request-demo">Request demo</Link>
                </Button>
              </div>
            </div>

            <aside className="self-start rounded-lg border border-white/10 bg-white/5 p-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Workflow focus
              </p>
              <p className="mt-3 text-2xl font-semibold text-white">{page.primaryKeyword}</p>
              <ul className="mt-6 grid gap-3 text-sm text-slate-300">
                {page.heroBullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {breadcrumbs.map((item, index) => (
                <span key={item.url} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-slate-400">/</span> : null}
                  {index === breadcrumbs.length - 1 ? (
                    <span className="text-slate-900">{item.name}</span>
                  ) : (
                    <Link href={item.url} className="text-blue-600 hover:text-blue-700">
                      {item.name}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ListChecks className="h-5 w-5" />
            </span>
            <h2 className="mt-5 font-display text-3xl font-semibold text-slate-950">
              {page.painTitle}
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              This workflow is built for {page.audience} that need signing to fit a real
              business process, not just a one-off signature request.
            </p>
          </div>
          <div className="grid gap-3">
            {page.painPoints.map((point) => (
              <div key={point} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm leading-6 text-slate-700">{point}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <h2 className="font-display text-3xl font-semibold text-slate-950">
                {page.outcomeTitle}
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                SignWorkflow focuses on the whole document journey: preparation, approval, signing,
                audit context, and the completed record.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {page.outcomes.map((outcome) => (
                <article key={outcome.title} className="rounded-lg border border-slate-200 bg-white p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-semibold text-slate-950">
                    {outcome.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {outcome.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Link2 className="h-5 w-5" />
              </span>
              <h2 className="mt-5 font-display text-3xl font-semibold text-slate-950">
                {page.processTitle}
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                A simple pilot should prove speed, clarity, signer completion, and record quality before
                the workflow is expanded.
              </p>
            </div>
            <ol className="grid gap-4">
              {page.steps.map((step, index) => (
                <li key={step.title} className="rounded-lg border border-slate-200 p-5">
                  <div className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-slate-950">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{step.description}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {page.comparisonRows?.length ? (
          <section className="border-y border-slate-200 bg-slate-50">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <GitCompare className="h-5 w-5" />
                </span>
                <h2 className="font-display text-3xl font-semibold text-slate-950">
                  Feature comparison
                </h2>
              </div>
              <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th scope="col" className="px-5 py-4 font-semibold">Evaluation area</th>
                      <th scope="col" className="px-5 py-4 font-semibold">SignWorkflow</th>
                      <th scope="col" className="px-5 py-4 font-semibold">Alternative to evaluate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {page.comparisonRows.map((row) => (
                      <tr key={row.feature}>
                        <th scope="row" className="px-5 py-4 font-semibold text-slate-950">
                          {row.feature}
                        </th>
                        <td className="px-5 py-4 leading-6 text-slate-600">{row.signWorkflow}</td>
                        <td className="px-5 py-4 leading-6 text-slate-600">{row.alternative}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div>
            <h2 className="font-display text-3xl font-semibold text-slate-950">
              {page.proofTitle}
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              A good signing workflow should reduce manual follow-up, protect the completed record,
              and make the next step obvious for every owner involved.
            </p>
          </div>
          <div className="grid gap-3">
            {page.proofPoints.map((point) => (
              <div key={point} className="flex gap-3 rounded-lg border border-slate-200 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <p className="text-sm leading-6 text-slate-700">{point}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
            <h2 className="font-display text-3xl font-semibold text-slate-950">
              Frequently asked questions
            </h2>
            <div className="mt-8 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {page.faqs.map((faq) => (
                <details key={faq.question} className="group p-5">
                  <summary className="cursor-pointer list-none font-semibold text-slate-950">
                    {faq.question}
                  </summary>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:px-8">
          <div>
            <h2 className="font-display text-3xl font-semibold text-slate-950">
              Ready to test this workflow?
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Start with one document type, one owner, and one completion goal. That keeps the pilot
              focused and makes it easier to measure turnaround time and completion quality.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="brand" size="lg">
                <Link href="/register">
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/pricing">View pricing</Link>
              </Button>
            </div>
          </div>
          <aside className="rounded-lg border border-slate-200 p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Related pages
            </p>
            <div className="mt-5 grid gap-3">
              {page.relatedLinks.map((link) => (
                <Link
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  className="group flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                >
                  {link.label}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}

function groupLabel(group: SeoLandingPageContent['group']) {
  switch (group) {
    case 'use-cases':
      return 'Use Cases';
    case 'integrations':
      return 'Integrations';
    case 'alternatives':
      return 'Alternatives';
    case 'compare':
      return 'Comparisons';
  }
}
