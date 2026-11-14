// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDocumentFromTemplate: vi.fn(),
  duplicateTemplate: vi.fn(),
  fetchTemplates: vi.fn(),
  pathname: '/templates',
  push: vi.fn(),
  replace: vi.fn(),
  search: '',
  setShowModal: vi.fn(),
  toast: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  isLoggedIn: true,
  user: { id: 'owner-1', role: 'member', orgRole: 'member' } as Record<string, unknown> | null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => ({
    get: (key: string) => new URLSearchParams(mocks.search).get(key),
    toString: () => mocks.search,
  }),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(mocks.toast, {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}));

vi.mock('@/hooks/useContextStore', () => ({
  default: () => ({
    isLoggedIn: mocks.isLoggedIn,
    setShowModal: mocks.setShowModal,
    user: mocks.user,
  }),
}));

vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => ({
    status: {
      entitlements: {
        bulkSend: false,
        templateCollaboration: false,
      },
    },
  }),
}));

vi.mock('@/components/PdfThumbnails', () => ({
  default: () => <div data-testid="pdf-thumbnail" />,
}));

vi.mock('@/components/TemplatePreviewModal', () => ({
  default: () => null,
}));

vi.mock('@/components/CreateTemplateModal', () => ({
  default: () => null,
}));

vi.mock('@/components/templates/DeleteModal', () => ({
  default: () => null,
}));

vi.mock('@/components/templates/BulkSendTemplateModal', () => ({
  default: () => null,
}));

