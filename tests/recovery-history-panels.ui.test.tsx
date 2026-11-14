// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AutomaticCloudExportPanel from '@/components/account/AutomaticCloudExportPanel';
import WorkspaceCloudArchivePanel from '@/components/account/WorkspaceCloudArchivePanel';
import DeveloperIntegrationsPanel from '@/components/account/DeveloperIntegrationsPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), retry: vi.fn(), getAutomaticCloudExports: vi.fn(), getWorkspaceCloudArchive: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/cloud-client', () => ({
  getAutomaticCloudExports: mocks.getAutomaticCloudExports,
  getWorkspaceCloudArchive: mocks.getWorkspaceCloudArchive,
  retryAutomaticCloudExport: mocks.retry,
  retryWorkspaceCloudArchive: mocks.retry,
}));

const job = (number: number, status = 'completed') => ({ id: `job-${number}`, documentId: `doc-${number}`, event: `event-${number}`, endpointId: 'endpoint', provider: 'google_drive', status, attempts: 1, maxAttempts: 8, createdAt: '2026-09-01T00:00:00.000Z' });

describe('recovery history panels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockImplementation(async (path: string) => {
      if (path === '/api/v1/keys') return Response.json({ keys: [] });
      if (path === '/api/v1/webhooks') return Response.json({ webhooks: [] });
      const url = new URL(path, 'https://example.com');
      const filtered = url.searchParams.get('status') === 'failures';
      const next = url.searchParams.has('cursor');
      const items = filtered || next ? [job(26, 'failed')] : Array.from({ length: 25 }, (_, index) => job(index + 1));
      return Response.json({ jobs: items, deliveries: items, nextCursor: filtered || next ? null : 'older-page' });
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it.each([
    { label: 'Automatic exports', renderPanel: () => <AutomaticCloudExportPanel providers={[]} documentNames={{}} />, old: 'Document doc-26', eleventh: 'Document doc-11', endpoint: '/api/cloud/auto-export' },
    { label: 'Workspace archives', renderPanel: () => <WorkspaceCloudArchivePanel documentNames={{}} />, old: 'Document doc-26', eleventh: 'Document doc-11', endpoint: '/api/cloud/workspace-archive' },
    { label: 'Webhook deliveries', renderPanel: () => <DeveloperIntegrationsPanel />, old: 'event-26', eleventh: 'event-11', endpoint: '/api/v1/webhooks/deliveries' },
  ])('pages and filters $label without hiding rows 11 through 25', async ({ label, renderPanel, old, eleventh, endpoint }) => {
    render(renderPanel());
    expect(await screen.findByText(eleventh)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: `Load more ${label.toLowerCase()}` }));
    expect(await screen.findByText(old)).toBeInTheDocument();
    expect(screen.getByText(eleventh)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: `${label} status` }), { target: { value: 'failures' } });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(`${endpoint}?limit=25&status=failures`, expect.anything()));
    expect(await screen.findByText(old)).toBeInTheDocument();
    expect(screen.queryByText(eleventh)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(`${label} to date`), { target: { value: '2026-09-01' } });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(`${endpoint}?limit=25&status=failures&to=2026-09-01T23%3A59%3A59.999Z`, expect.anything()));
  });

  it('uses the history response for archive settings instead of a second mount request', async () => {
    render(<AutomaticCloudExportPanel providers={[]} documentNames={{}} />);
    await screen.findByText('Document doc-11');
    expect(mocks.getAutomaticCloudExports).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    cleanup();
    mocks.fetch.mockClear();
    render(<WorkspaceCloudArchivePanel documentNames={{}} />);
    await screen.findByText('Document doc-11');
    expect(mocks.getWorkspaceCloudArchive).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
