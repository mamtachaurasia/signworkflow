'use client';

import DocumentEditor from '@/components/builder/DocumentEditor';

export const E2E_LIVE_BUILDER_DOCUMENT_ID = '507f1f77bcf86cd799439011';

export default function LiveBuilderPreviewHarness() {
  return <DocumentEditor documentId={E2E_LIVE_BUILDER_DOCUMENT_ID} />;
}
