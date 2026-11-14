// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import AdminGovernancePage from '@/app/account/admin-governance/page';
import { store } from '@/store';
import { renderWithAsyncEffects } from './utils/renderWithAsyncEffects';
import { resetSessionState, setSessionUser } from './utils/sessionTestStore';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: vi.fn(() => ({
    loading: false,
    status: {
      workspaceTier: 'business_plus',
      organization: {
        id: 'org-1',
        name: 'Acme Org',
        plan: 'business_plus',
        normalizedTier: 'business_plus',
        status: 'active',
        seatLimit: 15,
        activeMembers: 3,
        teamCount: 2,
        maxTeams: null,
        role: 'admin',
      },
      entitlements: {
        teams: true,
        multipleTeams: true,
        auditTrail: true,
        adminGovernance: true,
        orgSettings: true,
        retentionPolicies: true,
        legalHolds: true,
        auditExport: false,
      },
      availablePlans: [],
    },
  })),
}));

const mockFetch = (payload: Record<string, unknown>) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/orgs/settings')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          organizationName: payload.organizationName ?? 'Acme Org',
          brandName: payload.brandName ?? 'Acme Sign',
          settings: payload.settings ?? {
            branding: {
              brandName: 'Acme Sign',
              primaryColor: '#0f766e',
              supportEmail: 'support@acme.test',
            },
          },
        }),
      } as Response;
    }
    if (url.includes('/api/retention/policies')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ policies: payload.policies ?? [] }),
      } as Response;
    }
    if (url.includes('/api/retention/holds')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ holds: payload.holds ?? [] }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response;
  });

describe('AdminGovernancePage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    return resetSessionState();
  });

  afterEach(() => {
    void resetSessionState();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows access denied for non-admin users', async () => {
    await setSessionUser({ id: 'u1', email: 'user@example.com', role: 'user', name: 'User' });

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AdminGovernancePage />
      </Provider>
    );

    expect(
      screen.getByText(/do not have access/i)
    ).toBeInTheDocument();
  });

  it('shows a focused no-organization message when an admin has no organization', async () => {
    await setSessionUser({ id: 'a2', email: 'admin@example.com', role: 'admin', name: 'Admin' });

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AdminGovernancePage />
      </Provider>
    );

    expect(
      screen.getByText(/Admin Governance becomes available once this account is attached to a workspace/i)
    ).toBeInTheDocument();
  });

  it('renders governance sections for admin users', async () => {
    global.fetch = mockFetch({ policies: [], holds: [] }) as unknown as typeof fetch;
    await setSessionUser({
      id: 'a1',
      email: 'admin@example.com',
      role: 'admin',
      orgId: 'org-1',
      orgRole: 'admin',
      name: 'Admin',
    });

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AdminGovernancePage />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin Governance')).toBeInTheDocument();
    });

    expect(screen.getByText('Retention Policies')).toBeInTheDocument();
    expect(screen.getByText('Legal Holds')).toBeInTheDocument();
    expect(screen.getByText('System Preferences')).toBeInTheDocument();
    expect(screen.getByText('Branding')).toBeInTheDocument();
    expect(screen.getByText('Default Retention')).toBeInTheDocument();
  });
});
