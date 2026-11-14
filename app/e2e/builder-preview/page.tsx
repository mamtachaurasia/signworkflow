import { notFound } from 'next/navigation';

import { allowInternalE2ERoutes } from '@/lib/e2e-env';
import BuilderPreviewHarness from './BuilderPreviewHarness';

export const dynamic = 'force-dynamic';

export default function BuilderPreviewPage() {
  if (!allowInternalE2ERoutes()) {
    notFound();
  }

  return <BuilderPreviewHarness />;
}
