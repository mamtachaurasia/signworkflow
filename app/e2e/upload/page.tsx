import { notFound } from 'next/navigation';

import UploadZone from '@/components/UploadZone';
import { allowInternalE2ERoutes } from '@/lib/e2e-env';

export const dynamic = 'force-dynamic';

export default function UploadE2EPage() {
  if (!allowInternalE2ERoutes()) {
    notFound();
  }

  return <UploadZone />;
}
