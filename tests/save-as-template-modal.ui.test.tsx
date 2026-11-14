// @vitest-environment jsdom

import React, { forwardRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  fetchTemplates: vi.fn(),
  onClose: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    createTemplate: mocks.createTemplate,
    fetchTemplates: mocks.fetchTemplates,
    loading: false,
    templates: [
      {
        _id: '507f1f77bcf86cd799439012',
        name: 'NDA Template',
        category: 'Legal',
        description: 'A private NDA template',
        tags: ['legal', 'nda'],
        isSystemTemplate: false,
        sharingScope: 'private',
        userId: 'user-1',
        templateFileUrl: '/api/templates/507f1f77bcf86cd799439012',
        filePath: 'uploads/user-1/nda.pdf',
        pageCount: 2,
        fields: [{ id: 'field-1' }],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        _id: '507f1f77bcf86cd799439013',
        name: 'Services Agreement',
        category: 'Sales',
        description: 'Renewal agreement for enterprise customers',
        tags: ['renewal', 'sales'],
        isSystemTemplate: false,
        sharingScope: 'workspace',
        userId: 'user-2',
        templateFileUrl: '/api/templates/507f1f77bcf86cd799439013',
        filePath: 'uploads/user-2/services-agreement.pdf',
        pageCount: 5,
        fields: [{ id: 'field-1' }, { id: 'field-2' }],
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-02T00:00:00.000Z'),
      },
      {
        _id: '507f1f77bcf86cd799439014',
        name: 'Read-only private template',
        category: 'Legal',
        isSystemTemplate: false,
        sharingScope: 'private',
        userId: 'user-2',
        templateFileUrl: '/api/templates/507f1f77bcf86cd799439014',
        filePath: 'uploads/user-2/private.pdf',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        _id: '507f1f77bcf86cd799439015',
        name: 'System template',
        category: 'Legal',
        isSystemTemplate: true,
        templateFileUrl: '/api/templates/507f1f77bcf86cd799439015',
        filePath: 'public/system-templates/system.pdf',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ],
  }),
}));

vi.mock('@/hooks/useContextStore', () => ({
  default: () => ({ user: { id: 'user-1', orgRole: 'owner' } }),
}));

vi.mock('@ui', () => ({
  Modal: ({ title, children, handleConfirm, confirmLabel, confirmDisabled }: {
    title: React.ReactNode;
    children: React.ReactNode;
    handleConfirm?: () => void;
    confirmLabel?: React.ReactNode;
    confirmDisabled?: boolean;
  }) => (
    <section aria-label={typeof title === 'string' ? title : 'Modal'}>
      <h1>{title}</h1>
      {children}
      <button type="button" disabled={confirmDisabled} onClick={handleConfirm}>{confirmLabel}</button>
    </section>
  ),
  Input: forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    function Input(props, ref) {
      return <input ref={ref} {...props} />;
    }
  ),
  Select: forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
    function Select(props, ref) {
      return <select ref={ref} {...props} />;
    }
  ),
  Textarea: forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }>(
    function Textarea({ label, ...props }, ref) {
      return <label>{label}<textarea ref={ref} {...props} /></label>;
    }
  ),
}));

import SaveAsTemplateModal from '@/components/SaveAsTemplateModal';

function renderModal() {
  return render(
    <SaveAsTemplateModal
      documentId="507f1f77bcf86cd799439011"
      documentName="NDA"
      documentFileUrl="/api/documents/507f1f77bcf86cd799439011"
      onClose={mocks.onClose}
    />
  );
}

describe('SaveAsTemplateModal save journeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchTemplates.mockResolvedValue(undefined);
    mocks.createTemplate.mockResolvedValue({ _id: 'new-template' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to creating a separate template even when the name already exists', async () => {
    renderModal();

    await waitFor(() => expect(mocks.fetchTemplates).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Save as Template' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /create a new template/i })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Create template' })).toBeEnabled();
    expect(screen.getByText(/template already uses this name/i)).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: /templates available to replace/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    await waitFor(() => {
      expect(mocks.createTemplate).toHaveBeenCalledWith(expect.objectContaining({
        name: 'NDA Template',
        saveMode: 'create',
      }));
    });
    const payload = mocks.createTemplate.mock.calls[0][0];
    expect(payload).not.toHaveProperty('existingTemplateId');
    expect(payload).not.toHaveProperty('replaceConfirmation');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Template created successfully');
  });

  it('shows all manageable saved templates and requires an explicit replacement target', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('radio', { name: /replace an existing template/i }));

    const templateList = screen.getByRole('listbox', { name: /templates available to replace/i });
    expect(within(templateList).getByRole('option', { name: /NDA Template/i })).toBeInTheDocument();
    expect(within(templateList).getByRole('option', { name: /Services Agreement/i })).toBeInTheDocument();
    expect(within(templateList).queryByRole('option', { name: /Read-only private template/i })).not.toBeInTheDocument();
    expect(within(templateList).queryByRole('option', { name: /System template/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace template' })).toBeDisabled();

    fireEvent.click(within(templateList).getByRole('option', { name: /Services Agreement/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Replace “Services Agreement”');
    expect(screen.getByRole('button', { name: 'Replace shared template' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I understand this updates the shared template/i));
    expect(screen.getByRole('button', { name: 'Replace shared template' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Replace shared template' }));

    await waitFor(() => {
      expect(mocks.createTemplate).toHaveBeenCalledWith(expect.objectContaining({
        saveMode: 'update',
        existingTemplateId: '507f1f77bcf86cd799439013',
        replaceConfirmation: true,
      }));
    });
    const payload = mocks.createTemplate.mock.calls[0][0];
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('metadata');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Template replaced successfully');
  });

  it('filters the visible replacement library and can explicitly edit target metadata', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('radio', { name: /replace an existing template/i }));
    fireEvent.change(screen.getByRole('searchbox', { name: /search templates to replace/i }), {
      target: { value: 'renewal' },
    });

    const templateList = screen.getByRole('listbox', { name: /templates available to replace/i });
    expect(within(templateList).getByRole('option', { name: /Services Agreement/i })).toBeInTheDocument();
    expect(within(templateList).queryByRole('option', { name: /NDA Template/i })).not.toBeInTheDocument();

    fireEvent.click(within(templateList).getByRole('option', { name: /Services Agreement/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit template details' }));
    fireEvent.change(screen.getByPlaceholderText('e.g., NDA Agreement'), {
      target: { value: 'Enterprise Services Agreement' },
    });
    fireEvent.click(screen.getByLabelText(/I understand this updates the shared template/i));
    fireEvent.click(screen.getByRole('button', { name: 'Replace shared template' }));

    await waitFor(() => {
      expect(mocks.createTemplate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ name: 'Enterprise Services Agreement', category: 'Sales' }),
      }));
    });
  });

  it('keeps the selected replacement journey stable while a save is pending', async () => {
    let resolveSave: ((value: { _id: string }) => void) | undefined;
    mocks.createTemplate.mockImplementation(
      () => new Promise<{ _id: string }>((resolve) => { resolveSave = resolve; })
    );
    renderModal();

    fireEvent.click(screen.getByRole('radio', { name: /replace an existing template/i }));
    const templateList = screen.getByRole('listbox', { name: /templates available to replace/i });
    fireEvent.click(within(templateList).getByRole('option', { name: /NDA Template/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace template' }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Replace “NDA Template”');
    expect(within(templateList).getByRole('option', { name: /NDA Template/i })).toBeDisabled();

    resolveSave?.({ _id: 'updated-template' });
    await waitFor(() => expect(mocks.onClose).toHaveBeenCalled());
  });
});
