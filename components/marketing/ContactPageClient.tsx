'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  BadgeDollarSign,
  BrainCircuit,
  Clock3,
  Ellipsis,
  Mail,
  Newspaper,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

import { Button, Card, Input, Select, Textarea } from '@ui';
import { COMPANY } from '@/lib/site';

type ContactFormData = {
  firstName: string;
  lastName: string;
  workEmail: string;
  topic: 'sales' | 'general' | 'press';
  subject: string;
  teamSize: '1-10' | '11-50' | '51-200' | '200+';
  message: string;
  contactConfirmation: string;
};

type ContactMethod = {
  title: string;
  description: string;
  icon: typeof Mail;
  accent: string;
  detail: string;
  href: string;
  hrefLabel: string;
};

const contactMethods: ContactMethod[] = [
  {
    title: 'General Inquiry',
    description: 'Questions about workflows, product fit, or how SignWorkflow works day to day.',
    icon: Mail,
    accent: 'bg-sky-50 text-sky-700 ring-sky-100',
    detail: 'For product fit and general business questions',
    href: `mailto:${COMPANY.contact.general}`,
    hrefLabel: COMPANY.contact.general,
  },
  {
    title: 'Sales',
    description: 'Pricing, demos, AI document review, rollout planning, and choosing the right workspace package.',
    icon: BadgeDollarSign,
    accent: 'bg-amber-50 text-amber-700 ring-amber-100',
    detail: 'Best for new teams evaluating paid plans',
    href: `mailto:${COMPANY.contact.sales}`,
    hrefLabel: COMPANY.contact.sales,
  },
  {
    title: 'Support',
    description: 'Help with signing, sending, account setup, or operational issues in production.',
    icon: Wrench,
    accent: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    detail: 'Create and track a ticket in the help center',
    href: 'https://support.signworkflow.com/create',
    hrefLabel: 'Open the SignWorkflow Help Center',
  },
  {
    title: 'Media & Press',
    description: 'Partnership, press, and public-facing communications related to the product.',
    icon: Newspaper,
    accent: 'bg-violet-50 text-violet-700 ring-violet-100',
    detail: 'For interviews, announcements, and brand requests',
    href: `mailto:${COMPANY.contact.press}`,
    hrefLabel: COMPANY.contact.press,
  },
];

const engagementHighlights = [
  {
    title: 'Switching from legacy tools',
    description: 'Teams often want a smoother path from emailed signatures and paper-based approvals into a managed workflow.',
  },
  {
    title: 'Rolling out approvals across teams',
    description: 'We help operations and legal leaders design approval paths that are visible, auditable, and easy to scale.',
  },
  {
    title: 'Evaluating AI-assisted review',
    description: 'Many conversations cover summaries, clause explanations, translation, and risk checks before signature.',
  },
  {
    title: 'Planning a secure launch',
    description: 'Leaders ask about permissions, governance, integrations, and how to keep work moving without losing control.',
  },
];

const intakeNotes = [
  {
    title: 'Fast triage',
    description: 'We route business, sales, and media conversations to the right team first instead of bouncing you between inboxes.',
  },
  {
    title: 'Clear next step',
    description: 'Every inquiry should leave with a next action: demo, reply, troubleshooting path, or ownership handoff.',
  },
  {
    title: 'Security-aware',
    description: 'For compliance and operational questions, we keep the conversation anchored in documented product behavior.',
  },
];

const darkFieldLabelClassName = 'text-sm font-medium text-slate-100';
const darkFieldHintClassName = 'text-slate-400';
const selectClassName = 'mt-2 w-full rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-400/20';

