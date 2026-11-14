import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Compare SignWorkflow plans for secure signing, AI document review, team controls, audit-ready records, and workspace governance.',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'Pricing | SignWorkflow',
    description:
      'Compare SignWorkflow plans for secure signing, AI document review, team controls, audit-ready records, and workspace governance.',
    url: '/pricing',
  },
  twitter: {
    title: 'Pricing | SignWorkflow',
    description:
      'Compare SignWorkflow plans for secure signing, AI document review, team controls, audit-ready records, and workspace governance.',
  },
};

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
