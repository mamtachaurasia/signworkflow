import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';
import { Button } from '@ui';
import Link from 'next/link';
import { ArrowRight, Zap, Shield, Rocket } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Solutions | SignWorkflow - E-Signature for Every Industry',
  description:
    'Industry-specific e-signature and document workflow solutions. Find the perfect solution for your business needs.',
  keywords: [
    'industry solutions',
    'e-signature by industry',
    'document workflow solutions',
    'digital signature platform',
    'enterprise e-signature',
  ],
  alternates: {
    canonical: '/solutions',
  },
  openGraph: {
    title: 'Solutions | SignWorkflow - E-Signature for Every Industry',
    description:
      'Industry-specific e-signature and document workflow solutions. Find the perfect solution for your business needs.',
    url: '/solutions',
    type: 'website',
  },
  twitter: {
    title: 'Solutions | SignWorkflow - E-Signature for Every Industry',
    description:
      'Industry-specific e-signature and document workflow solutions. Find the perfect solution for your business needs.',
  },
};

export default function SolutionsPage() {
  return (
    <main className="min-h-screen pt-24 pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <section className="mb-24 space-y-8 text-center">
          <div>
            <span className="inline-block bg-blue-100 text-blue-700 rounded-full px-4 py-2 text-sm font-semibold mb-4">
              Solutions for Every Industry
            </span>
            <h1 className="text-5xl font-bold text-slate-900 mb-6">
              E-Signature Solutions Built for Your Industry
            </h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
              Discover how {SITE_NAME} streamlines document workflows across all industries with secure, compliant e-signatures.
            </p>
            <div className="flex gap-4 justify-center">
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Link href="/solutions/by-industry" className="flex items-center gap-2">
                  Browse Solutions <ArrowRight size={18} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/request-demo">Request Demo</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="mb-24 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 mb-4">
              <Zap className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Industry-Specific Features</h3>
            <p className="text-slate-600">
              Purpose-built features for your industry&apos;s unique compliance and workflow needs.
            </p>
          </div>
          <div className="text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 mb-4">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Enterprise Security</h3>
            <p className="text-slate-600">
              Bank-level encryption and compliance with HIPAA, SOC 2, GDPR, and more.
            </p>
          </div>
          <div className="text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 mb-4">
              <Rocket className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Faster Workflows</h3>
            <p className="text-slate-600">
              Reduce document processing time from days to hours with automated approvals.
            </p>
          </div>
        </section>

        {/* Why Choose SignWorkflow */}
        <section className="mb-24 space-y-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Why Choose SignWorkflow</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Trusted by organizations across industries for secure, compliant document workflows.
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
              {
                title: 'Advanced Security',
                description: 'Bank-level encryption and data protection for all documents.',
              },
              {
                title: 'Fast Implementation',
                description: 'Quick setup and deployment without technical complexity.',
              },
              {
                title: 'Dedicated Support',
                description: 'Expert support team ready to help your organization succeed.',
              },
              {
                title: 'Proven ROI',
                description: 'Reduce costs and accelerate workflows with automation.',
              },
            ].map((feature, idx) => (
              <div key={idx} className="p-6 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-lg transition-all">
                <h3 className="font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 p-12 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Transform Your Workflows?
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Explore industry-specific solutions and see how SignWorkflow can streamline your document processes.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button
              asChild
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50"
            >
              <Link href="/solutions/by-industry">Browse All Solutions</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white text-white hover:bg-blue-700"
            >
              <Link href="/request-demo">Schedule Demo</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
