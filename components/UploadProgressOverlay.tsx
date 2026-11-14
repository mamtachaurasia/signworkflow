'use client';

import { createPortal } from 'react-dom';
import { Loader } from '@ui';
import type { UploadProgressStatus } from '@/hooks/useDropZone';

export default function UploadProgressOverlay({
  status,
}: {
  status: UploadProgressStatus;
}) {
  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-white/85 px-4 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center rounded-lg border border-slate-200 bg-white px-6 py-7 text-center shadow-lg">
        <Loader className="text-brand-600" text={status.title} />
        <p className="mt-3 text-sm leading-6 text-slate-600">{status.detail}</p>
      </div>
    </div>,
    document.body as HTMLElement
  );
}
