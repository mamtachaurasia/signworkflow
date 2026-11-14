// @vitest-environment jsdom

import React, { forwardRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  onContinueToFields: vi.fn(),
  onSaved: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: mocks.guard,
}));

vi.mock('@/components/templates/RichTextSectionEditor', () => ({
  default: ({
    documentId,
    html,
    onChange,
    onSmartVariablesDetected,
    templateId,
  }: {
    documentId?: string;
    html: string;
    onChange: (html: string, text: string) => void;
    onSmartVariablesDetected?: (variables: Array<{
      key: string;
      label: string;
      defaultValue: string;
      required: boolean;
    }>) => void;
    templateId?: string;
  }) => (
    <div
      aria-label="Rich text section editor"
      data-document-id={documentId || ''}
      data-template-id={templateId || ''}
    >
      <span>{html}</span>
      <button
        type="button"
        onClick={() => onChange('<p><strong>Updated agreement body</strong></p>', 'Updated agreement body')}
      >
        Update agreement body
      </button>
      <button
        type="button"
        onClick={() => onSmartVariablesDetected?.([
          { key: 'seller_name', label: 'Seller name', defaultValue: '', required: true },
          { key: 'sale_price', label: 'Sale price', defaultValue: '', required: true },
        ])}
      >
        Add AI smart variables
      </button>
    </div>
  ),
}));

vi.mock('@ui', () => ({
  Button: ({
    label,
    children,
    icon,
    disabled,
    onClick,
    title,
    type,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label?: React.ReactNode;
    icon?: React.ReactNode;
    variant?: string;
    size?: string;
  }) => <button type={type} disabled={disabled} onClick={onClick} title={title}>{icon}{label ?? children}</button>,
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
}));

import TemplateContentEditor from '@/components/templates/TemplateContentEditor';

const templateId = '507f1f77bcf86cd799439011';
const documentId = '507f1f77bcf86cd799439012';
const loadedTemplate = {
  name: 'Consulting agreement',
  editableContent: {
    version: 1,
    blocks: [{
      id: 'body-section',
      type: 'paragraph',
      text: 'Agreement body',
      html: '<p><strong>Agreement body</strong></p>',
      align: 'left',
    }],
    variables: [{
      key: 'client_name',
      label: 'Client name',
      defaultValue: 'Acme Ltd',
      required: true,
    }],
  },
  defaultSigners: [{
    id: 'role-client',
    name: 'Client',
    email: '',
    role: 'signer',
    order: 1,
  }],
};

const loadedDocument = {
  name: 'Scratch agreement',
  currentVersion: 1,
  editableContent: {
    ...loadedTemplate.editableContent,
    variables: [],
  },
};

function installFetchMock() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          template: {
            ...loadedTemplate,
            fieldLayoutStatus: 'needs_review',
          },
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ template: loadedTemplate }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderEditor(toolbarLeading?: React.ReactNode) {
  return render(
    <TemplateContentEditor
      templateId={templateId}
      embedded
      toolbarLeading={toolbarLeading}
      onSaved={mocks.onSaved}
      onContinueToFields={mocks.onContinueToFields}
    />
  );
}

function renderDocumentEditor() {
  return render(
    <TemplateContentEditor
      mode="document"
      documentId={documentId}
    />
  );
}

