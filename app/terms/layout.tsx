import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Terms of Use | SignWorkflow',
  description:
    'Read the SignWorkflow terms for accounts, workspaces, e-signatures, AI document review, subscriptions, retention, audit records, and acceptable use.',
  alternates: {
    canonical: '/terms',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
