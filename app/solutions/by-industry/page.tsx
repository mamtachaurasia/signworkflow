import type { Metadata } from 'next';
import { INDUSTRIES } from '@/config/solutions.config';
import { IndustryCard } from '@/components/solutions/IndustryCard';
import { Button } from '@ui';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Solutions by Industry | SignWorkflow',
  description:
        'Browse contract lifecycle management and e-signature solutions for your industry, from Legal to Healthcare to Real Estate.',
  keywords: [
    'industry solutions',
    'by industry',
    'contract lifecycle management',
    'CLM by industry',
    'e-signature solutions',
    'document workflow by industry',
  ],
  alternates: {
    canonical: '/solutions/by-industry',
  },
  openGraph: {
    title: 'Solutions by Industry | SignWorkflow',
    description:
      'Browse contract lifecycle management and e-signature solutions for your industry, from Legal to Healthcare to Real Estate.',
    url: '/solutions/by-industry',
    type: 'website',
  },
  twitter: {
    title: 'Solutions by Industry | SignWorkflow',
    description:
      'Browse contract lifecycle management and e-signature solutions for your industry, from Legal to Healthcare to Real Estate.',
  },
};

export default function ByIndustryPage() {
  return (
    <main className="min-h-screen pt-24 pb-12 mt-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <section className="mb-16 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-4">
              Contract Lifecycle Solutions by Industry
            </h1>
            <p className="text-xl text-slate-600 max-w-3xl">
              Find lifecycle workflows designed around the unique contract, approval, signing, and retention needs of your sector.
            </p>
          </div>
        </section>

        {/* Search/Filter Section */}
        <section className="mb-12">
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600">
              Browse {INDUSTRIES.length} industry solutions or{' '}
              <Link href="/request-demo" className="text-blue-600 hover:text-blue-700 font-medium">
                contact us
              </Link>
              {' '}to discuss your specific needs.
            </p>
          </div>
        </section>

        {/* Industries Grid */}
        <section className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {INDUSTRIES.map((industry) => (
              <IndustryCard key={industry.id} industry={industry} />
            ))}
          </div>
        </section>

        {/* Comparison Section */}
        <section className="mt-20 space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Core Lifecycle Capabilities for Every Industry
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mb-8">
              Every industry solution builds on the same core platform for preparing, reviewing, approving, signing, and retaining agreements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Legal Compliance',
                description: 'UETA, ESIGN, GDPR, HIPAA, and more compliance standards.',
              },
              {
                title: 'Audit Trails',
                description: 'Complete audit logs for every signature and document action.',
              },
              {
                title: 'Mobile-First',
                description: 'Sign documents anytime, anywhere on any device.',
              },
              {
                title: 'Developer API and webhooks',
                description: 'Use scoped API keys for document workflows and signed webhooks for event delivery.',
              },
            ].map((feature, idx) => (
              <div key={idx} className="p-6 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
                <h3 className="font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="mt-20 rounded-xl bg-linear-to-r from-blue-600 to-blue-800 p-12 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Run Your Industry&apos;s Contract Lifecycle?
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Start with a free trial and see how SignWorkflow can connect contract workflows across your organization.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button
              asChild
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50"
            >
              <Link href="/register?plan=business">Start Free Trial</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white text-white hover:bg-blue-700"
            >
              <Link href="/request-demo">Request Demo</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
