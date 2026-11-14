import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Request A Demo',
  description:
    'Book a SignWorkflow demo to review signing workflows, rollout planning, templates, routing, and workspace controls.',
  alternates: {
    canonical: '/request-demo',
  },
  openGraph: {
    title: 'Request A Demo | SignWorkflow',
    description:
      'Book a SignWorkflow demo to review signing workflows, rollout planning, templates, routing, and workspace controls.',
    url: '/request-demo',
  },
  twitter: {
    title: 'Request A Demo | SignWorkflow',
    description:
      'Book a SignWorkflow demo to review signing workflows, rollout planning, templates, routing, and workspace controls.',
  },
};

export default function RequestDemoLayout({ children }: { children: ReactNode }) {
  return children;
}
