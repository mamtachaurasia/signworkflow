// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSenderPreview } from '../hooks/builder/useSenderPreview';
import type { DroppedComponent, Recipient } from '../types/types';

const recipients: Recipient[] = [
  {
    id: 'recipient-1',
    email: 'preview@example.com',
    name: 'Preview Recipient',
    role: 'signer',
    color: '#2563eb',
    order: 1,
    status: 'pending',
  },
];

function buildField(overrides: Partial<DroppedComponent> = {}): DroppedComponent {
  return {
    id: 1,
    fieldId: 'field-1',
    component: 'Text',
    x: 24,
    y: 48,
    width: 140,
    height: 40,
    pageNumber: 1,
    fieldOwner: 'recipients',
    assignedRecipientId: 'recipient-1',
    required: true,
    data: '',
    pageRect: null,
    ...overrides,
  };
}

describe('useSenderPreview', () => {
  it('keeps the sender preview document synced while preview is open', async () => {
    const onPreviewError = vi.fn();

    const { result, rerender } = renderHook(
      ({ droppedComponents }) =>
        useSenderPreview({
          selectedFile: 'https://example.com/doc.pdf',
          droppedComponents,
          recipients,
          documentId: 'doc-1',
          documentName: 'Document',
          documentStatus: 'sent',
          currentPage: 1,
          onPreviewError,
        }),
      {
        initialProps: {
          droppedComponents: [buildField()],
        },
      }
    );

    act(() => {
      result.current.openSenderPreview();
    });

    await waitFor(() => {
      expect(result.current.senderPreviewDocument?.fields).toHaveLength(1);
    });

    rerender({
      droppedComponents: [
        buildField(),
        buildField({
          id: 2,
          fieldId: 'field-2',
          x: 24,
          y: 120,
          component: 'Signature',
        }),
      ],
    });

    await waitFor(() => {
      expect(result.current.senderPreviewDocument?.fields).toHaveLength(2);
      expect(result.current.senderPreviewDocument?.fields[1]).toEqual(
        expect.objectContaining({
          id: 'field-2',
          recipientId: 'recipient-1',
        })
      );
    });

    expect(onPreviewError).not.toHaveBeenCalled();
  });
});
