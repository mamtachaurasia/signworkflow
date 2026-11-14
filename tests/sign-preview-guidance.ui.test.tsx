// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SignPageClient from '../app/sign/[token]/SignPageClient';
import type { EditorProps } from '../components/builder/DocumentEditor';
import type { SigningViewDocument } from '../types/types';

let latestEditorProps: EditorProps | null = null;
const scrollIntoViewMock = vi.fn();

vi.mock('@/components/builder/DocumentEditor', () => ({
  default: (props: EditorProps) => {
    latestEditorProps = props;
    return (
      <div data-testid="document-editor">
        <div data-testid="guided-badge-label">{props.guidedBadgeLabel ?? ''}</div>
        {props.initialFields?.map((field) => (
          <button
            key={field.id}
            data-field-id={field.id}
            type="button"
          >
            {String(field.id)}
          </button>
        ))}
      </div>
    );
  },
}));

describe('sign preview guidance', () => {
  beforeEach(() => {
    scrollIntoViewMock.mockReset();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  afterEach(() => {
    latestEditorProps = null;
  });

  it('guides across recipient fields in preview mode, including non-required fields', async () => {
    const previewDocument: SigningViewDocument = {
      id: 'doc-preview',
      fileUrl: 'https://example.com/doc.pdf',
      name: 'Preview Doc',
      status: 'sent',
      currentRecipientId: 'recipient-1',
      recipients: [
        {
          id: 'recipient-1',
          email: 'preview@example.com',
          name: 'Preview Recipient',
          role: 'signer',
          color: '#2563eb',
          order: 1,
          status: 'pending',
        },
      ],
      fields: [
        {
          id: 'field-1',
          type: 'text',
          x: 10,
          y: 20,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: '',
          fieldOwner: 'recipients',
        },
        {
          id: 'field-2',
          type: 'signature',
          x: 10,
          y: 80,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: false,
          value: '',
          fieldOwner: 'recipients',
        },
      ],
    };

    render(<SignPageClient previewMode previewDocument={previewDocument} />);

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    expect(screen.queryByText('In progress')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(latestEditorProps?.guidedFieldId).toBe('field-1');
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(latestEditorProps?.guidedFieldId).toBe('field-2');
    });

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('shows review after all guided recipient fields are complete', async () => {
    const previewDocument: SigningViewDocument = {
      id: 'doc-preview-2',
      fileUrl: 'https://example.com/doc.pdf',
      name: 'Preview Doc 2',
      status: 'sent',
      currentRecipientId: 'recipient-1',
      recipients: [
        {
          id: 'recipient-1',
          email: 'preview@example.com',
          name: 'Preview Recipient',
          role: 'signer',
          color: '#2563eb',
          order: 1,
          status: 'pending',
        },
      ],
      fields: [
        {
          id: 'field-1',
          type: 'text',
          x: 10,
          y: 20,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: 'Signed',
          fieldOwner: 'recipients',
        },
        {
          id: 'field-2',
          type: 'signature',
          x: 10,
          y: 80,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: 'signature-data',
          fieldOwner: 'recipients',
        },
      ],
    };

    render(<SignPageClient previewMode previewDocument={previewDocument} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    const finishLabel = screen.getByText('Finish & Sign');
    expect(finishLabel).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    await waitFor(() => {
      expect(latestEditorProps?.guidedFieldId).toBe('field-1');
      expect(screen.getByTestId('guided-badge-label')).toHaveTextContent('Review');
    });

    const rejectButton = screen.getByRole('button', { name: 'Reject' });
    const finishButton = finishLabel.closest('button');
    expect(finishButton).not.toBeNull();
    expect(rejectButton.compareDocumentPosition(finishButton!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('keeps reject enabled in preview mode and allows previewing rejection state', async () => {
    const previewDocument: SigningViewDocument = {
      id: 'doc-preview-3',
      fileUrl: 'https://example.com/doc.pdf',
      name: 'Preview Doc 3',
      status: 'sent',
      currentRecipientId: 'recipient-1',
      recipients: [
        {
          id: 'recipient-1',
          email: 'preview@example.com',
          name: 'Preview Recipient',
          role: 'signer',
          color: '#2563eb',
          order: 1,
          status: 'pending',
        },
      ],
      fields: [
        {
          id: 'field-1',
          type: 'text',
          x: 10,
          y: 20,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: '',
          fieldOwner: 'recipients',
        },
      ],
    };

    render(<SignPageClient previewMode previewDocument={previewDocument} />);

    const rejectButton = await screen.findByRole('button', { name: 'Reject' });
    expect(rejectButton).not.toBeDisabled();

    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    });
  });

  it('retargets the preview indicator when new fields are added', async () => {
    const previewDocument: SigningViewDocument = {
      id: 'doc-preview-4',
      fileUrl: 'https://example.com/doc.pdf',
      name: 'Preview Doc 4',
      status: 'sent',
      currentRecipientId: 'recipient-1',
      recipients: [
        {
          id: 'recipient-1',
          email: 'preview@example.com',
          name: 'Preview Recipient',
          role: 'signer',
          color: '#2563eb',
          order: 1,
          status: 'pending',
        },
      ],
      fields: [
        {
          id: 'field-1',
          type: 'text',
          x: 10,
          y: 60,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: '',
          fieldOwner: 'recipients',
        },
      ],
    };

    const { rerender } = render(<SignPageClient previewMode previewDocument={previewDocument} />);

    await waitFor(() => {
      expect(latestEditorProps?.guidedFieldId).toBe('field-1');
    });

    rerender(
      <SignPageClient
        previewMode
        previewDocument={{
          ...previewDocument,
          fields: [
            {
              id: 'field-0',
              type: 'signature',
              x: 10,
              y: 20,
              width: 120,
              height: 40,
              pageNumber: 1,
              recipientId: 'recipient-1',
              required: false,
              value: '',
              fieldOwner: 'recipients',
            },
            ...previewDocument.fields,
          ],
        }}
      />
    );

    await waitFor(() => {
      expect(latestEditorProps?.guidedFieldId).toBe('field-0');
    });
  });

  it('preserves typed preview values when fresh preview props are pushed in', async () => {
    const previewDocument: SigningViewDocument = {
      id: 'doc-preview-5',
      fileUrl: 'https://example.com/doc.pdf',
      name: 'Preview Doc 5',
      status: 'sent',
      currentRecipientId: 'recipient-1',
      recipients: [
        {
          id: 'recipient-1',
          email: 'preview@example.com',
          name: 'Preview Recipient',
          role: 'signer',
          color: '#2563eb',
          order: 1,
          status: 'pending',
        },
      ],
      fields: [
        {
          id: 'field-1',
          type: 'text',
          x: 10,
          y: 20,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: '',
          fieldOwner: 'recipients',
        },
        {
          id: 'field-2',
          type: 'text',
          x: 10,
          y: 80,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: '',
          fieldOwner: 'recipients',
        },
      ],
    };

    const { rerender } = render(<SignPageClient previewMode previewDocument={previewDocument} />);

    await waitFor(() => {
      expect(latestEditorProps?.initialFields?.map((field) => field.id)).toEqual(['field-1', 'field-2']);
    });

    act(() => {
      latestEditorProps?.onFieldsChange?.([
        {
          ...previewDocument.fields[0],
          value: 'alpha',
        },
        previewDocument.fields[1],
      ]);
    });

    await waitFor(() => {
      expect(
        latestEditorProps?.initialFields?.find((field) => field.id === 'field-1')?.value
      ).toBe('alpha');
    });

    rerender(
      <SignPageClient
        previewMode
        previewDocument={{
          ...previewDocument,
          fields: [
            ...previewDocument.fields,
            {
              id: 'field-3',
              type: 'signature',
              x: 10,
              y: 140,
              width: 120,
              height: 40,
              pageNumber: 1,
              recipientId: 'recipient-1',
              required: false,
              value: '',
              fieldOwner: 'recipients',
            },
          ],
        }}
      />
    );

    await waitFor(() => {
      expect(
        latestEditorProps?.initialFields?.find((field) => field.id === 'field-1')?.value
      ).toBe('alpha');
      expect(latestEditorProps?.initialFields?.map((field) => field.id)).toEqual([
        'field-1',
        'field-2',
        'field-3',
      ]);
    });
  });

  it('does not retarget sign-here to a skipped optional field before review', async () => {
    const previewDocument: SigningViewDocument = {
      id: 'doc-preview-6',
      fileUrl: 'https://example.com/doc.pdf',
      name: 'Preview Doc 6',
      status: 'sent',
      currentRecipientId: 'recipient-1',
      recipients: [
        {
          id: 'recipient-1',
          email: 'preview@example.com',
          name: 'Preview Recipient',
          role: 'signer',
          color: '#2563eb',
          order: 1,
          status: 'pending',
        },
      ],
      fields: [
        {
          id: 'field-1',
          type: 'text',
          x: 10,
          y: 20,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: 'Complete',
          fieldOwner: 'recipients',
        },
        {
          id: 'field-2',
          type: 'text',
          x: 10,
          y: 80,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: false,
          value: '',
          fieldOwner: 'recipients',
        },
        {
          id: 'field-3',
          type: 'signature',
          x: 10,
          y: 140,
          width: 120,
          height: 40,
          pageNumber: 1,
          recipientId: 'recipient-1',
          required: true,
          value: '',
          fieldOwner: 'recipients',
        },
      ],
    };

    render(<SignPageClient previewMode previewDocument={previewDocument} />);

    await waitFor(() => {
      expect(latestEditorProps?.guidedFieldId).toBe('field-2');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(latestEditorProps?.guidedFieldId).toBe('field-3');
    });

    act(() => {
      latestEditorProps?.onFieldsChange?.([
        previewDocument.fields[0],
        previewDocument.fields[1],
        {
          ...previewDocument.fields[2],
          value: 'signed',
        },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(latestEditorProps?.guidedFieldId).not.toBe('field-2');
  });
});
