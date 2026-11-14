import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Free Document Templates',
  description:
    'Browse ready-to-use agreement and business document templates. Preview a template and start preparing it for e-signature without creating an account.',
  alternates: {
    canonical: '/templates',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TemplatesLayout({ children }: { children: ReactNode }) {
  return children;
}
