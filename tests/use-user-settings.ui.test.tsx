// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe('useUserSettings', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not expose cached settings from the previous account while switching accounts', async () => {
    const secondAccountResponse = createDeferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ dateFormat: 'DD/MM/YYYY (EU)' }))
      .mockImplementationOnce(() => secondAccountResponse.promise);

    vi.stubGlobal('fetch', fetchMock);

    const { useUserSettings } = await import('@/hooks/useUserSettings');
    const view = renderHook(
      ({ accountKey }: { accountKey: string }) =>
        useUserSettings({ enabled: true, accountKey }),
      { initialProps: { accountKey: 'account-a' } },
    );

    await waitFor(() => {
      expect(view.result.current.settings.dateFormat).toBe('DD/MM/YYYY (EU)');
      expect(view.result.current.loading).toBe(false);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    view.rerender({ accountKey: 'account-b' });

    expect(view.result.current.settings.dateFormat).toBe('MM/DD/YYYY (US)');
    expect(view.result.current.loading).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondAccountResponse.resolve(jsonResponse({ dateFormat: 'YYYY-MM-DD (ISO)' }));
      await secondAccountResponse.promise;
    });

    await waitFor(() => {
      expect(view.result.current.settings.dateFormat).toBe('YYYY-MM-DD (ISO)');
      expect(view.result.current.loading).toBe(false);
    });
  });

  it('publishes a refresh result to every mounted consumer for the same account', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ dateFormat: 'DD/MM/YYYY (EU)' }))
      .mockResolvedValueOnce(jsonResponse({ dateFormat: 'YYYY-MM-DD (ISO)' }));

    vi.stubGlobal('fetch', fetchMock);

    const { useUserSettings } = await import('@/hooks/useUserSettings');
    const view = renderHook(() => ({
      first: useUserSettings({ enabled: true, accountKey: 'account-a' }),
      second: useUserSettings({ enabled: true, accountKey: 'account-a' }),
    }));

    await waitFor(() => {
      expect(view.result.current.first.settings.dateFormat).toBe('DD/MM/YYYY (EU)');
      expect(view.result.current.second.settings.dateFormat).toBe('DD/MM/YYYY (EU)');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await view.result.current.first.refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(view.result.current.first.settings.dateFormat).toBe('YYYY-MM-DD (ISO)');
    expect(view.result.current.second.settings.dateFormat).toBe('YYYY-MM-DD (ISO)');
  });
});
