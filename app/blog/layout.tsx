import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Blog | E-Signature Workflow Guides',
  description:
    'Read SignWorkflow articles on signing workflows, document operations, workspace control, and product guidance.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'SignWorkflow Blog',
    description:
      'Guides on e-signature workflows, document operations, workspace control, and product rollout.',
    type: 'website',
    url: '/blog',
  },
};

export default function BlogLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-white pt-20">{children}</main>
}
