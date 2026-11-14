// @vitest-environment jsdom

import React, { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CloudStorage from '@/app/account/cloudStorage/page';

const mocks = vi.hoisted(() => ({
  search: '',
  replace: vi.fn(),
  useSubscriptionStatus: vi.fn(),
  useContextStore: vi.fn(),
  getWorkspaceCloudArchive: vi.fn(),
  fetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => mocks.useSubscriptionStatus(),
}));
vi.mock('@/hooks/useContextStore', () => ({
  default: () => mocks.useContextStore(),
}));
vi.mock('@/hooks/useCloudConnections', () => ({
  useCloudConnections: () => ({ providers: [], loading: false, refresh: vi.fn() }),
}));
vi.mock('@/components/account/AutomaticCloudExportPanel', () => ({ default: () => null }));
vi.mock('@/lib/cloud-client', () => ({
  getWorkspaceCloudArchive: mocks.getWorkspaceCloudArchive,
  exportDocumentToCloud: vi.fn(),
  exportDocumentsToCloud: vi.fn(),
  disconnectWorkspaceCloudConnection: vi.fn(),
  retryWorkspaceCloudArchive: vi.fn(),
  startWorkspaceCloudConnection: vi.fn(),
  updateWorkspaceCloudArchive: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({
  default: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function setCallback(status: string, message: string) {
  mocks.search = new URLSearchParams({ cloud_status: status, message, provider: 'google_drive' }).toString();
}

describe('Cloud Storage OAuth feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = '';
    mocks.useContextStore.mockReturnValue({ documents: [], user: { role: 'owner' } });
    mocks.useSubscriptionStatus.mockReturnValue({
      loading: false,
      status: { entitlements: { cloudLibrary: true } },
    });
    mocks.getWorkspaceCloudArchive.mockResolvedValue({ providers: [], rules: [], jobs: [] });
    mocks.fetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/cloud/workspace-archive?')) {
        return Response.json(await mocks.getWorkspaceCloudArchive());
      }
      return Response.json({ message: 'Unexpected request.' }, { status: 404 });
    });
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows success once, loads the connected workspace destination, and clears only callback parameters', async () => {
    const message = 'Archive Account connected successfully as a workspace archive destination.';
    setCallback('connected', message);
    mocks.search += '&view=recent';
    mocks.getWorkspaceCloudArchive.mockResolvedValue({
      providers: [{
        provider: 'google_drive',
        label: 'Google Drive',
        configured: true,
        connected: true,
        accountName: 'Archive Account',
      }],
      rules: [],
      jobs: [],
    });

    const { rerender } = render(<StrictMode><CloudStorage /></StrictMode>);

    expect(await screen.findByText('Archive Account')).toBeInTheDocument();
    expect(mocks.getWorkspaceCloudArchive).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledExactlyOnceWith(message);
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/dashboard/account/cloud-storages?view=recent', { scroll: false });

    // URL replacement can lag behind component rerenders.
    rerender(<StrictMode><CloudStorage /></StrictMode>);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['provider rejection', 'Access to the cloud account was denied.'],
    ['expired state', 'The cloud connection response is invalid or expired. Please try again.'],
    ['workspace change', 'The workspace changed before this cloud connection was completed. Please try again.'],
  ])('shows the %s callback error and removes it from the URL', async (_scenario, message) => {
    setCallback('error', message);

    render(<CloudStorage />);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(message));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/dashboard/account/cloud-storages', { scroll: false });
    await screen.findByText('Workspace-owned signed-document archive');
  });

  it.each([true, false])('shows access errors while subscription loading is %s and cloud access is unavailable', (loading) => {
    const message = 'Workspace admin access is required to connect an archive destination.';
    setCallback('error', message);
    mocks.useContextStore.mockReturnValue({ documents: [], user: { role: 'member' } });
    mocks.useSubscriptionStatus.mockReturnValue({
      loading,
      status: { entitlements: { cloudLibrary: false } },
    });

    render(<CloudStorage />);

    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(message);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/dashboard/account/cloud-storages', { scroll: false });
    expect(mocks.getWorkspaceCloudArchive).not.toHaveBeenCalled();
  });

  it('does not notify or navigate during an ordinary visit', async () => {
    mocks.search = 'view=recent';

    render(<CloudStorage />);

    await screen.findAllByText('No workspace destination connected');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
