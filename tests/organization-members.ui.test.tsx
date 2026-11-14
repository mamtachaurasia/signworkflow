// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';

import WorkspaceMembersPage from '@/app/account/workspace/members/page';
import { getOrganizationPlanLabel } from '@/lib/pricing';
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

describe('WorkspaceMembersPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Insufficient permissions to view members.' }),
      })
    );
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

  it('shows the permission message inline without raising a toast', async () => {
    await renderWithAsyncEffects(
      <Provider store={store}>
        <WorkspaceMembersPage />
      </Provider>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Only owners, admins, and auditors can view workspace members.')
      ).toBeInTheDocument();
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('renders a row-level role dropdown for owners in the member list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          organization: {
            id: 'org-1',
            name: 'Acme Org',
            slug: 'acme-org',
            plan: 'pro',
            status: 'active',
            seatLimit: 10,
          },
          orgRole: 'owner',
          members: [
            {
              userId: 'member-1',
              name: 'Member One',
              email: 'member@example.com',
              role: 'admin',
              status: 'active',
              teams: [{ id: 'team-1', name: 'Approvals' }],
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z',
            },
          ],
        }),
      })
    );
    await setSessionUser({
      id: 'owner-1',
      email: 'owner@example.com',
      role: 'owner',
      orgId: 'org-1',
      orgRole: 'owner',
    });

    const { container } = await renderWithAsyncEffects(
      <Provider store={store}>
        <WorkspaceMembersPage />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Member One')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'Status shows workspace access. Team membership is listed separately, so removing someone from a team does not change their workspace status.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Plan: ${getOrganizationPlanLabel('pro')}`))
    ).toBeInTheDocument();
    expect(screen.getByText('Approvals')).toBeInTheDocument();

    const roleDropdowns = screen.getAllByRole('combobox');
    expect(roleDropdowns).toHaveLength(2);

    const memberRoleSelects = container.querySelectorAll('select');
    expect(memberRoleSelects).toHaveLength(2);

    const memberRoleDropdown = memberRoleSelects[1] as HTMLSelectElement;
    const saveButtons = screen.getAllByRole('button', { name: 'Save role' });
    expect(saveButtons[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disable access' })).toBeInTheDocument();

    fireEvent.change(memberRoleDropdown, { target: { value: 'user' } });
    await flushEffects();

    await waitFor(() => {
      expect(saveButtons[0]).toBeEnabled();
    });
  });

  it('shows a remove-from-organization action for disabled members', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          organization: {
            id: 'org-1',
            name: 'Acme Org',
            slug: 'acme-org',
            plan: 'pro',
            status: 'active',
            seatLimit: 10,
          },
          orgRole: 'owner',
          members: [
            {
              userId: 'member-2',
              name: 'Former Member',
              email: 'former@example.com',
              role: 'user',
              status: 'disabled',
              teams: [],
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-02T00:00:00.000Z',
            },
          ],
        }),
      })
    );
    await setSessionUser({
      id: 'owner-1',
      email: 'owner@example.com',
      role: 'owner',
      orgId: 'org-1',
      orgRole: 'owner',
    });

    await renderWithAsyncEffects(
      <Provider store={store}>
        <WorkspaceMembersPage />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Former Member')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove from workspace' }));
    await flushEffects();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'Remove Former Member from the workspace? This removes their workspace membership and all team assignments for this workspace. Their account is not deleted from the platform.'
    );
    expect(within(dialog).getByRole('button', { name: 'Remove from workspace' })).toBeInTheDocument();
  });
});
