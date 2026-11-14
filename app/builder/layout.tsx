import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '@/styles/react-pdf.css';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function BuilderLayout({ children }: { children: ReactNode }) {
  return children;
}
