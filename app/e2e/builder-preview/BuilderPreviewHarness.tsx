'use client';

import DocumentEditor from '@/components/builder/DocumentEditor';
import type { DocumentField, Recipient } from '@/types/types';

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

const initialFields: DocumentField[] = [
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
];

export default function BuilderPreviewHarness() {
  return (
    <DocumentEditor
      initialFileUrl="/api/e2e/preview-pdf"
      initialResourceName="Builder Preview E2E"
      initialFields={initialFields}
      initialRecipients={[recipient]}
    />
  );
}
