// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return {
    createDocumentFromTemplate: vi.fn(),
    duplicateTemplate: vi.fn(),
    push,
    replace,
    router: { push, replace },
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    search: '',
    loadedTemplate: null as Record<string, unknown> | null,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    createDocumentFromTemplate: mocks.createDocumentFromTemplate,
    duplicateTemplate: mocks.duplicateTemplate,
  }),
}));

vi.mock('@/components/builder/DocumentEditor', () => ({
  default: ({ templateFieldReviewRequired, templateNavigation }: { templateFieldReviewRequired?: boolean; templateNavigation?: React.ReactNode }) => (
    <div data-testid="fields-workspace" data-needs-review={String(Boolean(templateFieldReviewRequired))}>
      <div data-testid="template-fields-toolbar">{templateNavigation}<span>Template Builder</span></div>
      Pages, roles, and fields workspace
    </div>
  ),
}));

vi.mock('@/components/templates/TemplateContentEditor', () => ({
  default: ({ embedded, toolbarLeading }: { embedded?: boolean; toolbarLeading?: React.ReactNode }) => (
    <div data-testid="content-workspace" data-embedded={String(Boolean(embedded))}>
      <div data-testid="template-content-toolbar">{toolbarLeading}<button>Content saved</button></div>
      Editable content workspace
    </div>
  ),
}));

vi.mock('@/components/templates/builder/TemplateSettingsPanel', () => ({
  default: () => <div data-testid="settings-workspace">Settings workspace</div>,
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
}));

import TemplateBuilderShell from '@/components/templates/builder/TemplateBuilderShell';
import type { TemplateBuilderTemplate } from '@/components/templates/builder/template-builder-types';
import { TEMPLATE_NAVIGATION_QUERY_KEYS } from '@/lib/template-navigation';

const editableTemplate: TemplateBuilderTemplate = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Consulting agreement',
  description: 'Reusable consulting terms',
  category: 'Legal',
  isSystemTemplate: false,
  sharingScope: 'private',
  fields: [],
  defaultSigners: [],
  editableContent: {
    version: 1,
    blocks: [{ id: 'content-1', type: 'paragraph', text: 'Consulting terms', html: '<p>Consulting terms</p>' }],
    variables: [],
  },
  fieldLayoutStatus: 'current',
};

function renderShell(template: TemplateBuilderTemplate = editableTemplate) {
  mocks.loadedTemplate = template as unknown as Record<string, unknown>;
  return render(
    <TemplateBuilderShell templateId={template._id} initialTemplate={template} />
  );
}

