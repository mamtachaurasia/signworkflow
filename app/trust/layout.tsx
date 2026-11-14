import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Trust Center | SignWorkflow Security and Compliance Posture',
  description:
    'Review SignWorkflow security practices, privacy posture, compliance roadmap, data controls, subprocessors, and responsible disclosure information.',
  alternates: {
    canonical: '/trust',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TrustLayout({ children }: { children: ReactNode }) {
  return children;
}
