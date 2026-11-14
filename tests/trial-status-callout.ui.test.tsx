// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TrialStatusCallout from '@/components/account/TrialStatusCallout';

describe('TrialStatusCallout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a compact upgrade CTA that links to pricing', () => {
    render(
      <TrialStatusCallout
        trialEndsAt="2026-03-24T00:00:00.000Z"
        workspaceName="Acme Workspace"
      />
    );

    const cta = screen.getByRole('link', { name: /Acme Workspace\. Upgrade Plan: 2 Days Left\./i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/pricing');
    expect(screen.getByText('Upgrade Plan: 2 Days Left')).toBeInTheDocument();
  });
});
