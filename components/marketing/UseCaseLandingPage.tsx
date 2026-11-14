import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@ui';
import AuthAwareCta from '@/components/marketing/AuthAwareCta';

type UseCaseCard = {
  title: string;
  description: string;
};

type UseCaseStep = {
  title: string;
  description: string;
};

type UseCaseLandingPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  ocidPrefix: string;
  painTitle: string;
  painPoints: string[];
  outcomes: UseCaseCard[];
  steps: UseCaseStep[];
  proofTitle: string;
  proofItems: string[];
  finalTitle: string;
  finalDescription: string;
};

const stepIcons: LucideIcon[] = [ClipboardCheck, FileCheck2, FileClock];

export default function UseCaseLandingPage({
  eyebrow,
  title,
  description,
  primaryLabel,
  ocidPrefix,
  painTitle,
  painPoints,
  outcomes,
  steps,
  proofTitle,
  proofItems,
  finalTitle,
  finalDescription,
}: UseCaseLandingPageProps) {
  return (
    <main className="mt-24 bg-white">
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-20">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600">
            {description}
          </p>
          <div className="mt-8">
            <AuthAwareCta primaryLabel={primaryLabel} ocidPrefix={`${ocidPrefix}.hero`} />
          </div>
        </div>

        <Card className="self-start rounded-lg border-slate-200 p-6">
          <h2 className="font-display text-xl font-semibold text-slate-950">
            {painTitle}
          </h2>
          <div className="mt-6 space-y-4">
            {painPoints.map((point) => (
              <div key={point} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <p className="text-sm leading-6 text-slate-700">{point}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {outcomes.map((outcome) => (
              <Card key={outcome.title} className="rounded-lg p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h2 className="mt-5 font-display text-lg font-semibold text-slate-950">
                  {outcome.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {outcome.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="font-display text-3xl font-semibold text-slate-950">
            A practical workflow from draft to completed record
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            SignWorkflow is strongest when the team needs more than a signature link. It helps the process stay visible
            before, during, and after signing.
          </p>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = stepIcons[index] ?? ClipboardCheck;
            return (
              <Card key={step.title} className="rounded-lg p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold text-slate-950">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {step.description}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <h2 className="font-display text-3xl font-semibold text-slate-950">
              {proofTitle}
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              These pages are built for teams comparing tools, but the product promise is simple: fewer scattered
              approvals, clearer ownership, and a better record after the signature is complete.
            </p>
          </div>
          <div className="grid gap-3">
            {proofItems.map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <p className="text-sm leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-lg border border-slate-200 bg-slate-950 p-6 text-white sm:p-8 lg:grid-cols-[1fr_0.75fr] lg:p-10">
          <div>
            <h2 className="font-display text-3xl font-semibold">{finalTitle}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              {finalDescription}
            </p>
            <div className="mt-8">
              <AuthAwareCta
                primaryLabel={primaryLabel}
                surface="dark"
                ocidPrefix={`${ocidPrefix}.final`}
              />
            </div>
          </div>
          <div className="content-start rounded-lg border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-300">
              Explore next
            </p>
            <div className="mt-5 grid gap-3">
              <Link href="/why-signWorkflow" className="group flex items-center justify-between rounded-lg bg-white/5 p-4 text-sm text-slate-100 transition hover:bg-white/10">
                Why SignWorkflow
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link href="/pricing" className="group flex items-center justify-between rounded-lg bg-white/5 p-4 text-sm text-slate-100 transition hover:bg-white/10">
                Pricing
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
