import { notFound } from 'next/navigation';

import { allowInternalE2ERoutes } from '@/lib/e2e-env';
import LiveBuilderPreviewHarness from './LiveBuilderPreviewHarness';

export const dynamic = 'force-dynamic';

export default function LiveBuilderPreviewPage() {
  if (!allowInternalE2ERoutes()) {
    notFound();
  }

  return <LiveBuilderPreviewHarness />;
}
