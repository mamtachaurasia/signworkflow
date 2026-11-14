import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'DocuSign Alternative for Team Workflows | SignWorkflow',
  description:
    'Looking for an eSignature workflow tool? SignWorkflow helps teams manage approvals, signing, audit visibility, and document governance from one workspace.',
  alternates: {
    canonical: '/docusign-alternative',
  },
};

export default function DocusignAlternativeIndiaLayout({ children }: { children: ReactNode }) {
  return children;
}
