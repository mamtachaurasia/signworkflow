// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PersonalWorkspaceBanner, {
  PERSONAL_WORKSPACE_BANNER_MESSAGE,
  PERSONAL_WORKSPACE_BANNER_SUBTITLE,
  PERSONAL_WORKSPACE_BANNER_TITLE,
} from '@/components/account/PersonalWorkspaceBanner';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('PersonalWorkspaceBanner', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('renders the shared trial-workspace copy and primary actions', () => {
    render(<PersonalWorkspaceBanner />);

    expect(screen.getByText(PERSONAL_WORKSPACE_BANNER_TITLE)).toBeInTheDocument();
    expect(screen.getByText(PERSONAL_WORKSPACE_BANNER_SUBTITLE)).toBeInTheDocument();
    expect(screen.getByText(PERSONAL_WORKSPACE_BANNER_MESSAGE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Subscription' }));
    expect(pushMock).toHaveBeenCalledWith('/dashboard/account/subscription');

    fireEvent.click(screen.getByRole('button', { name: 'My Workspaces' }));
    expect(pushMock).toHaveBeenCalledWith('/dashboard/account/workspace');
  });
});
