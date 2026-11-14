// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DeveloperIntegrationsPanel from '@/components/account/DeveloperIntegrationsPanel';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const replacementKey = {
  id: 'replacement-key',
  name: 'Replacement API',
  prefix: 'sw_live_replacement',
  scopes: ['documents:read'],
  createdAt: '2026-09-10T10:00:00.000Z',
  expiresAt: null,
  rotatedAt: null as string | null,
};

const rotatedKey = {
  ...replacementKey,
  id: 'rotated-key',
  name: 'Previous API',
  prefix: 'sw_live_previous',
  expiresAt: '2026-09-11T10:00:00.000Z',
  rotatedAt: '2026-09-10T10:00:00.000Z',
  rotationDueAt: '2026-09-10T10:00:00.000Z',
};

describe('Developer integrations API key retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Response.json({ success: true });
      if (path === '/api/v1/keys') return Response.json({ keys: [rotatedKey, replacementKey] });
      if (path === '/api/v1/webhooks') return Response.json({ webhooks: [] });
      return Response.json({ deliveries: [] });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps rotated keys revoke-only and leaves replacement keys editable', async () => {
    render(<DeveloperIntegrationsPanel />);

    const rotated = within(await screen.findByRole('group', { name: 'API key Previous API' }));
    expect(rotated.queryByRole('button', { name: 'Controls' })).not.toBeInTheDocument();
    expect(rotated.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
    expect(rotated.getByRole('button', { name: 'Revoke' })).toBeEnabled();
    expect(rotated.getByText(`Rotated key — fixed retirement: ${new Date(rotatedKey.expiresAt).toLocaleString()}. Only revocation is available.`)).toBeInTheDocument();
    expect(rotated.queryByText(/Rotate by/)).not.toBeInTheDocument();

    const replacement = within(screen.getByRole('group', { name: 'API key Replacement API' }));
    expect(replacement.getByRole('button', { name: 'Rotate' })).toBeEnabled();
    expect(replacement.getByRole('button', { name: 'Revoke' })).toBeEnabled();
    fireEvent.click(replacement.getByRole('button', { name: 'Controls' }));
    expect(screen.getByRole('button', { name: 'Save controls' })).toBeEnabled();
    expect(screen.getByPlaceholderText('Key name')).toHaveValue(replacementKey.name);

    fireEvent.click(rotated.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/keys/rotated-key', expect.objectContaining({ method: 'DELETE' })));
    await waitFor(() => expect(screen.queryByText('Loading developer integrations…')).not.toBeInTheDocument());
  });

  it('closes existing controls when that key is rotated', async () => {
    let rotated = false;
    mocks.fetch.mockImplementation(async (path: string) => {
      if (path === '/api/v1/keys/replacement-key/rotate') {
        rotated = true;
        return Response.json({ secret: 'new-replacement-secret' });
      }
      if (path === '/api/v1/keys') return Response.json({ keys: [{
        ...replacementKey,
        rotatedAt: rotated ? rotatedKey.rotatedAt : null,
        expiresAt: rotated ? rotatedKey.expiresAt : null,
      }] });
      if (path === '/api/v1/webhooks') return Response.json({ webhooks: [] });
      return Response.json({ deliveries: [] });
    });

    render(<DeveloperIntegrationsPanel />);

    const key = within(await screen.findByRole('group', { name: 'API key Replacement API' }));
    fireEvent.click(key.getByRole('button', { name: 'Controls' }));
    expect(screen.getByRole('button', { name: 'Save controls' })).toBeInTheDocument();
    fireEvent.click(key.getByRole('button', { name: 'Rotate' }));

    await screen.findByText(/Rotated key — fixed retirement:/);
    expect(screen.queryByRole('button', { name: 'Save controls' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Controls' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create API key' })).toBeInTheDocument();
  });
});
