// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Doc, User } from '@/types/types';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockLogout = vi.fn();
const mockSetDocuments = vi.fn();
const mockSetSearchQuery = vi.fn();
const mockSetSelectedCategory = vi.fn();

let documents: Doc[] = [];

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    logout: mockLogout,
  }),
}));

vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => ({
    loading: false,
    status: {
      workspaceTier: 'business',
      organization: null,
    },
  }),
}));

vi.mock('@/hooks/useContextStore', () => ({
  default: () => ({
    documents,
    setDocuments: mockSetDocuments,
    isLoggedIn: true,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      orgId: null,
    } satisfies User,
    searchQuery: '',
    setSearchQuery: mockSetSearchQuery,
    selectedCategory: null,
    setSelectedCategory: mockSetSelectedCategory,
  }),
}));

vi.mock('@/components/UploadZone', () => ({
  default: () => <div data-testid="upload-zone" />,
}));

vi.mock('@/components/dashboard/DashboardSidebarShell', () => ({
  default: () => <aside data-testid="dashboard-sidebar" />,
}));

vi.mock('@/components/dashboard/DashboardHeader', () => ({
  default: () => <div data-testid="dashboard-header" />,
}));

vi.mock('@/components/dashboard/DocSearch', () => ({
  default: () => <input aria-label="Search documents" />,
}));

vi.mock('@/components/contacts/Contacts', () => ({
  default: () => <div data-testid="contacts" />,
}));

vi.mock('@/components/templates/TemplateSearch', () => ({
  default: () => <div data-testid="template-search" />,
}));

vi.mock('@/app/account/workspace/members/page', () => ({
  default: () => <div data-testid="workspace-members" />,
}));

vi.mock('@/config/account.config', () => ({
  ACCOUNT_CONFIG: [],
}));

vi.mock('@/config/document.config', () => ({
  DOCUMENT_CONFIG: [
    {
      id: 'dash-documents',
      label: 'Documents',
      icon: () => null,
      component: () => <div data-testid="document-list" />,
    },
  ],
}));

import Dashboard from '@/app/dashboard/page';
import {
  clearDashboardDocumentCache,
  markDashboardDocumentsUpdated,
} from '@/lib/dashboard-document-cache';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('Dashboard document loading', () => {
  beforeEach(() => {
    clearDashboardDocumentCache();
    documents = [];
    mockPush.mockReset();
    mockReplace.mockReset();
    mockLogout.mockReset();
    mockSetSearchQuery.mockReset();
    mockSetSelectedCategory.mockReset();
    mockSetDocuments.mockReset();
    mockSetDocuments.mockImplementation((update: React.SetStateAction<Doc[]>) => {
      documents = typeof update === 'function' ? update(documents) : update;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps the upload dropzone hidden while the first document request is pending', () => {
    const deferred = createDeferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => deferred.promise));

    render(<Dashboard />);

    expect(screen.getByRole('status', { name: 'Loading documents' })).toBeInTheDocument();
    expect(screen.queryByTestId('upload-zone')).not.toBeInTheDocument();
  });

  it('shows the document list instead of flashing the upload dropzone when documents load', async () => {
    const deferred = createDeferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => deferred.promise));

    render(<Dashboard />);

    deferred.resolve(
      jsonResponse({
        success: true,
        documents: [
          {
            id: 'doc-1',
            name: 'Signed agreement.pdf',
            status: 'saved',
            createdAt: '2026-07-28T00:00:00.000Z',
          },
        ],
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('document-list')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('upload-zone')).not.toBeInTheDocument();
  });

  it('shows the upload dropzone only after an empty document response is confirmed', async () => {
    const deferred = createDeferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => deferred.promise));

    render(<Dashboard />);

    expect(screen.queryByTestId('upload-zone')).not.toBeInTheDocument();

    deferred.resolve(
      jsonResponse({
        success: true,
        documents: [],
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('upload-zone')).toBeInTheDocument();
    });
  });

  it('renders a fresh cached document snapshot immediately when the dashboard is revisited', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        documents: [
          {
            id: 'doc-cached',
            name: 'Cached agreement.pdf',
            status: 'saved',
            createdAt: '2026-07-28T00:00:00.000Z',
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const firstVisit = render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('document-list')).toBeInTheDocument();
    });
    firstVisit.unmount();

    render(<Dashboard />);

    expect(screen.getByTestId('document-list')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading documents' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not replace the document store when stale revalidation returns unchanged data', async () => {
    const responsePayload = {
      success: true,
      documents: [
        {
          id: 'doc-unchanged',
          name: 'Unchanged agreement.pdf',
          status: 'saved',
          createdAt: '2026-07-28T00:00:00.000Z',
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(responsePayload)));
    vi.stubGlobal('fetch', fetchMock);

    const firstVisit = render(<Dashboard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetDocuments).toHaveBeenCalledTimes(1));
    firstVisit.unmount();

    markDashboardDocumentsUpdated('user-1:personal', Date.now() - 31_000);
    render(<Dashboard />);

    expect(screen.getByTestId('document-list')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(mockSetDocuments).toHaveBeenCalledTimes(1);
  });
});
