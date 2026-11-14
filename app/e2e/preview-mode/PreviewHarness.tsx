'use client';

import SenderPreviewModal from '@/components/builder/SenderPreviewModal';
import type { Recipient, SigningViewDocument } from '@/types/types';

const recipient: Recipient = {
  id: 'recipient_1',
  email: 'preview.recipient@example.com',
  name: 'Recipient 1',
  role: 'signer',
  color: '#3B82F6',
  order: 1,
  isCC: false,
  totalFields: 2,
  status: 'pending',
};

const previewDocument: SigningViewDocument = {
  id: 'preview-e2e-document',
  fileUrl: '/api/e2e/preview-pdf',
  name: 'Preview E2E',
  fields: [
    {
      id: 'field_1',
      type: 'text',
      x: 120,
      y: 160,
      width: 180,
      height: 48,
      pageNumber: 1,
      recipientId: recipient.id,
      required: true,
      value: '',
      placeholder: 'Enter text',
      settings: {
        multiline: false,
      },
    },
    {
      id: 'field_2',
      type: 'text',
      x: 120,
      y: 240,
      width: 180,
      height: 48,
      pageNumber: 1,
      recipientId: recipient.id,
      required: true,
      value: '',
      placeholder: 'Enter text',
      settings: {
        multiline: false,
      },
    },
  ],
  recipients: [recipient],
  currentRecipientId: recipient.id,
  currentRecipient: recipient,
  status: 'draft',
};

export default function PreviewHarness() {
  return (
    <div className="min-h-screen bg-slate-100">
      <SenderPreviewModal
        visible
        previewDocument={previewDocument}
        onClose={() => undefined}
      />
    </div>
  );
}
