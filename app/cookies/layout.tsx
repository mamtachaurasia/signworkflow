import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description:
    'Read how SignWorkflow uses necessary, functional, analytics, and marketing cookies, including consent storage and preference controls.',
  alternates: {
    canonical: '/cookies',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function CookiesLayout({ children }: { children: ReactNode }) {
  return children;
}
