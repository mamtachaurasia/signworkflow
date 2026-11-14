import { notFound } from 'next/navigation';

import { allowInternalE2ERoutes } from '@/lib/e2e-env';
import PreviewHarness from './PreviewHarness';

export const dynamic = 'force-dynamic';

export default function PreviewModePage() {
  if (!allowInternalE2ERoutes()) {
    notFound();
  }

  return <PreviewHarness />;
}
