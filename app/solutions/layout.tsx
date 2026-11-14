import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    template: '%s | SignWorkflow Solutions',
    default: 'Solutions | SignWorkflow',
  },
};

export default function SolutionsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
