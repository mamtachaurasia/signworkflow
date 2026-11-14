// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';

import MyTeams from '@/app/account/myTeams/page';
import { store } from '@/store';
import toast from 'react-hot-toast';
import { flushEffects, renderWithAsyncEffects } from './utils/renderWithAsyncEffects';
import { resetSessionState, setSessionUser } from './utils/sessionTestStore';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('orgId=org-1'),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('MyTeams', () => {
  beforeEach(() => {
    return setSessionUser({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      orgId: 'org-1',
      orgRole: 'user',
    });
  });

  afterEach(() => {
    void resetSessionState();
    vi.restoreAllMocks();
  });

  it('shows a local helper next to the disabled button instead of toasting when members are not viewable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/orgs/teams')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orgRole: 'user',
            teams: [],
          }),
        } as Response;
      }

      return {
        ok: false,
        status: 500,
        json: async () => ({ message: 'Unexpected request' }),
      } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    await renderWithAsyncEffects(
      <Provider store={store}>
        <MyTeams />
      </Provider>
    );

    await waitFor(() => {
      expect(
        screen.getAllByText(
          'Only owners, admins, and auditors can view the workspace member directory.'
        ).length
      ).toBeGreaterThan(0);
    });

    expect(
      screen.getByText('You have read-only access. Only owners and admins can create teams or change memberships.')
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/orgs/teams');
    expect(screen.getByRole('button', { name: 'Manage workspace members' })).toBeDisabled();
  });

  it('uses the shared modal to confirm team member removal', async () => {
    await setSessionUser({
      id: 'owner-1',
      email: 'owner@example.com',
      role: 'owner',
      orgId: 'org-1',
      orgRole: 'owner',
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/orgs/teams')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orgRole: 'owner',
            teams: [
              {
                id: 'team-1',
                name: 'my e-sign team',
                description: 'Handles agreements',
                memberCount: 1,
                members: [
                  {
                    userId: 'user-2',
                    name: 'Rajesh Chaurasia',
                    email: 'rajesh@example.com',
                    role: 'user',
                    status: 'active',
                  },
                ],
              },
            ],
          }),
        } as Response;
      }

      if (url.includes('/api/orgs/members')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orgRole: 'owner',
            members: [],
          }),
        } as Response;
      }

      return {
        ok: false,
        status: 500,
        json: async () => ({ message: 'Unexpected request' }),
      } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    await renderWithAsyncEffects(
      <Provider store={store}>
        <MyTeams />
      </Provider>
    );

    const removeButtons = await screen.findAllByRole('button', { name: 'Remove from team' });
    fireEvent.click(removeButtons[0]);
    await flushEffects();

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'Remove Rajesh Chaurasia from my e-sign team? They will stay in the workspace and can be added back later.'
    );
    expect(within(dialog).getByRole('button', { name: 'Keep member' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove from team' })).toBeInTheDocument();
  });

  it('uses the shared modal to confirm team deletion', async () => {
    await setSessionUser({
      id: 'owner-1',
      email: 'owner@example.com',
      role: 'owner',
      orgId: 'org-1',
      orgRole: 'owner',
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/orgs/teams')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orgRole: 'owner',
            teams: [
              {
                id: 'team-1',
                name: 'my e-sign team',
                description: 'Handles agreements',
                memberCount: 0,
                members: [],
              },
            ],
          }),
        } as Response;
      }

      if (url.includes('/api/orgs/members')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orgRole: 'owner',
            members: [],
          }),
        } as Response;
      }

      return {
        ok: false,
        status: 500,
        json: async () => ({ message: 'Unexpected request' }),
      } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    await renderWithAsyncEffects(
      <Provider store={store}>
        <MyTeams />
      </Provider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Delete team' }));
    await flushEffects();

    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Delete my e-sign team? This will remove all team assignments.');
    expect(within(dialog).getByRole('button', { name: 'Keep team' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete team' })).toBeInTheDocument();
  });
});
