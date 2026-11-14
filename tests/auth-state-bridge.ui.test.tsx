// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AuthStateBridge from '@/components/auth/AuthStateBridge';
import {
  getDashboardDocumentsUpdatedAt,
  markDashboardDocumentsUpdated,
} from '@/lib/dashboard-document-cache';
import { store } from '@/store';
import { setDocuments } from '@/store/slices/documentsSlice';
import { resetSession, setIsLoggedIn, setUser } from '@/store/slices/sessionSlice';

const mockUseAuth = vi.fn();

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('AuthStateBridge', () => {
  beforeEach(() => {
    store.dispatch(resetSession());
    mockUseAuth.mockReset();
  });

  it('syncs org context changes into the Redux session after auth refresh', async () => {
    store.dispatch(setIsLoggedIn(true));
    store.dispatch(
      setUser({
        id: 'user-1',
        email: 'owner@example.com',
        role: 'user',
        orgId: null,
        orgRole: null,
      })
    );
    store.dispatch(setDocuments([{ _id: 'personal-document' } as never]));
    markDashboardDocumentsUpdated('user-1:personal', 123);

    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        role: 'owner',
        orgId: '507f1f77bcf86cd799439011',
        orgRole: 'owner',
      },
    });

    render(
      <Provider store={store}>
        <AuthStateBridge />
      </Provider>
    );

    await waitFor(() => {
      expect(store.getState().session.user).toEqual(
        expect.objectContaining({
          role: 'owner',
          orgId: '507f1f77bcf86cd799439011',
          orgRole: 'owner',
        })
      );
      expect(store.getState().documents.items).toEqual([]);
    });
    expect(getDashboardDocumentsUpdatedAt('user-1:personal')).toBeUndefined();
  });

  it('clears account-scoped state and document cache when authentication ends', async () => {
    store.dispatch(setIsLoggedIn(true));
    store.dispatch(
      setUser({
        id: 'user-1',
        email: 'owner@example.com',
        role: 'owner',
        orgId: 'org-1',
        orgRole: 'owner',
      }),
    );
    store.dispatch(setDocuments([{ _id: 'document-1' } as never]));
    markDashboardDocumentsUpdated('user-1:org-1', 123);

    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      user: null,
    });

    render(
      <Provider store={store}>
        <AuthStateBridge />
      </Provider>,
    );

    await waitFor(() => {
      expect(store.getState().session.user).toBeNull();
      expect(store.getState().documents.items).toEqual([]);
    });
    expect(getDashboardDocumentsUpdatedAt('user-1:org-1')).toBeUndefined();
  });
});
