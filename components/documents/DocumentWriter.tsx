'use client';

import TemplateContentEditor from '@/components/templates/TemplateContentEditor';

export default function DocumentWriter({ documentId }: { documentId: string }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <TemplateContentEditor mode="document" documentId={documentId} />
    </div>
  );
}
