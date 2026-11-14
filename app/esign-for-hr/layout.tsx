import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'eSignature Workflows for HR Teams | SignWorkflow',
  description:
    'Send offer letters, onboarding forms, policy acknowledgements, and employee documents with approval workflows, team controls, and audit-ready records.',
  alternates: {
    canonical: '/esign-for-hr',
  },
};

export default function EsignForHrLayout({ children }: { children: ReactNode }) {
  return children;
}
