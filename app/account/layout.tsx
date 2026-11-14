import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireRefreshSessionOrRedirect } from '@/lib/requireRefreshSession';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requireRefreshSessionOrRedirect();

  return <div className="account-theme">{children}</div>;
}
