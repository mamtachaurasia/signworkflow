// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SubscriptionPage from '@/app/account/subscription/page';
import { store } from '@/store';
import { resetSession, setUser } from '@/store/slices/sessionSlice';

const mockUseSubscriptionStatus = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockStartSubscriptionCheckout = vi.fn();
const mockContinuePendingSubscriptionCheckout = vi.fn();
const mockOpenSubscriptionCheckout = vi.fn();
const mockManageSubscription = vi.fn();
const mockCancelPendingSubscriptionCheckout = vi.fn();
const mockCreatePayPalCardOrder = vi.fn();
const mockCreatePayPalCheckoutOrder = vi.fn();
const mockCompletePayPalCardCheckout = vi.fn();
const mockCompleteHostedSubscriptionCheckout = vi.fn();

vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => mockUseSubscriptionStatus(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    refreshAccessToken: mockRefreshAccessToken,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/subscription-client', () => ({
  CHECKOUT_CANCELLED_MESSAGE: 'Checkout was cancelled. Your current workspace plan did not change.',
  cancelPendingSubscriptionCheckout: (...args: unknown[]) =>
    mockCancelPendingSubscriptionCheckout(...args),
  clearPendingPayPalSubscriptionId: vi.fn(),
  completePayPalCardCheckout: (...args: unknown[]) =>
    mockCompletePayPalCardCheckout(...args),
  completeHostedSubscriptionCheckout: (...args: unknown[]) =>
    mockCompleteHostedSubscriptionCheckout(...args),
  continuePendingSubscriptionCheckout: (...args: unknown[]) =>
    mockContinuePendingSubscriptionCheckout(...args),
  createPayPalCardOrder: (...args: unknown[]) =>
    mockCreatePayPalCardOrder(...args),
  createPayPalCheckoutOrder: (...args: unknown[]) =>
    mockCreatePayPalCheckoutOrder(...args),
  getPendingPayPalSubscriptionId: vi.fn(() => null),
  manageSubscription: (...args: unknown[]) => mockManageSubscription(...args),
  openSubscriptionCheckout: (...args: unknown[]) => mockOpenSubscriptionCheckout(...args),
  startSubscriptionCheckout: (...args: unknown[]) => mockStartSubscriptionCheckout(...args),
}));

