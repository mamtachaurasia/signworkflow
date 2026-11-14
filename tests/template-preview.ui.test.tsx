// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({
  default: () => function PreviewStub({
    pages,
    renderPageOverlay,
  }: {
    pages?: number[];
    renderPageOverlay?: (pageNumber: number) => React.ReactNode;
  }) {
    const page = pages?.[0] || 1;
    return <div data-testid="pdf-page">{renderPageOverlay?.(page)}</div>;
  },
}));

import TemplatePreview from '@/components/TemplatePreview';

describe('TemplatePreview configuration overview', () => {
  afterEach(() => cleanup());

  it('shows field overlays and a PII-safe configuration summary', () => {
    render(
      <TemplatePreview
        templateUrl="/api/templates/template-1"
        templateName="Consulting agreement"
        template={{
          description: 'Reusable consulting terms',
          category: 'Legal',
          jurisdiction: 'India',
          sharingScope: 'workspace',
          pageCount: 2,
          fileSize: 1024 * 1024,
          updatedAt: '2026-08-08T00:00:00.000Z',
          fieldLayoutStatus: 'current',
          defaultSigners: [{
            id: 'client',
            name: 'Client signer',
            role: 'signer',
            order: 1,
            email: 'private@example.com',
          } as never],
          fields: [{
            id: 'signature-1',
            type: 'signature',
            x: 120,
            y: 220,
            width: 180,
            height: 50,
            pageNumber: 1,
            recipientId: 'client',
            required: true,
            pageRect: { left: 0, top: 0, width: 890, height: 1200 },
          }],
          editableContent: {
            version: 1,
            blocks: [{ id: 'block-1', type: 'paragraph', text: 'Terms' }],
            variables: [{ key: 'effective_date', label: 'Effective date', required: true }],
          },
        }}
      />
    );

    expect(screen.getByText('Ready to use')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Client signer')).toBeInTheDocument();
    expect(screen.getByText('Signer · 1 assigned field')).toBeInTheDocument();
    expect(screen.getByText('Effective date *')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Document & fields' }));
    expect(screen.getByText('Signature *')).toBeInTheDocument();
    expect(screen.getByText('1 configured fields on this page')).toBeInTheDocument();
  });

  it('explains why an incomplete template requires setup', () => {
    render(
      <TemplatePreview
        templateUrl="/api/templates/template-2"
        templateName="Incomplete agreement"
        template={{
          category: 'Other',
          fieldLayoutStatus: 'needs_review',
          defaultSigners: [{ id: 'signer-1', role: 'signer', order: 1 }],
          fields: [{
            id: 'text-1',
            type: 'text',
            x: 10,
            y: 10,
            width: 100,
            height: 30,
            pageNumber: 1,
            required: true,
          }],
        }}
      />
    );

    expect(screen.getByText('Setup required')).toBeInTheDocument();
    expect(screen.getByText('Review field placement against the latest document layout.')).toBeInTheDocument();
    expect(screen.getByText('Assign 1 field to a role.')).toBeInTheDocument();
    expect(screen.getByText('Add fields for 1 signer or approver role.')).toBeInTheDocument();
  });
});
