// @vitest-environment jsdom

import type React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '@/store';
import { resetSession, setUser } from '@/store/slices/sessionSlice';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function contactsResponse(contacts: unknown[]): Response {
  return new Response(JSON.stringify({ contacts }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useContactsStore account scope', () => {
  beforeEach(() => {
    vi.resetModules();
    store.dispatch(resetSession());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not fetch contacts before an authenticated account scope exists', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { useContactsStore } = await import('@/hooks/useContactsStore');
    const view = renderHook(() => useContactsStore(), { wrapper });

    await waitFor(() => {
      expect(view.result.current.loading).toBe(false);
      expect(store.getState().contacts.loading).toBe(false);
    });
    expect(view.result.current.contacts).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a deferred response after the Redux account scope changes', async () => {
    const accountAResponse = createDeferred<Response>();
    const accountBResponse = createDeferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => accountAResponse.promise)
      .mockImplementationOnce(() => accountBResponse.promise);
    vi.stubGlobal('fetch', fetchMock);

    act(() => {
      store.dispatch(
        setUser({
          id: 'account-a',
          email: 'account-a@example.com',
          orgId: 'workspace-a',
        }),
      );
    });

    const { useContactsStore } = await import('@/hooks/useContactsStore');
    const view = renderHook(() => useContactsStore(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      store.dispatch(
        setUser({
          id: 'account-b',
          email: 'account-b@example.com',
          orgId: 'workspace-b',
        }),
      );
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(view.result.current.contacts).toEqual([]);

    await act(async () => {
      accountAResponse.resolve(
        contactsResponse([
          {
            _id: 'contact-a',
            firstName: 'Account',
            lastName: 'A',
            email: 'a@example.com',
            userId: 'account-a',
          },
        ]),
      );
      await accountAResponse.promise;
    });

    expect(view.result.current.contacts).toEqual([]);
    expect(store.getState().contacts.items).toEqual([]);
    expect(view.result.current.loading).toBe(true);

    await act(async () => {
      accountBResponse.resolve(
        contactsResponse([
          {
            _id: 'contact-b',
            firstName: 'Account',
            lastName: 'B',
            email: 'b@example.com',
            userId: 'account-b',
          },
        ]),
      );
      await accountBResponse.promise;
    });

    await waitFor(() => {
      expect(view.result.current.contacts).toEqual([
        expect.objectContaining({ _id: 'contact-b', userId: 'account-b' }),
      ]);
      expect(view.result.current.loading).toBe(false);
    });
  });
});
