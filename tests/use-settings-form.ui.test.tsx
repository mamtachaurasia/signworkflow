// @vitest-environment jsdom

import type React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '@/store';
import { resetSession, setUser } from '@/store/slices/sessionSlice';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

describe('useSettingsForm', () => {
  beforeEach(() => {
    vi.resetModules();
    store.dispatch(resetSession());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps account settings loading until the authenticated identity is hydrated', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ dateFormat: 'YYYY-MM-DD (ISO)' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { useSettingsForm } = await import('@/components/account/settings/useSettingsForm');
    const view = renderHook(() => useSettingsForm(['dateFormat']), { wrapper });

    expect(view.result.current.loading).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(
        setUser({
          id: 'account-a',
          email: 'account-a@example.com',
          role: 'user',
          orgId: null,
          orgRole: null,
        }),
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(view.result.current.loading).toBe(false);
      expect(view.result.current.form.getValues('dateFormat')).toBe('YYYY-MM-DD (ISO)');
    });
  });
});
