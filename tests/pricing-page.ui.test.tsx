// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PricingPage from '@/app/pricing/page';
import { store } from '@/store';
import { resetSession, setUser } from '@/store/slices/sessionSlice';

const { mockCookies, mockHeaders } = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockHeaders: vi.fn(),
}));
const mockUseSubscriptionStatus = vi.fn();
const mockRefreshAccessToken = vi.fn();

function mockBillingMarketFetch(payload: Record<string, unknown> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => mockUseSubscriptionStatus(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    refreshAccessToken: mockRefreshAccessToken,
  }),
}));

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));

describe('PricingPage', () => {
  beforeEach(() => {
    store.dispatch(resetSession());
    mockUseSubscriptionStatus.mockReset();
    mockRefreshAccessToken.mockReset();
    mockCookies.mockReset();
    mockHeaders.mockReset();
    mockBillingMarketFetch();
    mockCookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    mockHeaders.mockResolvedValue(
      new Headers({
        'x-vercel-ip-country': 'US',
        'accept-language': 'en-US,en;q=0.9',
      })
    );
    mockUseSubscriptionStatus.mockReturnValue({
      loading: false,
      status: {
        workspaceTier: 'trial',
        organization: null,
        billing: {
          providerConfigured: false,
          provider: 'razorpay',
          missingConfig: [],
          canStartCheckout: false,
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
      },
      refresh: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the recommended package structure and updates paid pricing by billing cycle', async () => {
    const page = await PricingPage();

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    expect(screen.getByRole('heading', { name: /Simple, Transparent Pricing/i })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Business' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: 'Business Plus' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: 'Enterprise' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/first paid team plan/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Site License' })).toBeInTheDocument();
    expect(screen.getByText('$5')).toBeInTheDocument();
    expect(screen.getAllByText('/user/mo').length).toBeGreaterThan(0);
    expect(screen.getByText('Save up to 28%')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Free Trial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Free trial/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch'));

    expect(screen.getByText('$7')).toBeInTheDocument();
  }, 60000);

  it('defaults to INR pricing when the request resolves to India', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({
        'x-vercel-ip-country': 'IN',
        'accept-language': 'en-US,en-IN;q=0.9',
      })
    );

    const page = await PricingPage();

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    expect(screen.getByText('₹499')).toBeInTheDocument();
    expect(screen.queryByText('$5')).not.toBeInTheDocument();
  });

  it('keeps INR pricing when the request resolves to India', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({
        'x-vercel-ip-country': 'IN',
        'accept-language': 'en-IN,en;q=0.9',
      })
    );

    const page = await PricingPage();

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    expect(screen.getByText('₹499')).toBeInTheDocument();
    expect(screen.queryByText('$5')).not.toBeInTheDocument();
  });

  it('keeps USD pricing when an international request has India browser hints', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({
        'x-vercel-ip-country': 'US',
        'accept-language': 'en-IN,en;q=0.9',
      })
    );

    const page = await PricingPage();

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    expect(screen.getByText('$5')).toBeInTheDocument();
    expect(screen.queryByText('₹499')).not.toBeInTheDocument();
  });

  it('uses the region cookie when the pricing request has no country header', async () => {
    mockHeaders.mockResolvedValue(new Headers());
    mockCookies.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === 'sw_consent_region' ? { name, value: 'IN' } : undefined
      ),
    });

    const page = await PricingPage();

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    expect(screen.getByText('₹499')).toBeInTheDocument();
    expect(screen.queryByText('$5')).not.toBeInTheDocument();
  });

  it('updates pricing from the billing market endpoint after load', async () => {
    mockHeaders.mockResolvedValue(new Headers());
    const fetchMock = mockBillingMarketFetch({ billingMarket: 'india' });

    const page = await PricingPage();

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('₹499')).toBeInTheDocument();
    });
    expect(screen.queryByText('$5')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing-market',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      })
    );
  });

  it('uses the billing_market query override over automatic detection', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({
        'x-vercel-ip-country': 'IN',
        'accept-language': 'en-IN,en;q=0.9',
      })
    );

    const page = await PricingPage({
      searchParams: Promise.resolve({
        billing_market: 'international',
      }),
    });

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    expect(screen.getByText('$5')).toBeInTheDocument();
    expect(screen.queryByText('₹499')).not.toBeInTheDocument();
  });

  it('shows the feature matrix and current package readiness notes', async () => {
    const page = await PricingPage();

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    expect(screen.getByRole('heading', { name: /Feature Matrix/i })).toBeInTheDocument();
    expect(screen.getAllByText('Workspace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('One shared team').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Multiple teams').length).toBeGreaterThan(0);
    expect(screen.getAllByText('User settings, signing defaults, and notification preferences').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Legal holds, audit export, and audit verification').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cloud storage and payment settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Trial workspace')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trial and upgrade path' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Billing and renewal' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Admin ownership' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Included').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Not included').length).toBeGreaterThan(0);
    expect(screen.getByText('This comparison focuses on paid plans only.')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Trial is the entry path, not a steady-state package, so the matrix below compares Business, Business Plus, and Enterprise/
      )
    ).toBeInTheDocument();
  }, 60000);

  it('lets users continue or switch an unfinished checkout directly from pricing', async () => {
    store.dispatch(
      setUser({
        id: 'user-1',
        email: 'owner@example.com',
        role: 'user',
        orgId: 'org-1',
        orgRole: 'owner',
      })
    );
    mockUseSubscriptionStatus.mockReturnValue({
      loading: false,
      status: {
        workspaceTier: 'trial',
        organization: {
          id: 'org-1',
          name: 'Acme Workspace',
          plan: 'trial',
          normalizedTier: 'business',
          status: 'active',
          seatLimit: 1,
          activeMembers: 1,
          teamCount: 1,
          maxTeams: 1,
          trialEndsAt: null,
          role: 'owner',
        },
        billing: {
          providerConfigured: true,
          provider: 'razorpay',
          market: 'india',
          defaultMarket: 'india',
          supportedMarkets: ['india', 'international'],
          missingConfig: [],
          canStartCheckout: true,
          canManageSubscription: true,
          managementActions: ['cancel'],
          statusMessage: null,
          customerId: 'cust_123',
          subscriptionId: 'sub_pending_123',
          subscriptionStatus: 'created',
          pendingPlan: 'business',
          billingCycle: 'annually',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          hasScheduledChange: false,
          selfServePlans: ['business', 'business_plus', 'enterprise'],
        },
        trialAccess: {
          isExpired: true,
          hasRestrictedControls: true,
          message: null,
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
          cloudLibrary: false,
          inviteLinks: false,
          templateCollaboration: false,
          bulkSend: false,
          paymentRequests: false,
        },
        availablePlans: [],
      },
      refresh: vi.fn(),
    });

    const page = await PricingPage();

    render(
      <Provider store={store}>
        {page}
      </Provider>
    );

    expect(screen.getByRole('button', { name: 'Resume Business checkout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard checkout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to Business Plus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to Enterprise' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pending Business checkout' })).not.toBeInTheDocument();
  });
});