function installDocumentFetchMock(document = loadedDocument) {
  let currentDocument = document;
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const payload = JSON.parse(String(init.body)) as {
        editableContent: typeof loadedDocument.editableContent;
        name?: string;
      };
      currentDocument = {
        ...currentDocument,
        ...(payload.name ? { name: payload.name } : {}),
        editableContent: payload.editableContent,
        currentVersion: currentDocument.currentVersion + 1,
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({ document: { ...currentDocument, fieldsNeedReview: false } }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ document: currentDocument }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function makeContentDirty() {
  const body = await screen.findByText('Agreement body');
  fireEvent.mouseDown(body);
  fireEvent.click(await screen.findByRole('button', { name: 'Update agreement body' }));
  await screen.findByRole('button', { name: 'Apply content changes' });
}

describe('TemplateContentEditor embedded workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onSaved.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders saved rich content inside the workspace without standalone template controls', async () => {
    const fetchMock = installFetchMock();
    const { container } = renderEditor();

    const body = await screen.findByText('Agreement body');
    expect(screen.queryByText('Edit reusable template content')).not.toBeInTheDocument();
    expect(body.tagName).toBe('STRONG');
    expect(screen.getByText('Client name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Content saved' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue to roles & fields' })).toBeEnabled();
    expect(screen.queryByLabelText('Template name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save template' })).not.toBeInTheDocument();
    expect(screen.queryByText('Recipient roles')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Template content canvas' })).toBeInTheDocument();
    expect(container.querySelector('main')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/templates/${templateId}/content`,
      { credentials: 'include' }
    );
  });

  it('renders workspace navigation in the same toolbar as the content actions', async () => {
    installFetchMock();
    renderEditor(<nav aria-label="Template setup">Content tabs</nav>);

    await screen.findByText('Agreement body');
    const toolbar = screen.getByTestId('template-content-toolbar');
    expect(toolbar).toContainElement(screen.getByRole('navigation', { name: 'Template setup' }));
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Content saved' }));
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Continue to roles & fields' }));
  });

  it('does not overwrite a name changed from the Builder header when applying embedded content', async () => {
    const fetchMock = installFetchMock();
    renderEditor();
    await makeContentDirty();
    fireEvent.click(screen.getByRole('button', { name: 'Apply content changes' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
    });
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(updateCall).toBeDefined();
    const payload = JSON.parse(String(updateCall?.[1]?.body));
    expect(payload).not.toHaveProperty('name');
  });

  it('continues immediately when content is already saved', async () => {
    const fetchMock = installFetchMock();
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Continue to roles & fields' }));

    expect(mocks.onContinueToFields).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    expect(mocks.onSaved).not.toHaveBeenCalled();
  });

  it('applies dirty content without leaving the content workspace', async () => {
    const fetchMock = installFetchMock();
    renderEditor();
    await makeContentDirty();

    fireEvent.click(screen.getByRole('button', { name: 'Apply content changes' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
      expect(mocks.onSaved).toHaveBeenCalledTimes(1);
    });
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    const payload = JSON.parse(String(putCall?.[1]?.body));
    expect(payload).toEqual(expect.objectContaining({
      editableContent: expect.objectContaining({
        blocks: [expect.objectContaining({
          id: 'body-section',
          text: 'Updated agreement body',
          html: '<p><strong>Updated agreement body</strong></p>',
        })],
      }),
      defaultSigners: loadedTemplate.defaultSigners,
    }));
    expect(payload).not.toHaveProperty('name');
    expect(mocks.onContinueToFields).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Content applied. Review field placement against the updated layout.'
    );
  });

  it('applies dirty content before continuing to field review', async () => {
    const fetchMock = installFetchMock();
    renderEditor();
    await makeContentDirty();

    fireEvent.click(screen.getByRole('button', { name: 'Apply and review fields' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
      expect(mocks.onSaved).toHaveBeenCalledTimes(1);
      expect(mocks.onContinueToFields).toHaveBeenCalledTimes(1);
    });
  });

  it('passes the scratch document ID to the rich-text AI editor', async () => {
    installDocumentFetchMock();
    renderDocumentEditor();

    const editor = await screen.findByLabelText('Rich text section editor');
    expect(editor).toHaveAttribute('data-document-id', documentId);
    expect(editor).toHaveAttribute('data-template-id', '');
    expect(screen.getByRole('region', { name: 'Document content canvas' })).toBeInTheDocument();
  });

  it('disables Create Envelope until a scratch document has content', async () => {
    const fetchMock = installDocumentFetchMock({
      ...loadedDocument,
      editableContent: {
        version: 1,
        blocks: [{
          id: 'blank-paragraph',
          type: 'paragraph',
          text: '',
          html: '',
          align: 'left',
        }],
        variables: [],
      },
    });
    renderDocumentEditor();

    await screen.findByLabelText('Rich text section editor');
    const createEnvelope = screen.getByRole('button', { name: 'Create Envelope' });
    expect(createEnvelope).toBeDisabled();
    expect(createEnvelope).toHaveAttribute('title', 'Add document content before creating an envelope.');

    fireEvent.click(createEnvelope);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Update agreement body' }));
    await waitFor(() => expect(createEnvelope).toBeDisabled());
    expect(createEnvelope).toHaveAttribute('title', 'Save your draft before creating an envelope.');
    fireEvent.click(createEnvelope);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    await waitFor(() => expect(createEnvelope).toBeEnabled());
  });

  it('merges AI-created Smart variables into a scratch document and saves them before creating its envelope', async () => {
    const fetchMock = installDocumentFetchMock();
    renderDocumentEditor();

    await screen.findByLabelText('Rich text section editor');
    expect(screen.queryByText('Seller name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add AI smart variables' }));

    await screen.findByText('Seller name');
    expect(screen.getByText('Sale price')).toBeInTheDocument();
    expect(screen.queryByText(/Add values for these 2 Smart variables/i)).not.toBeInTheDocument();

    const valueInputs = screen.getAllByPlaceholderText('Value for this envelope');
    fireEvent.change(valueInputs[0], { target: { value: 'Aarav Sharma' } });
    fireEvent.change(valueInputs[1], { target: { value: '₹85,00,000' } });
    const createEnvelope = screen.getByRole('button', { name: 'Create Envelope' });
    expect(createEnvelope).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
      expect(createEnvelope).toBeEnabled();
    });
    fireEvent.click(createEnvelope);
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(`/builder/${documentId}`);
    });
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    const payload = JSON.parse(String(updateCall?.[1]?.body));
    expect(payload.editableContent.variables).toEqual([
      { key: 'seller_name', label: 'Seller name', defaultValue: 'Aarav Sharma', required: true },
      { key: 'sale_price', label: 'Sale price', defaultValue: '₹85,00,000', required: true },
    ]);
  });

  it('lets a scratch author save Smart variables before creating an envelope', async () => {
    const fetchMock = installDocumentFetchMock();
    renderDocumentEditor();

    await screen.findByText('Smart variables');
    expect(screen.getByRole('button', { name: 'Create Envelope' })).toBeEnabled();
    expect(screen.queryByText('Recipient roles')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. Company name'), {
      target: { value: 'Company name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create variable' }));
    fireEvent.change(screen.getByPlaceholderText('Value for this envelope'), {
      target: { value: 'Acme Ltd' },
    });
    const createEnvelope = screen.getByRole('button', { name: 'Create Envelope' });
    expect(createEnvelope).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
      expect(createEnvelope).toBeEnabled();
    });
    fireEvent.click(createEnvelope);
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(`/builder/${documentId}`);
    });
    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    const payload = JSON.parse(String(updateCall?.[1]?.body));
    expect(payload).toEqual(expect.objectContaining({
      baseVersion: 1,
      editableContent: expect.objectContaining({
        variables: [expect.objectContaining({
          key: 'company_name',
          label: 'Company name',
          defaultValue: 'Acme Ltd',
          required: true,
        })],
      }),
    }));
  });

  it('lets a saved draft with missing Smart-variable values continue to Builder', async () => {
    const fetchMock = installDocumentFetchMock();
    renderDocumentEditor();

    await screen.findByText('Smart variables');
    fireEvent.change(screen.getByPlaceholderText('e.g. Company name'), {
      target: { value: 'Company name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create variable' }));
    const createEnvelope = screen.getByRole('button', { name: 'Create Envelope' });
    expect(createEnvelope).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(createEnvelope).toBeEnabled());
    const savesBeforeCreate = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').length;
    fireEvent.click(createEnvelope);

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith(`/builder/${documentId}`);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(savesBeforeCreate);
  });
});
