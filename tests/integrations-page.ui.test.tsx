// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import IntegrationsPage from '@/app/account/integrations/page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  useSubscriptionStatus: vi.fn(),
  useCloudConnections: vi.fn(),
  startCloudConnection: vi.fn(),
  disconnectCloudConnection: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => mocks.useSubscriptionStatus(),
}));

vi.mock('@/hooks/useCloudConnections', () => ({
  useCloudConnections: () => mocks.useCloudConnections(),
}));

vi.mock('@/lib/cloud-client', () => ({
  startCloudConnection: mocks.startCloudConnection,
  disconnectCloudConnection: mocks.disconnectCloudConnection,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('IntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSubscriptionStatus.mockReturnValue({
      loading: false,
      status: {
        entitlements: {
          cloudLibrary: true,
        },
      },
    });
    mocks.useCloudConnections.mockReturnValue({
      providers: [
        {
          provider: 'google_drive',
          label: 'Google Drive',
          configured: true,
          missingConfig: [],
          connected: false,
          accountEmail: null,
          accountName: null,
          lastExportedAt: null,
        },
        {
          provider: 'dropbox',
          label: 'Dropbox',
          configured: false,
          missingConfig: ['DROPBOX_CLIENT_ID'],
          connected: false,
          accountEmail: null,
          accountName: null,
          lastExportedAt: null,
        },
      ],
      loading: false,
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    mocks.startCloudConnection.mockResolvedValue(undefined);
  });

  it('renders the provider cards and starts the delegated connection flow', async () => {
    render(<IntegrationsPage />);

    expect(
      screen.getByRole('heading', { name: /Connect your own cloud accounts for export-only access/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument();
    expect(screen.queryByText('OneDrive')).not.toBeInTheDocument();
    expect(screen.getByText('This provider is not available in this environment yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect Google Drive' }));

    await waitFor(() => {
      expect(mocks.startCloudConnection).toHaveBeenCalledWith('google_drive');
    });
  });

  it('waits for the subscription gate before showing either providers or the upgrade message', () => {
    mocks.useSubscriptionStatus.mockReturnValue({
      loading: true,
      status: {
        entitlements: {
          cloudLibrary: false,
        },
      },
    });

    render(<IntegrationsPage />);

    expect(screen.getByText('Checking cloud access for this workspace...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Google Drive' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Cloud exports are part of the Business plan' })
    ).not.toBeInTheDocument();
  });
});
