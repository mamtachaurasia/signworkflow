'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import {
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  PlayCircle,
  Plug,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@ui';
import Stats from '@/components/common/Stats';

type CalendlyApi = {
  initInlineWidget: (options: {
    url: string;
    parentElement: HTMLElement;
  }) => void;
};

const calendlyUrl = 'https://calendly.com/signworkflow/30min?hide_event_type_details=1&hide_gdpr_banner=1';


const features = [
  {
    icon: BrainCircuit,
    title: 'AI Document Intelligence',
    description: 'Summaries, translation, clause explanations and risk analysis before documents are signed.',
  },
  {
    icon: CheckCircle2,
    title: 'Send & Sign in Minutes',
    description: 'Drag-and-drop fields, works on any device, get signatures fast.',
  },
  {
    icon: ShieldCheck,
    title: 'Security-Focused Controls',
    description: 'Audit visibility, role-based access, and governance-aware document workflows for growing teams.',
  },
  {
    icon: Plug,
    title: 'Seamless Integrations',
    description: 'Google Drive and Dropbox exports are available today; discuss additional integration needs with the team.',
  },
];

const engagementTopics = [
  {
    title: 'Workflow design',
    description: 'We map how documents move from draft to signature, where approvals occur, and what needs to stay auditable.',
  },
  {
    title: 'Compliance and controls',
    description: 'You can ask about access, retention, evidence capture, and how teams keep approvals consistent at scale.',
  },
  {
    title: 'AI-assisted review',
    description: 'The session can show how summaries, clause explanations, and translation fit into the review step before signoff.',
  },
  {
    title: 'Rollout planning',
    description: 'We discuss change management, adoption, and how to introduce automated signing without slowing your team down.',
  },
];

const nextSteps = ['A clear view of how your current workflow could be simplified.', 'A practical recommendation for the right package and rollout path.', 'A better sense of how AI review, approvals, and signing fit together.'];


function initializeCalendlyWidget(container: HTMLDivElement | null) {
  if (!container) {
    return;
  }

  const calendly = (window as typeof window & { Calendly?: CalendlyApi }).Calendly;
  if (!calendly) {
    return;
  }

  container.innerHTML = '';
  calendly.initInlineWidget({
    url: calendlyUrl,
    parentElement: container,
  });
}

export default function RequestDemoClient() {
  const calendlyContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeCalendlyWidget(calendlyContainerRef.current);
  }, []);

  return (
    <div className="w-full bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_24%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eef6ff_44%,#ffffff_100%)] pt-12">
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="afterInteractive"
        onLoad={() => initializeCalendlyWidget(calendlyContainerRef.current)}
      />

      <section className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 lg:px-8 ">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="min-w-0 max-w-3xl">
            <h1 className="mt-4 text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
              See How <span className="text-brand-light">SignWorkflow</span> Transforms
              <br className="hidden sm:block" />Your Contract <span className="text-brand-light">Workflow</span>
            </h1>
            <p className="mt-4 text-base text-slate-600">
              Book a tailored walkthrough for your signing workflow, rollout questions, and operational requirements. We&apos;ll show how AI review fits alongside signing so you can evaluate fit quickly and leave with an actionable next step.
            </p>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">What you can cover in the session</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {engagementTopics.map((topic) => (
                  <div key={topic.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">{topic.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{topic.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-10 mt-6 space-y-4">
              {features.map((feature) => (
                <div key={feature.title} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(31,166,160,0.12)' }}>
                    <feature.icon className="h-5 w-5 text-teal" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{feature.title}</p>
                    <p className="text-sm text-text-secondary">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

          
          </div>

          <div className="relative min-w-0 space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="bg-[linear-gradient(135deg,#0f172a_0%,#0f3a62_45%,#0b5cab_100%)] px-6 py-7 text-white sm:px-8">
                <span className="text-xs text-sky-200">Live demo scheduling</span>
                <h2 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
                  <CalendarDays className="h-6 w-6" /> Pick a time that works for you
                </h2>
                <p className="mt-1 text-xs text-sky-100">
                  Choose an available slot instantly. We&apos;ll use the session to focus on your workflow, rollout questions, and the product path you want to review.
                </p>
              </div>

              <div
                ref={calendlyContainerRef}
                className="calendly-inline-widget min-w-0 overflow-hidden bg-white"
                data-url={calendlyUrl}
                style={{ minWidth: 0, width: '100%', height: '480px' }}
                aria-label="Calendly scheduling widget"
              />
            </div>
            
            
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">What you&apos;ll leave with</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                {nextSteps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 rounded-xl border border-slate-200 bg-white/75 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-sky-700">Prefer to explore on your own first?</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Start with the product overview, then come back for a tailored rollout conversation.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 md:mt-0">
                  <Button size="sm" asChild variant="outline" className="w-full">
                    <Link href="/#how-it-works">
                      Watch the product flow
                      <PlayCircle className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="sm" asChild variant="outline" className="w-full">
                    <Link href="/pricing">
                      Compare plans
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

          </div>



        </div>
      </section>
      <Stats />
    </div>
  );
}
