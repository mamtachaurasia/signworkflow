// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardHeader from '@/components/dashboard/DashboardHeader';

vi.mock('@/components/UserDropdown', () => ({
  default: () => <div data-testid="user-dropdown" />,
}));

vi.mock('@/components/dashboard/NotificationBell', () => ({
  default: () => <button type="button" aria-label="Notifications" />,
}));

describe('DashboardHeader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the trial upgrade CTA in place of Select Plan when trial is active', () => {
    render(
      <DashboardHeader
        showTrialUpgrade
        showTrialOnly
        trialEndsAt="2026-03-24T00:00:00.000Z"
        workspaceName="Acme Workspace"
      />
    );

    expect(screen.getByRole('link', { name: /Upgrade Plan: 2 Days Left/i })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.queryByRole('link', { name: 'Select Plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contact Sales' })).not.toBeInTheDocument();
  });

  it('links Contact Sales to the contact page when the full header is shown', () => {
    render(<DashboardHeader />);

    expect(screen.getByRole('link', { name: 'Contact Sales' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'Select Plan' })).toHaveAttribute('href', '/pricing');
  });
});
