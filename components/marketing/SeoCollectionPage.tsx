import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import type { SeoPageGroup } from '@/config/seo-pages.config';
import { SEO_COLLECTIONS, getSeoLandingPagePath } from '@/config/seo-pages.config';
import JsonLd from '@/components/marketing/JsonLd';
import {
  buildBreadcrumbStructuredData,
  buildCollectionPageStructuredData,
} from '@/lib/structured-data';
import { Button } from '@ui';

export default function SeoCollectionPage({ group }: { group: SeoPageGroup }) {
  const collection = SEO_COLLECTIONS[group];
  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: collection.title, url: `/${group}` },
  ];

  return (
    <>
      <JsonLd
        data={buildCollectionPageStructuredData({
          path: `/${group}`,
          title: collection.metaTitle,
          description: collection.metaDescription,
          items: collection.pages.map((page) => ({
            name: page.name,
            description: page.metaDescription,
            url: getSeoLandingPagePath(page),
          })),
        })}
      />
      <JsonLd data={buildBreadcrumbStructuredData(breadcrumbs)} />

      <main className="bg-white pt-24">
        <section className="border-b border-slate-200 bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-200">
              SignWorkflow resources
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
              {collection.title}
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300">
              {collection.description}
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
        </section>

        <section className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <Link href="/" className="text-blue-600 hover:text-blue-700">Home</Link>
              <span className="text-slate-400">/</span>
              <span className="text-slate-900">{collection.title}</span>
            </nav>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {collection.pages.map((page) => (
              <article key={page.slug} className="rounded-lg border border-slate-200 p-6 transition hover:border-blue-300 hover:shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {page.eyebrow}
                  </span>
                  {page.statusLabel ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {page.statusLabel}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-5 font-display text-xl font-semibold text-slate-950">
                  <Link href={getSeoLandingPagePath(page)} className="hover:text-blue-700">
                    {page.name}
                  </Link>
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {page.metaDescription}
                </p>
                <ul className="mt-5 grid gap-2 text-sm text-slate-600">
                  {page.secondaryKeywords.slice(0, 3).map((keyword) => (
                    <li key={keyword} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{keyword}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={getSeoLandingPagePath(page)}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  View page
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
