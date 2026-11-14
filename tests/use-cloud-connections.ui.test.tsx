// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudConnectionSummary } from '@/lib/cloud/types';

const mocks = vi.hoisted(() => ({
  listCloudConnections: vi.fn(),
}));

vi.mock('@/lib/cloud-client', () => ({
  listCloudConnections: mocks.listCloudConnections,
}));

describe('useCloudConnections', () => {
  beforeEach(() => {
    mocks.listCloudConnections.mockReset();
  });

  it('does not publish a response after connections are disabled', async () => {
    let resolveRequest!: (value: CloudConnectionSummary[]) => void;
    mocks.listCloudConnections.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const { useCloudConnections } = await import('@/hooks/useCloudConnections');
    const { result, rerender } = renderHook(
      ({ enabled }) => useCloudConnections({ enabled }),
      { initialProps: { enabled: true } }
    );

    expect(result.current.loading).toBe(true);

    rerender({ enabled: false });
    expect(result.current.providers).toEqual([]);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveRequest([
        {
          provider: 'google_drive',
          label: 'Google Drive',
          configured: true,
          missingConfig: [],
          connected: true,
          accountEmail: 'user@example.com',
          accountName: 'User',
          lastExportedAt: null,
        },
      ]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.providers).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });
});
