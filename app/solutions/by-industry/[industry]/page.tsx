import type { Metadata } from 'next';
import { INDUSTRIES } from '@/config/solutions.config';
import { IndustryDetails, getIndustryFaqs } from '@/components/solutions/IndustryDetails';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import JsonLd from '@/components/marketing/JsonLd';
import {
  buildBreadcrumbStructuredData,
  buildFaqStructuredData,
  buildWebPageStructuredData,
} from '@/lib/structured-data';

interface IndustryPageProps {
  params: Promise<{ industry: string }>;
}

export async function generateMetadata({ params }: IndustryPageProps): Promise<Metadata> {
  const { industry: industrySlug } = await params;
  const industry = INDUSTRIES.find((ind) => ind.slug === industrySlug);

  if (!industry) {
    return {
      title: 'Industry Not Found',
    };
  }

  const path = `/solutions/by-industry/${industry.slug}`;
  const title = `Contract Lifecycle and E-Signature Solutions for ${industry.name} | SignWorkflow`;
  const description = `${industry.shortDescription} Learn how SignWorkflow helps ${industry.name.toLowerCase()} teams manage contract preparation, approvals, e-signatures, and retention.`;

  return {
    title,
    description,
    keywords: [
      industry.name.toLowerCase(),
      'contract lifecycle management',
      'CLM software',
      'e-signature',
      'digital signature',
      'document workflow',
      ...industry.keywords,
    ],
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: path,
    },
    twitter: {
      title,
      description,
    },
  };
}

export async function generateStaticParams() {
  return INDUSTRIES.map((industry) => ({
    industry: industry.slug,
  }));
}

export default async function IndustryPage({ params }: IndustryPageProps) {
  const { industry: industrySlug } = await params;
  const industry = INDUSTRIES.find((ind) => ind.slug === industrySlug);

  if (!industry) {
    notFound();
  }

  const path = `/solutions/by-industry/${industry.slug}`;
  const title = `E-Signature Solutions for ${industry.name} | SignWorkflow`;
  const description = `${industry.shortDescription} Learn how SignWorkflow helps ${industry.name.toLowerCase()} teams manage contract preparation, approvals, e-signatures, and retention.`;
  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Contract Lifecycle Solutions', url: '/solutions/by-industry' },
    { name: industry.name, url: path },
  ];

  return (
    <>
      <JsonLd
        data={buildWebPageStructuredData({
          path,
          title,
          description,
          breadcrumbs,
        })}
      />
      <JsonLd data={buildBreadcrumbStructuredData(breadcrumbs)} />
      <JsonLd data={buildFaqStructuredData(getIndustryFaqs(industry))} />

      <main className="min-h-screen pt-20 pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <IndustryDetails industry={industry} />

          <section className="mt-20 pt-12 border-t border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Other Industries</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {INDUSTRIES.filter((ind) => ind.id !== industry.id)
                .slice(0, 3)
                .map((relatedIndustry) => (
                  <Link
                    key={relatedIndustry.id}
                    href={`/solutions/by-industry/${relatedIndustry.slug}`}
                    className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <h3 className="font-semibold text-slate-900 hover:text-blue-600">
                      {relatedIndustry.name}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {relatedIndustry.shortDescription}
                    </p>
                  </Link>
                ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
