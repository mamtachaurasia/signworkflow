import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Security Policy',
  description:
    'Read the SignWorkflow security policy covering access controls, audit trails, data protection, operational security, and compliance posture.',
  alternates: {
    canonical: '/security',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function SecurityLayout({ children }: { children: ReactNode }) {
  return children;
}
