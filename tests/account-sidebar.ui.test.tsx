// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PERSONAL_WORKSPACE_BANNER_TITLE } from '@/components/account/PersonalWorkspaceBanner';
import AccountSidebar from '@/components/builder/MyAccountNav';
import { store } from '@/store';
import { resetSession, setUser } from '@/store/slices/sessionSlice';
import { flushEffects, renderWithAsyncEffects } from './utils/renderWithAsyncEffects';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('AccountSidebar', () => {
  beforeEach(() => {
    pushMock.mockReset();
    store.dispatch(resetSession());
  });

  it('disables workspace-only sections when the user has no active workspace access', async () => {
    store.dispatch(
      setUser({
        id: 'user-1',
        email: 'user@example.com',
        role: 'user',
        orgId: undefined,
        orgRole: null,
      })
    );

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AccountSidebar active="workspace-access" onChange={vi.fn()} />
      </Provider>
    );

    expect(screen.queryByText(PERSONAL_WORKSPACE_BANNER_TITLE)).not.toBeInTheDocument();

    const profileButton = screen.getByRole('button', { name: 'User Profile' });
    const organizationsButton = screen.getByRole('button', { name: 'My Workspaces' });
    const teamsButton = screen.getByRole('button', { name: /My Teams/i });
    const auditButton = screen.getByRole('button', { name: /Audit Trail/i });

    expect(profileButton).toBeEnabled();
    expect(organizationsButton).toBeEnabled();
    expect(teamsButton).toBeDisabled();
    expect(auditButton).toBeDisabled();
    expect(screen.queryByText('Requires workspace')).not.toBeInTheDocument();

    fireEvent.mouseEnter(teamsButton.parentElement as HTMLElement);
    await flushEffects();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Requires workspace');
    expect(screen.getByRole('tooltip')).toHaveTextContent('My Teams requires active workspace access.');

    fireEvent.mouseLeave(teamsButton.parentElement as HTMLElement);
    await flushEffects();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.mouseEnter(auditButton.parentElement as HTMLElement);
    await flushEffects();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Requires workspace');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Audit Trail requires active workspace access.');
  }, 20000);
});