export default function ContactPageClient() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      workEmail: '',
      topic: 'sales',
      subject: '',
      teamSize: '1-10',
      message: '',
      contactConfirmation: '',
    },
  });

  async function onSubmit(data: ContactFormData) {
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        const message =
          typeof result?.error === 'string'
            ? result.error
            : 'Failed to send message. Please try again.';
        throw new Error(message);
      }

      toast.success('Message received.');
      reset();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to send message. Please try again.'
      );
    }
  }

  return (
    <section className="mx-auto max-w-7xl overflow-hidden py-24">
      <div className="grid min-w-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0 p-4 sm:p-10 lg:p-12">
          <p className="flex items-end font-semibold uppercase text-brand-500">
            Let&apos;s talk <Ellipsis className="ml-1 h-4 w-4 text-sky-500" />
          </p>

          <h1 className="text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">Talk to the team behind your signing workflow</h1>
          <p className="mt-3 max-w-2xl text-base text-slate-600 md:text-lg">
            Whether you&apos;re switching from a legacy e-signature tool, rolling out approvals across teams, or evaluating AI-assisted review before signature, this page is meant to make the next step feel practical and straightforward.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Clock3 className="h-4 w-4 text-sky-600" />
                Response time
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                For product issues, open a support request in the Help Center. For sales and general questions, email the support team directly.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <BrainCircuit className="h-4 w-4 text-sky-600" />
                AI rollout
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Sales conversations can cover summaries, translation, clause explanations, risk analysis, and plan fit.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-sky-600" />
                Product trust
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">We keep security and workflow questions anchored in the actual product behavior.</p>
            </div>
          </div>

          <div className="mt-8 ">
            <h2 className="text-lg font-semibold text-slate-900">Why teams reach out</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {engagementHighlights.map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Best route for your question</h2>
                <p className="mt-1 text-sm text-slate-600">Pick the channel that matches the kind of help you need.</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/pricing">
                  View packages
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              {contactMethods.map((method) => {
                const Icon = method.icon;

                return (
                  <Card key={method.title} className="group relative transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_40px_-30px_rgba(14,165,233,0.55)]">
                    <a href={method.href} className="block p-5">
                      <div className="flex items-start gap-4">
                        <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${method.accent}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-slate-900">{method.title}</h3>
                            <ArrowRight className="absolute right-3 h-4 w-4 text-slate-300 transition group-hover:text-sky-600" />
                          </div>
                          <p className="text-sm text-slate-600">{method.description}</p>
                          <p className="text-xs font-medium uppercase text-slate-400">{method.detail}</p>
                          <p className="break-all text-sm font-semibold text-sky-700">{method.hrefLabel}</p>
                        </div>
                      </div>
                    </a>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-none bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] p-4 sm:p-10 lg:rounded-2xl">
          <p className="text-sm font-semibold uppercase text-sky-200">Message intake</p>
          <h2 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">Tell us what you’re trying to solve.</h2>
          <p className="mt-4 text-sm text-slate-300">Share a bit about your workflow, your team, and the outcome you need so we can route your request to the right expert.</p>

          <form className="relative mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="absolute -le  ft-2500 top-auto h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="contactConfirmation">Leave this field empty</label>
              <input
                id="contactConfirmation"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                {...register('contactConfirmation')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Input
                  id="firstName"
                  type="text"
                  label="First Name"
                  autoComplete="given-name"
                  maxLength={100}
                  tone="dark"
                  labelClassName={darkFieldLabelClassName}
                  hintClassName={darkFieldHintClassName}
                  {...register('firstName', { required: 'First name is required' })}
                />
                {errors.firstName ? (
                  <p className="mt-1 text-xs text-red-400">{errors.firstName.message}</p>
                ) : null}
              </div>
              <div>
                <Input
                  id="lastName"
                  type="text"
                  label="Last Name"
                  autoComplete="family-name"
                  maxLength={100}
                  tone="dark"
                  labelClassName={darkFieldLabelClassName}
                  hintClassName={darkFieldHintClassName}
                  {...register('lastName', { required: 'Last name is required' })}
                />
                {errors.lastName ? (
                  <p className="mt-1 text-xs text-red-400">{errors.lastName.message}</p>
                ) : null}
              </div>
            </div>

            <div>
              <Input
                id="workEmail"
                type="email"
                label="Work Email"
                autoComplete="email"
                maxLength={320}
                tone="dark"
                labelClassName={darkFieldLabelClassName}
                hintClassName={darkFieldHintClassName}
                {...register('workEmail', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
              />
              {errors.workEmail ? (
                <p className="mt-1 text-xs text-red-400">{errors.workEmail.message}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_0.8fr]">
              <div>
                <label htmlFor="topic" className={darkFieldLabelClassName}>Topic</label>
                <Select id="topic" tone="dark" className={selectClassName} {...register('topic')}>
                  <option value="sales">Sales & workspace planning</option>
                  <option value="general">General inquiry</option>
                  <option value="press">Media & press</option>
                </Select>
              </div>
              <div>
                <label htmlFor="teamSize" className={darkFieldLabelClassName}>Team Size</label>
                <Select id="teamSize" tone="dark" className={selectClassName} {...register('teamSize')}>
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="200+">200+</option>
                </Select>
              </div>
            </div>

            <div>
              <Input
                id="subject"
                label="Subject"
                maxLength={200}
                tone="dark"
                labelClassName={darkFieldLabelClassName}
                hintClassName={darkFieldHintClassName}
                placeholder="A short summary of your request"
                {...register('subject', {
                  maxLength: { value: 200, message: 'Subject must be 200 characters or fewer' },
                })}
              />
              {errors.subject ? (
                <p className="mt-1 text-xs text-red-400">{errors.subject.message}</p>
              ) : null}
            </div>

            <div>
              <Textarea
                id="message"
                rows={5}
                maxLength={5000}
                tone="dark"
                label="What do you need help with?"
                labelClassName={darkFieldLabelClassName}
                hintClassName={darkFieldHintClassName}
                className="resize-none"
                placeholder="Tell us about your workflow, package question, issue, or rollout goal."
                {...register('message', { required: 'Message is required' })}
              />
              {errors.message ? (
                <p className="mt-1 text-xs text-red-400">{errors.message.message}</p>
              ) : null}
            </div>

            <div className="mb-1 p-3 text-xs text-slate-300">
              By submitting this form, you agree to the processing of your information as described in our{' '}
              <Link href="/privacy" className="font-semibold text-sky-300 underline-offset-4 hover:underline">Privacy Policy</Link>.{' '}
              Response times vary by inquiry type and complexity.
            </div>

            <Button
              size="sm"
              type="submit"
              className="w-full justify-center"
              trailingIcon={<ArrowRight className="h-4 w-4" />}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send message'}
            </Button>
          </form>

          <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {intakeNotes.map((note) => (
              <div key={note.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-semibold text-white">{note.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{note.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
