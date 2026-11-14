import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import {
  DASHBOARD_BUILDER_REQUEST_PATH_HEADER,
  getSafeDashboardBuilderReturnHref,
} from '@/lib/dashboard-builder-auth';
import { requireRefreshSessionOrRedirect } from '@/lib/requireRefreshSession';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const builderReturnHref = getSafeDashboardBuilderReturnHref(
    requestHeaders.get(DASHBOARD_BUILDER_REQUEST_PATH_HEADER)
  );

  await requireRefreshSessionOrRedirect(builderReturnHref);

  return <>{children}</>;
}