vi.mock('@ui', () => ({
  Button: (buttonProps: {
    label?: React.ReactNode;
    icon?: React.ReactNode;
    size?: string;
    inverted?: boolean;
    variant?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    const { label, icon, children, ...props } = buttonProps;
    delete props.size;
    delete props.inverted;
    delete props.variant;
    return <button {...props}>{icon}{label ?? children}</button>;
  },
}));

import { Templates } from '@/components/templates/Templates';
import type { Template } from '@/hooks/useTemplates';

const readyTemplate = (overrides: Partial<Template> = {}): Template => ({
  _id: 'ready-1',
  name: 'Ready template',
  category: 'Legal',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  defaultSigners: [{ id: 'role-1', name: 'Signer', email: '', role: 'signer', order: 1 }],
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
  fieldLayoutStatus: 'current',
  isSystemTemplate: false,
  sharingScope: 'private',
  templateFileUrl: '',
  userId: 'owner-1',
  ...overrides,
});

const incompleteTemplate = (overrides: Partial<Template> = {}): Template => readyTemplate({
  _id: 'incomplete-1',
  name: 'Incomplete template',
  fieldLayoutStatus: 'needs_review',
  ...overrides,
});

function renderTemplates(templates: Template[], initialViewMode: 'all' | 'my' | 'system' = 'all') {
  return render(
    <Templates
      initialViewMode={initialViewMode}
      templates={templates}
      loading={false}
      error={null}
      fetchTemplates={mocks.fetchTemplates}
      duplicateTemplate={mocks.duplicateTemplate}
      trashTemplate={vi.fn()}
      createDocumentFromTemplate={mocks.createDocumentFromTemplate}
      searchQuery=""
      selectedCategory={null}
    />
  );
}

function templateCard(name: string): HTMLElement {
  const card = screen.getByRole('heading', { name }).closest('.bg-white');
  if (!card) throw new Error(`Unable to find card for ${name}`);
  return card as HTMLElement;
}

describe('Templates state-driven actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDocumentFromTemplate.mockResolvedValue(null);
    mocks.duplicateTemplate.mockResolvedValue(null);
    mocks.fetchTemplates.mockResolvedValue(undefined);
    mocks.isLoggedIn = true;
    mocks.pathname = '/templates';
    mocks.search = '';
    mocks.user = { id: 'owner-1', role: 'member', orgRole: 'member' };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('makes Finish setup the only edit action for a manageable incomplete template', () => {
    renderTemplates([incompleteTemplate()], 'my');

    const card = templateCard('Incomplete template');
    expect(within(card).getByText('Setup required')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Edit template' })).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Finish setup' }));

    expect(mocks.push).toHaveBeenCalledWith(
      '/builder/template/incomplete-1?workspace=review&templateOrigin=templates&templateView=my&templateReturnTo=%2Ftemplates%3Fview%3Dmy'
    );
  });

  it('shows ready state and keeps the template builder secondary to Create Envelope', () => {
    renderTemplates([readyTemplate()], 'my');

    const card = templateCard('Ready template');
    expect(within(card).getByText('Ready to use')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Create Envelope' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: 'Open Template Builder' })).toBeEnabled();
  });

  it('routes an empty template to setup instead of treating it as ready', () => {
    renderTemplates([readyTemplate({
      _id: 'empty-template',
      name: 'Empty template',
      defaultSigners: [],
      fields: [],
    })], 'my');

    const card = templateCard('Empty template');
    expect(within(card).getByText('Setup required')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Finish setup' })).toBeEnabled();
    expect(within(card).queryByRole('button', { name: 'Create Envelope' })).not.toBeInTheDocument();
  });

  it('does not let a read-only teammate enter an incomplete template editor', () => {
    mocks.user = { id: 'teammate-2', role: 'member', orgRole: 'member' };
    renderTemplates([
      incompleteTemplate({
        name: 'Shared draft',
        sharingScope: 'workspace',
        userId: 'owner-1',
      }),
    ], 'my');

    const card = templateCard('Shared draft');
    const action = within(card).getByRole('button', { name: 'Ask an owner to finish setup' });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute(
      'title',
      'An owner or workspace admin must finish setup before this template can Create Envelopes.'
    );
    expect(within(card).queryByRole('button', { name: 'Edit template' })).not.toBeInTheDocument();
    fireEvent.click(action);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('uses Customize for incomplete system templates and discloses the private copy', async () => {
    const system = incompleteTemplate({
      _id: 'system-incomplete',
      name: 'System draft',
      isSystemTemplate: true,
      userId: undefined,
    });
    const copy = readyTemplate({
      _id: 'private-copy',
      name: 'System draft (Copy)',
      editableContent: {
        version: 1,
        blocks: [{ id: 'block-1', type: 'paragraph', text: 'Terms', html: '<p>Terms</p>' }],
        variables: [],
      },
    });
    mocks.duplicateTemplate.mockResolvedValue(copy);
    renderTemplates([system], 'system');

    const card = templateCard('System draft');
    expect(within(card).queryByRole('button', { name: 'Create Envelope' })).not.toBeInTheDocument();
    expect(within(card).getAllByRole('button', { name: 'Customize' })).toHaveLength(1);
    fireEvent.click(within(card).getByRole('button', { name: 'Customize' }));

    await waitFor(() => {
      expect(mocks.duplicateTemplate).toHaveBeenCalledWith('system-incomplete');
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Private editable copy created');
      expect(mocks.push).toHaveBeenCalledWith(
        '/builder/template/private-copy?workspace=content&templateOrigin=templates&templateView=system&templateReturnTo=%2Ftemplates%3Fview%3Dsystem'
      );
    });
  });

  it('preserves guest Create Envelope while protecting Customize with resumable sign-in', async () => {
    mocks.isLoggedIn = false;
    mocks.user = null;
    const system = readyTemplate({
      _id: 'system-ready',
      name: 'Public system template',
      isSystemTemplate: true,
      userId: undefined,
      editableContent: {
        version: 1,
        blocks: [{ id: 'block-1', type: 'paragraph', text: 'Terms', html: '<p>Terms</p>' }],
        variables: [],
      },
    });
    mocks.createDocumentFromTemplate.mockResolvedValue({
      documentId: 'guest-document',
      sessionId: 'guest-session',
      guestId: 'guest_public_1',
      recipients: [{ id: 'role-1', name: 'Guest signer', email: 'guest@example.com', role: 'signer', order: 1 }],
      fields: readyTemplate().fields,
    });
    renderTemplates([system], 'system');

    const card = templateCard('Public system template');
    fireEvent.click(within(card).getByRole('button', { name: 'Create Envelope' }));

    await waitFor(() => {
      expect(mocks.createDocumentFromTemplate).toHaveBeenCalledWith(
        'system-ready',
        expect.any(String),
        undefined,
        undefined,
        true
      );
      expect(mocks.push).toHaveBeenCalledWith(
        '/builder/guest-document?guestId=guest_public_1&templateOrigin=templates&templateView=system&templateReturnTo=%2Ftemplates%3Fview%3Dsystem'
      );
    });
    expect(mocks.setShowModal).not.toHaveBeenCalled();

    mocks.push.mockClear();
    fireEvent.click(within(card).getByRole('button', { name: 'Customize' }));
    expect(mocks.push).toHaveBeenCalledWith(
      '/login?next=%2Ftemplates%3Fview%3Dsystem%26customize%3Dsystem-ready'
    );
    expect(mocks.duplicateTemplate).not.toHaveBeenCalled();
  });

  it('resumes a protected system customization once after login', async () => {
    mocks.search = 'view=system&customize=system-ready';
    const system = readyTemplate({
      _id: 'system-ready',
      name: 'Public system template',
      isSystemTemplate: true,
      userId: undefined,
    });
    const copy = readyTemplate({ _id: 'resumed-copy', name: 'Private copy' });
    mocks.duplicateTemplate.mockResolvedValue(copy);
    renderTemplates([system], 'system');

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/templates?view=system', { scroll: false });
      expect(mocks.duplicateTemplate).toHaveBeenCalledTimes(1);
      expect(mocks.duplicateTemplate).toHaveBeenCalledWith('system-ready');
      expect(mocks.push).toHaveBeenCalledWith(
        '/builder/template/resumed-copy?workspace=fields&templateOrigin=templates&templateView=system&templateReturnTo=%2Ftemplates%3Fview%3Dsystem'
      );
    });
  });

  it('opens an agreement in the dashboard-scoped Builder when launched from My Templates', async () => {
    mocks.pathname = '/dashboard';
    mocks.search = 'view=my';
    mocks.createDocumentFromTemplate.mockResolvedValue({
      documentId: 'dashboard-document',
      sessionId: 'session-1',
    });
    renderTemplates([readyTemplate()], 'my');

    const createEnvelope = within(templateCard('Ready template')).getByRole('button', { name: 'Create Envelope' });
    fireEvent.click(createEnvelope);
    fireEvent.click(createEnvelope);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(
        '/dashboard/builder/dashboard-document?templateOrigin=dashboard&templateView=my&templateReturnTo=%2Fdashboard%3Fview%3Dmy'
      );
    });
    expect(mocks.createDocumentFromTemplate).toHaveBeenCalledTimes(1);
  });

});
