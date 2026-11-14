import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Why SignWorkflow',
  description:
    'SignWorkflow is a governance-first eSignature and approval workflow platform. Manage approvals, signatures, retention policies, audit trails and teams in one workspace. See why teams choose SignWorkflow for workspace-first signing, audit-ready records, and repeatable document workflows.',
  alternates: {
    canonical: '/why-signWorkflow',
  },
};

export default function WhySignWorkflowLayout({ children }: { children: ReactNode }) {
  return children;
}