describe('TemplateBuilderShell workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = '';
    mocks.loadedTemplate = editableTemplate as unknown as Record<string, unknown>;
    mocks.duplicateTemplate.mockResolvedValue(null);
    mocks.createDocumentFromTemplate.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ template: mocks.loadedTemplate }),
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('defaults an editable template to Content and exposes the complete workspace navigation', async () => {
    renderShell();

    const navigation = screen.getByRole('navigation', { name: 'Template setup' });
    expect(within(navigation).getByRole('link', { name: /Content/i })).toHaveAttribute('aria-current', 'page');
    const fieldsHref = within(navigation).getByRole('link', { name: /Roles & fields/i }).getAttribute('href');
    const fieldsUrl = new URL(fieldsHref || '', 'https://signworkflow.local');
    expect(fieldsUrl.pathname).toBe('/builder/template/507f1f77bcf86cd799439011');
    expect(fieldsUrl.searchParams.get('workspace')).toBe('fields');
    expect(fieldsUrl.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo)).toBe('/templates?view=my');
    expect(within(navigation).getByRole('link', { name: /Readiness/i })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: /Settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename template Consulting agreement' })).toBeInTheDocument();
    expect(screen.getByTestId('content-workspace')).toHaveAttribute('data-embedded', 'true');
    expect(screen.queryByTestId('fields-workspace')).not.toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('places Content tabs in the same toolbar container as Content saved', async () => {
    renderShell();

    const shell = screen.getByTestId('template-builder-shell');
    const navigation = screen.getByRole('navigation', { name: 'Template setup' });
    const frame = screen.getByTestId('template-builder-workspace-frame');
    const summary = screen.getByTestId('template-builder-summary');
    const workspace = screen.getByTestId('template-builder-workspace');
    const contentToolbar = screen.getByTestId('template-content-toolbar');

    expect(contentToolbar).toContainElement(navigation);
    expect(contentToolbar).toContainElement(screen.getByRole('button', { name: 'Content saved' }));
    expect(screen.queryByTestId('template-builder-lower-header')).not.toBeInTheDocument();
    expect(frame).toContainElement(summary);
    expect(frame).toContainElement(workspace);
    expect(Array.from(frame.children)).toEqual([summary, workspace]);
    expect(shell.querySelector('main')).toBeNull();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('defaults a PDF-backed template to Roles & fields', async () => {
    renderShell({
      ...editableTemplate,
      editableContent: null,
      pageCount: 2,
    });

    const navigation = screen.getByRole('navigation', { name: 'Template setup' });
    const fieldsToolbar = screen.getByTestId('template-fields-toolbar');
    const badge = screen.getByText('Template Builder');
    expect(fieldsToolbar).toContainElement(navigation);
    expect(fieldsToolbar).toContainElement(badge);
    expect(Array.from(fieldsToolbar.children)).toEqual([navigation, badge]);
    expect(screen.queryByTestId('template-builder-lower-header')).not.toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: /Roles & fields/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('fields-workspace')).toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: /^Content$/i })).not.toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('explains why an empty template still requires roles and signing fields', async () => {
    mocks.search = 'workspace=review';
    renderShell();

    const workspace = screen.getByTestId('template-builder-workspace');
    const lowerHeader = screen.getByTestId('template-builder-lower-header');
    expect(workspace).toContainElement(lowerHeader);
    expect(lowerHeader).toContainElement(screen.getByRole('navigation', { name: 'Template setup' }));
    expect(screen.getAllByText('Setup required').length).toBeGreaterThan(0);
    expect(screen.getByText('Add at least one reusable recipient role.')).toBeInTheDocument();
    expect(screen.getByText('Place at least one signing field and assign it to a role.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Envelope' })).toBeDisabled();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('blocks agreement creation and explains the required field review', async () => {
    mocks.search = 'workspace=review';
    renderShell({
      ...editableTemplate,
      fieldLayoutStatus: 'needs_review',
      fields: [{
        id: 'field-1',
        type: 'signature',
        x: 20,
        y: 30,
        width: 120,
        height: 40,
        pageNumber: 1,
        recipientId: 'role-1',
        required: true,
        fieldOwner: 'recipients',
      }],
      defaultSigners: [{ id: 'role-1', name: 'Client', email: '', role: 'signer', order: 1 }],
    });

    expect(screen.getAllByText('Setup required').length).toBeGreaterThan(0);
    expect(screen.getByText('Template readiness')).toBeInTheDocument();
    expect(screen.getByText('Review and save every field against the latest content layout.')).toBeInTheDocument();
    const fieldsHref = screen.getByRole('link', { name: 'Open roles and fields' }).getAttribute('href');
    expect(new URL(fieldsHref || '', 'https://signworkflow.local').searchParams.get('workspace')).toBe('fields');
    const createAgreementButtons = screen.getAllByRole('button', { name: 'Create Envelope' });
    expect(createAgreementButtons).toHaveLength(1);
    expect(createAgreementButtons[0]).toBeDisabled();
    fireEvent.click(createAgreementButtons[0]);
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    expect(mocks.createDocumentFromTemplate).not.toHaveBeenCalled();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('creates an editable copy before opening a system template workspace', async () => {
    const systemTemplate: TemplateBuilderTemplate = {
      ...editableTemplate,
      _id: '507f1f77bcf86cd799439099',
      name: 'System NDA',
      isSystemTemplate: true,
      sharingScope: 'private',
    };
    mocks.duplicateTemplate.mockResolvedValue({
      ...systemTemplate,
      _id: '507f1f77bcf86cd799439100',
      isSystemTemplate: false,
    });
    renderShell(systemTemplate);

    expect(screen.getByText('System template')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename template/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));

    await waitFor(() => {
      expect(mocks.duplicateTemplate).toHaveBeenCalledWith('507f1f77bcf86cd799439099');
      const href = String(mocks.push.mock.calls.at(-1)?.[0] || '');
      const url = new URL(href, 'https://signworkflow.local');
      expect(url.pathname).toBe('/builder/template/507f1f77bcf86cd799439100');
      expect(url.searchParams.get('workspace')).toBe('content');
      expect(url.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.view)).toBe('system');
      expect(url.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo)).toBe('/templates?view=system');
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Private editable copy created.');
  });

  it('keeps dashboard System Templates context through back, tabs, customize, and agreement creation', async () => {
    mocks.search = new URLSearchParams({
      workspace: 'review',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.origin]: 'dashboard',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.view]: 'system',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo]: '/dashboard?view=system&category=Legal',
    }).toString();
    const readySystemTemplate: TemplateBuilderTemplate = {
      ...editableTemplate,
      _id: '507f1f77bcf86cd799439099',
      name: 'System NDA',
      isSystemTemplate: true,
      fieldLayoutStatus: 'current',
      fields: [{
        id: 'field-1',
        type: 'signature',
        x: 20,
        y: 30,
        width: 120,
        height: 40,
        pageNumber: 1,
        recipientId: 'role-1',
        required: true,
        fieldOwner: 'recipients',
      }],
      defaultSigners: [{ id: 'role-1', name: 'Client', email: '', role: 'signer', order: 1 }],
    };
    mocks.createDocumentFromTemplate.mockResolvedValue({
      documentId: '507f1f77bcf86cd799439200',
      sessionId: 'session-safe',
    });
    renderShell(readySystemTemplate);

    expect(screen.getAllByText('Ready to use').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Back to System Templates' })).toHaveAttribute(
      'href',
      '/dashboard?view=system&category=Legal'
    );
    expect(screen.getByRole('button', { name: 'Customize' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Envelope' }));

    await waitFor(() => expect(mocks.createDocumentFromTemplate).toHaveBeenCalled());
    const href = String(mocks.push.mock.calls.at(-1)?.[0] || '');
    const url = new URL(href, 'https://signworkflow.local');
    expect(url.pathname).toBe('/dashboard/builder/507f1f77bcf86cd799439200');
    expect(url.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo)).toBe(
      '/dashboard?view=system&category=Legal'
    );
  });

  it('prepares one draft from Create Envelope and opens its scoped Builder', async () => {
    mocks.search = new URLSearchParams({
      workspace: 'review',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.origin]: 'dashboard',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.view]: 'my',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo]: '/dashboard?view=my&category=Legal',
    }).toString();
    const fixedRecipient = {
      id: 'role-1',
      name: 'Asha',
      email: 'asha@example.com',
      role: 'signer' as const,
      order: 1,
    };
    const field = {
      id: 'field-1',
      type: 'signature' as const,
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      pageNumber: 1,
      recipientId: 'role-1',
      required: true,
      fieldOwner: 'recipients' as const,
      pageRect: { width: 612, height: 792 },
      settings: { fontSize: 14 },
    };
    const readyTemplate: TemplateBuilderTemplate = {
      ...editableTemplate,
      editableContent: null,
      fields: [field],
      defaultSigners: [fixedRecipient],
      fieldLayoutStatus: 'current',
    };
    const preparedResult = {
      documentId: '507f1f77bcf86cd799439201',
      sessionId: 'session-1',
    };
    let resolvePreparation: ((result: typeof preparedResult) => void) | null = null;
    mocks.createDocumentFromTemplate.mockImplementation(() => new Promise((resolve) => {
      resolvePreparation = resolve;
    }));
    renderShell(readyTemplate);

    const createEnvelopeButton = screen.getByRole('button', { name: 'Create Envelope' });
    expect(createEnvelopeButton).toBeEnabled();
    fireEvent.click(createEnvelopeButton);
    fireEvent.click(createEnvelopeButton);
    expect(mocks.createDocumentFromTemplate).toHaveBeenCalledTimes(1);

    resolvePreparation?.(preparedResult);
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    const href = String(mocks.push.mock.calls.at(-1)?.[0] || '');
    const url = new URL(href, 'https://signworkflow.local');
    expect(url.pathname).toBe('/dashboard/builder/507f1f77bcf86cd799439201');
    expect(url.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo)).toBe(
      '/dashboard?view=my&category=Legal'
    );
  });

  it('preserves the dashboard Builder URL through authentication', async () => {
    mocks.search = new URLSearchParams({
      workspace: 'fields',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.origin]: 'dashboard',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.view]: 'my',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo]: '/dashboard?view=my',
    }).toString();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    })));
    renderShell({ ...editableTemplate, editableContent: null });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    const loginHref = String(mocks.replace.mock.calls.at(-1)?.[0] || '');
    const loginUrl = new URL(loginHref, 'https://signworkflow.local');
    expect(loginUrl.pathname).toBe('/login');
    expect(loginUrl.searchParams.get('next')).toContain(
      '/dashboard/builder/template/507f1f77bcf86cd799439011'
    );
  });
});