describe('SubscriptionPage', () => {
  beforeEach(() => {
    store.dispatch(resetSession());
    mockUseSubscriptionStatus.mockReset();
    mockRefreshAccessToken.mockReset();
    mockStartSubscriptionCheckout.mockReset();
    mockContinuePendingSubscriptionCheckout.mockReset();
    mockOpenSubscriptionCheckout.mockReset();
    mockManageSubscription.mockReset();
    mockCancelPendingSubscriptionCheckout.mockReset();
    mockCreatePayPalCardOrder.mockReset();
    mockCreatePayPalCheckoutOrder.mockReset();
    mockCompletePayPalCardCheckout.mockReset();
    mockCompleteHostedSubscriptionCheckout.mockReset();
  });

  it('shows the current package summary and links to Pricing instead of embedding the full pricing matrix', () => {
    store.dispatch(
      setUser({
        id: 'user-1',
        email: 'user@example.com',
        role: 'user',
        orgId: undefined,
        orgRole: null,
      })
    );

    mockUseSubscriptionStatus.mockReturnValue({
      loading: false,
      status: {
        workspaceTier: 'trial',
        trialAccess: {
          isExpired: false,
          hasRestrictedControls: false,
          message: null,
        },
        organization: null,
        billing: {
          providerConfigured: true,
          provider: 'razorpay',
          missingConfig: [],
          canStartCheckout: true,
          canManageSubscription: false,
          managementActions: [],
          statusMessage:
            'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
          customerId: null,
          subscriptionId: null,
          subscriptionStatus: null,
          pendingPlan: null,
          billingCycle: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          hasScheduledChange: false,
          selfServePlans: ['business', 'business_plus', 'enterprise'],
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

    render(
      <Provider store={store}>
        <SubscriptionPage />
      </Provider>
    );

    expect(screen.getByRole('heading', { name: 'Subscription' })).toBeInTheDocument();
    expect(screen.getByText('Current package')).toBeInTheDocument();
    expect(
      screen.getByText(
        'user@example.com is currently in the free trial workspace with Business Plus features during evaluation.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Free Trial' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Start with a free trial workspace that includes Business Plus features during evaluation/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Review package details on Pricing/i })
    ).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('heading', { name: 'Plan and billing' })).toBeInTheDocument();
    expect(
      screen.getByText(/You are currently on the free trial\. Upgrade when you are ready/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Plan status').length).toBeGreaterThan(0);
    expect(screen.getByText('Trial only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade to Business' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade to Business Plus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade to Enterprise' })).toBeInTheDocument();

    expect(screen.queryByText('You are on Free Trial')).not.toBeInTheDocument();
    expect(screen.queryByText('What changes when you upgrade')).not.toBeInTheDocument();
    expect(screen.queryByText('Feature matrix')).not.toBeInTheDocument();
  });

  it('shows a clear pricing CTA instead of billing-management actions when the trial is expired', () => {
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
        trialAccess: {
          isExpired: true,
          hasRestrictedControls: true,
          message:
            'Your free trial has ended. Upgrade to keep creating, editing, and sending in this workspace. You can still review existing records and perform cleanup actions.',
        },
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
          trialEndsAt: '2026-04-01T00:00:00.000Z',
          role: 'owner',
        },
        billing: {
          providerConfigured: true,
          provider: 'razorpay',
          missingConfig: [],
          canStartCheckout: true,
          canManageSubscription: true,
          managementActions: ['cancel'],
          statusMessage:
            'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
          customerId: 'cust_123',
          subscriptionId: 'sub_123',
          subscriptionStatus: 'created',
          pendingPlan: 'business',
          billingCycle: 'annually',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          hasScheduledChange: false,
          selfServePlans: ['business', 'business_plus', 'enterprise'],
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

    render(
      <Provider store={store}>
        <SubscriptionPage />
      </Provider>
    );

    expect(
      screen.getByText(
        /Your Business checkout draft is not finished yet\. Resume checkout or switch plans\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Upgrade Plan: Trial Expired' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Resume Business checkout' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Discard checkout' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Switch to Business Plus' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Switch to Enterprise' })
    ).toBeInTheDocument();
  });

  it('reopens the pending checkout instead of starting a fresh upgrade when the continue button is clicked', async () => {
    const refresh = vi.fn();

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
        trialAccess: {
          isExpired: true,
          hasRestrictedControls: true,
          message:
            'Your free trial has ended. Upgrade to keep creating, editing, and sending in this workspace. You can still review existing records and perform cleanup actions.',
        },
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
          trialEndsAt: '2026-04-01T00:00:00.000Z',
          role: 'owner',
        },
        billing: {
          providerConfigured: true,
          provider: 'razorpay',
          missingConfig: [],
          canStartCheckout: true,
          canManageSubscription: true,
          managementActions: ['cancel'],
          statusMessage:
            'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
          customerId: 'cust_123',
          subscriptionId: 'sub_123',
          subscriptionStatus: 'created',
          pendingPlan: 'business_plus',
          billingCycle: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          hasScheduledChange: false,
          selfServePlans: ['business', 'business_plus', 'enterprise'],
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
      refresh,
    });
    mockContinuePendingSubscriptionCheckout.mockResolvedValue({
      mode: 'checkout',
      sessionId: 'sub_123',
      checkout: {
        provider: 'razorpay',
        key: 'rzp_test_123',
        subscriptionId: 'sub_123',
        name: 'Acme Workspace',
        description: 'Business Plus subscription',
        prefill: { email: 'owner@example.com' },
        notes: {},
        theme: { color: '#0f172a' },
      },
      message: null,
    });
    mockOpenSubscriptionCheckout.mockResolvedValue(null);

    render(
      <Provider store={store}>
        <SubscriptionPage />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resume Business Plus checkout' }));

    await waitFor(() => {
      expect(mockContinuePendingSubscriptionCheckout).toHaveBeenCalledTimes(1);
    });
    expect(mockStartSubscriptionCheckout).not.toHaveBeenCalled();
    expect(mockOpenSubscriptionCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub_123',
      })
    );
  });

  it('does not offer continue checkout once payment is already being confirmed', () => {
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
        trialAccess: {
          isExpired: true,
          hasRestrictedControls: true,
          message:
            'Your free trial has ended. Upgrade to keep creating, editing, and sending in this workspace. You can still review existing records and perform cleanup actions.',
        },
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
          trialEndsAt: '2026-04-01T00:00:00.000Z',
          role: 'owner',
        },
        billing: {
          providerConfigured: true,
          provider: 'razorpay',
          missingConfig: [],
          canStartCheckout: true,
          canManageSubscription: true,
          managementActions: ['cancel'],
          statusMessage:
            'Razorpay subscriptions are configured. In-app checkout, webhook sync, and in-app subscription management are available.',
          customerId: 'cust_123',
          subscriptionId: 'sub_123',
          subscriptionStatus: 'authenticated',
          pendingPlan: 'business',
          billingCycle: 'annually',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          hasScheduledChange: false,
          selfServePlans: ['business', 'business_plus', 'enterprise'],
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

    render(
      <Provider store={store}>
        <SubscriptionPage />
      </Provider>
    );

    expect(
      screen.getByText(
        /Your Business payment is being confirmed\. Activation should complete shortly\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Resume Business checkout' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clear pending billing' })
    ).toBeInTheDocument();
  });
});
