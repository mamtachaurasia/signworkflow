import type { Industry } from '@/config/solutions.config';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@ui';
import type { StructuredFaq } from '@/lib/structured-data';

interface IndustryDetailsProps {
  industry: Industry;
}

export function getIndustryFaqs(industry: Industry): StructuredFaq[] {
  return [
    {
      question: `Can ${industry.name.toLowerCase()} teams use electronic signatures?`,
      answer: `Yes. SignWorkflow supports ${industry.name.toLowerCase()} document workflows with signing, approval routing, audit visibility, and retention-aware records.`,
    },
    {
      question: `What documents can ${industry.name.toLowerCase()} teams send?`,
      answer: `${industry.name} teams commonly send ${industry.typicalDocuments.slice(0, 3).join(', ').toLowerCase()}, and other recurring documents that need signer accountability.`,
    },
    {
      question: 'Can SignWorkflow support multi-step approvals?',
      answer: 'Yes. Teams can route documents through approvers, viewers, and signers so review and signature activity stay connected.',
    },
    {
      question: 'How does SignWorkflow help with audit readiness?',
      answer: 'Completed documents can stay connected to signing status, activity context, workspace ownership, and retention controls.',
    },
  ];
}

export function IndustryDetails({ industry }: IndustryDetailsProps) {
  const overviewBullets = [
    `${industry.name} teams often need faster approvals, clearer ownership, and stronger document accountability.`,
    `SignWorkflow supports the full document lifecycle for ${industry.name.toLowerCase()} use cases, from preparation to signature to storage.`,
  ];
  const faqs = getIndustryFaqs(industry);

  return (
    <div className="space-y-12 mt-12">
      <section className="space-y-4">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase text-blue-600">
            Industry solution
          </p>
          <h1 className="text-4xl font-bold text-slate-900">
            E-Signature Solutions for {industry.name}
          </h1>
          <p className="text-xl leading-8 text-slate-600">
            {industry.description}
          </p>
          <p className="max-w-3xl text-lg text-slate-600">
            {industry.overview}
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
              <Link href="/register?plan=business">Start Free Trial</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/request-demo">Request Demo</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8">
          <h2 className="text-2xl font-bold text-slate-900">What this page covers</h2>
          <ul className="mt-5 space-y-3 text-slate-600">
            {overviewBullets.map((bullet, index) => (
              <li key={index} className="flex gap-3">
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-green-500" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-8">
          <h3 className="text-xl font-semibold text-slate-900">Best fit for</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {industry.idealFor.map((item) => (
              <span key={item} className="rounded-full border border-blue-200 bg-white px-3 py-1 text-sm font-medium text-blue-700">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-slate-900">Why {industry.name} Teams Choose SignWorkflow</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {industry.benefits.map((benefit, idx) => (
            <div key={idx} className="flex gap-4 rounded-lg bg-slate-50 p-4">
              <CheckCircle2 className="mt-1 h-6 w-6 flex-shrink-0 text-green-500" />
              <div>
                <h3 className="font-semibold text-slate-900">{benefit}</h3>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-slate-900">Typical documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {industry.typicalDocuments.map((document, idx) => (
            <div key={idx} className="rounded-lg border border-slate-200 p-4 transition-colors hover:border-blue-300">
              <h3 className="font-semibold text-slate-900">{document}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-slate-900">Compliance & security</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {industry.complianceFocus.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">{item}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-slate-900">What teams automate</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {industry.automationIdeas.map((idea, idx) => (
            <div key={idx} className="rounded-lg border border-slate-200 p-4 hover:border-blue-300 transition-colors">
              <h3 className="font-semibold text-slate-900">{idea}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6 rounded-2xl bg-linear-to-r from-blue-50 to-indigo-50 p-8">
        <h2 className="text-3xl font-bold text-slate-900">Why SignWorkflow for {industry.name}?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Industry-specific flows</h3>
            <p className="text-slate-600">Built for the unique approval paths and document needs of {industry.name.toLowerCase()} teams.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Secure access controls</h3>
            <p className="text-slate-600">Workspace roles, authenticated routes, and audit-oriented records help protect sensitive documents and approvals.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Seamless integration</h3>
            <p className="text-slate-600">Works with existing CRM, ERP, HR, and collaboration tools for a smoother workflow.</p>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-slate-900">Frequently asked questions</h2>
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {faqs.map((faq) => (
            <details key={faq.question} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold text-slate-950">
                {faq.question}
              </summary>
              <p className="mt-3 text-sm leading-7 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-6 rounded-lg bg-slate-900 p-12 text-center text-white">
        <h2 className="text-3xl font-bold">Ready to Transform {industry.name} Workflows?</h2>
        <p className="mx-auto max-w-2xl text-lg text-slate-300">
          Join organizations across {industry.name.toLowerCase()} using SignWorkflow for faster, more secure document processes.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" >
            <Link href="/register?plan=business" className="flex items-center gap-2">
              Start Free Trial <ArrowRight size={18} />
            </Link>
          </Button>
            <Button asChild variant="outline" size="lg">
            <Link href="/request-demo">Schedule Demo</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
