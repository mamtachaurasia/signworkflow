import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Contact Sales And Partnerships',
  description:
    'Contact SignWorkflow for product questions, pricing, rollout planning, demos, and partnerships.',
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact Sales And Partnerships | SignWorkflow',
    description:
      'Contact SignWorkflow for product questions, pricing, rollout planning, demos, and partnerships.',
    url: '/contact',
  },
  twitter: {
    title: 'Contact Sales And Partnerships | SignWorkflow',
    description:
      'Contact SignWorkflow for product questions, pricing, rollout planning, demos, and partnerships.',
  },
};

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
