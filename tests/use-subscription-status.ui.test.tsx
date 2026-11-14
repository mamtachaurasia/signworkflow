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

describe('useSubscriptionStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    store.dispatch(resetSession());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reuses fresh subscription state and only refetches when explicitly refreshed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspaceTier: 'trial',
          organization: null,
          billing: {
            providerConfigured: true,
            provider: 'razorpay',
            missingConfig: [],
            canStartCheckout: true,
            canManageSubscription: false,
            managementActions: [],
            statusMessage: null,
            customerId: null,
            subscriptionId: null,
            subscriptionStatus: null,
            billingCycle: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            hasScheduledChange: false,
            selfServePlans: [],
          },
          entitlements: {
            teams: false,
            multipleTeams: false,
            auditTrail: false,
            adminGovernance: false,
            orgSettings: false,
            retentionPolicies: false,
            legalHolds: false,
            auditExport: false,
          },
          availablePlans: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspaceTier: 'business',
          organization: {
            id: '507f1f77bcf86cd799439011',
            name: 'Acme Workspace',
            plan: 'business',
            normalizedTier: 'business',
            status: 'active',
            seatLimit: 5,
            activeMembers: 1,
            teamCount: 0,
            maxTeams: 1,
            role: 'owner',
          },
          billing: {
            providerConfigured: true,
            provider: 'razorpay',
            missingConfig: [],
            canStartCheckout: true,
            canManageSubscription: true,
            managementActions: ['cancel'],
            statusMessage: null,
            customerId: 'cust_1',
            subscriptionId: 'sub_1',
            subscriptionStatus: 'authenticated',
            billingCycle: 'annually',
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            hasScheduledChange: false,
            selfServePlans: ['business', 'business_plus', 'enterprise'],
          },
          entitlements: {
            teams: true,
            multipleTeams: false,
            auditTrail: true,
            adminGovernance: false,
            orgSettings: false,
            retentionPolicies: false,
            legalHolds: false,
            auditExport: false,
          },
          availablePlans: [],
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { useSubscriptionStatus } = await import('@/hooks/useSubscriptionStatus');

    const firstRender = renderHook(
      () => useSubscriptionStatus({ scopeKey: 'account-a:personal' }),
      { wrapper },
    );

    await waitFor(() => {
      expect(firstRender.result.current.status.workspaceTier).toBe('trial');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstRender.unmount();

    const secondRender = renderHook(
      () => useSubscriptionStatus({ scopeKey: 'account-a:personal' }),
      { wrapper },
    );

    expect(secondRender.result.current.status.workspaceTier).toBe('trial');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await secondRender.result.current.refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(secondRender.result.current.status.workspaceTier).toBe('business');
      expect(secondRender.result.current.status.organization?.name).toBe('Acme Workspace');
    });
  });

  it('does not reuse billing status after the account scope changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workspaceTier: 'business' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workspaceTier: 'trial' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { useSubscriptionStatus } = await import('@/hooks/useSubscriptionStatus');
    const view = renderHook(
      ({ scopeKey }) => useSubscriptionStatus({ scopeKey }),
      { initialProps: { scopeKey: 'account-a:org-a' }, wrapper },
    );

    await waitFor(() => {
      expect(view.result.current.status.workspaceTier).toBe('business');
    });

    view.rerender({ scopeKey: 'account-b:org-b' });

    expect(view.result.current.status.workspaceTier).toBe('trial');
    expect(view.result.current.loading).toBe(true);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(view.result.current.status.workspaceTier).toBe('trial');
    });
  });

  it('waits for an authenticated account scope instead of caching data as a guest', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workspaceTier: 'business' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useSubscriptionStatus } = await import('@/hooks/useSubscriptionStatus');
    const view = renderHook(() => useSubscriptionStatus(), { wrapper });

    expect(view.result.current.status.workspaceTier).toBe('trial');
    expect(view.result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(
        setUser({
          id: 'account-a',
          email: 'account-a@example.com',
          role: 'user',
          orgId: 'org-a',
          orgRole: 'member',
        }),
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(view.result.current.status.workspaceTier).toBe('business');
    });

    act(() => {
      store.dispatch(resetSession());
    });

    expect(view.result.current.status.workspaceTier).toBe('trial');
    expect(view.result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
