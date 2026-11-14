// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createScratchTemplate: vi.fn(),
  createTemplate: vi.fn(),
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  pathname: '/templates',
  push: vi.fn(),
  search: 'view=my',
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  uploadTemplate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    createScratchTemplate: mocks.createScratchTemplate,
    createTemplate: mocks.createTemplate,
    uploadTemplate: mocks.uploadTemplate,
  }),
}));

vi.mock('@ui', () => ({
  Modal: ({ visible, title, description, children }: {
    visible?: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
  }) => visible ? (
    <section aria-label={typeof title === 'string' ? title : 'Modal'}>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </section>
  ) : null,
  Button: ({
    children,
    label,
    leadingIcon,
    loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label?: React.ReactNode;
    leadingIcon?: React.ReactNode;
    loading?: boolean;
  }) => (
    <button {...props} data-loading={loading || undefined}>
      {leadingIcon}
      {label ?? children}
    </button>
  ),
}));

import CreateTemplateModal from '@/components/CreateTemplateModal';

const documentTemplate = {
  _id: 'template-from-document',
  name: 'Offer Letter',
};

const scratchTemplate = {
  _id: 'blank-template',
  name: 'Untitled template',
  editableContent: {
    version: 1 as const,
    blocks: [],
    variables: [],
  },
};

function renderModal() {
  return render(
    <CreateTemplateModal
      isOpen
      onClose={mocks.onClose}
      onSuccess={mocks.onSuccess}
    />
  );
}

describe('CreateTemplateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/templates';
    mocks.search = 'view=my';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          { id: 'document-nda', name: 'Mutual NDA', status: 'saved' },
          { id: 'document-offer', name: 'Offer Letter', status: 'draft' },
          { id: 'document-trashed', name: 'Old contract', status: 'trashed' },
        ],
      }),
    }));
    mocks.createTemplate.mockResolvedValue(documentTemplate);
    mocks.uploadTemplate.mockResolvedValue({ _id: 'template-from-upload', name: 'Lease' });
    mocks.createScratchTemplate.mockResolvedValue(scratchTemplate);
  });

  it('starts with three clear source choices and no metadata form', () => {
    renderModal();

    expect(screen.getByRole('button', { name: /From existing document/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload a document/i })).toHaveTextContent('PDF, DOC, or DOCX');
    expect(screen.getByRole('button', { name: /Start from scratch/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Template name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Category/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('searches saved documents, creates a private draft, and opens the Builder', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /From existing document/i }));

    expect(await screen.findByRole('searchbox', { name: 'Search your documents' })).toBeInTheDocument();
    await screen.findByRole('radio', { name: /Mutual NDA saved/i });
    expect(screen.queryByText('Old contract')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search your documents' }), {
      target: { value: 'offer' },
    });
    expect(screen.queryByRole('radio', { name: /Mutual NDA/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Offer Letter draft/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create and continue' }));

    await waitFor(() => {
      expect(mocks.createTemplate).toHaveBeenCalledWith({
        category: 'Other',
        description: '',
        documentId: 'document-offer',
        name: 'Offer Letter',
        sharingScope: 'private',
        tags: [],
      });
    });
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
    expect(mocks.onSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(
      '/builder/template/template-from-document?workspace=fields&templateOrigin=templates&templateView=my&templateReturnTo=%2Ftemplates%3Fview%3Dmy'
    );
  });

  it('validates an upload, derives its name, and opens the Builder', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Upload a document/i }));

    const input = screen.getByLabelText('Document file');
    expect(input).toHaveAttribute(
      'accept',
      '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    fireEvent.change(input, {
      target: { files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(mocks.toastError).toHaveBeenCalledWith('Choose a PDF, DOC, or DOCX file');
    expect(screen.getByRole('button', { name: 'Upload and continue' })).toBeDisabled();

    const pdf = new File(['pdf'], 'Lease Agreement.PDF', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdf] } });
    expect(screen.getByText('Lease Agreement.PDF')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload and continue' }));

    await waitFor(() => {
      expect(mocks.uploadTemplate).toHaveBeenCalledWith(pdf, {
        category: 'Other',
        description: '',
        name: 'Lease Agreement',
        sharingScope: 'private',
        tags: [],
      });
    });
    expect(mocks.push).toHaveBeenCalledWith(
      '/builder/template/template-from-upload?workspace=fields&templateOrigin=templates&templateView=my&templateReturnTo=%2Ftemplates%3Fview%3Dmy'
    );
  });

  it.each([
    ['Offer Letter.doc', 'application/msword', 'Offer Letter'],
    [
      'Statement of Work.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Statement of Work',
    ],
  ])('accepts %s and derives a clean template name', async (fileName, type, expectedName) => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Upload a document/i }));

    const input = screen.getByLabelText('Document file');
    const wordDocument = new File(['word'], fileName, { type });
    fireEvent.change(input, { target: { files: [wordDocument] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload and continue' }));

    await waitFor(() => {
      expect(mocks.uploadTemplate).toHaveBeenCalledWith(wordDocument, {
        category: 'Other',
        description: '',
        name: expectedName,
        sharingScope: 'private',
        tags: [],
      });
    });
  });

  it('rejects a document larger than 25 MB before uploading', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Upload a document/i }));

    const input = screen.getByLabelText('Document file');
    const oversizedDocument = new File(['word'], 'large.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    Object.defineProperty(oversizedDocument, 'size', { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [oversizedDocument] } });

    expect(mocks.toastError).toHaveBeenCalledWith('Choose a file that is 25 MB or smaller');
    expect(screen.getByRole('button', { name: 'Upload and continue' })).toBeDisabled();
    expect(mocks.uploadTemplate).not.toHaveBeenCalled();
  });

  it('creates one scratch draft even when the action is clicked repeatedly', async () => {
    let finishCreation: ((template: typeof scratchTemplate) => void) | undefined;
    mocks.createScratchTemplate.mockImplementation(() => new Promise((resolve) => {
      finishCreation = resolve;
    }));
    renderModal();

    const scratchAction = screen.getByRole('button', { name: /Start from scratch/i });
    fireEvent.click(scratchAction);
    fireEvent.click(scratchAction);

    expect(mocks.createScratchTemplate).toHaveBeenCalledTimes(1);
    expect(mocks.createScratchTemplate).toHaveBeenCalledWith({ name: 'Untitled template' });
    expect(await screen.findByRole('button', { name: /Creating blank draft/i })).toBeDisabled();

    finishCreation?.(scratchTemplate);
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(
        '/builder/template/blank-template?workspace=content&templateOrigin=templates&templateView=my&templateReturnTo=%2Ftemplates%3Fview%3Dmy'
      );
    });
  });

  it('offers back and cancel without losing control during normal navigation', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /From existing document/i }));
    await screen.findByRole('searchbox', { name: 'Search your documents' });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: /Start from scratch/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a template created from My Templates inside the dashboard Builder route', async () => {
    mocks.pathname = '/dashboard';
    mocks.search = 'view=my';
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Start from scratch/i }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(
        '/dashboard/builder/template/blank-template?workspace=content&templateOrigin=dashboard&templateView=my&templateReturnTo=%2Fdashboard%3Fview%3Dmy'
      );
    });
  });
});
