// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useContextStore', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    user: { role: 'admin' },
  })),
}));

vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import RetentionInfoPanel from '@/components/builder/RetentionInfoPanel';

describe('RetentionInfoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          releasedDocuments: [
            {
              documentId: 'doc-1',
              retention: {
                status: 'active',
                policy: { name: 'Org Policy' },
              },
            },
          ],
        }),
      }) as unknown as typeof fetch;
  });

  it('applies the recomputed retention payload after releasing the last hold', async () => {
    const onRetentionChange = vi.fn();
    const onLegalHoldChange = vi.fn();

    render(
      <RetentionInfoPanel
        documentId="doc-1"
        retention={{
          status: 'on_hold',
          policy: { name: 'Org Policy' },
        }}
        legalHold={{
          status: 'active',
          holdIds: ['hold-1'],
        }}
        onRetentionChange={onRetentionChange}
        onLegalHoldChange={onLegalHoldChange}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/retention/policies', expect.any(Object));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Release' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/retention/holds/hold-1/release', {
        method: 'POST',
        credentials: 'include',
      });
    });

    await waitFor(() => {
      expect(onLegalHoldChange).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'none',
          holdIds: [],
        })
      );
      expect(onRetentionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          policy: expect.objectContaining({ name: 'Org Policy' }),
        })
      );
    });
  });
});
