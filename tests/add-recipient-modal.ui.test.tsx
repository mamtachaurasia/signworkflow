// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';

import AddRecipientModal from '@/components/builder/AddRecipientModal';
import { store } from '@/store';
import type { Recipient } from '@/types/types';
import { flushEffects, renderWithAsyncEffects } from './utils/renderWithAsyncEffects';
import { resetSessionState, setSessionUser } from './utils/sessionTestStore';

const recipients: Recipient[] = [
  {
    id: 'recipient-1',
    email: '',
    name: 'Recipient 1',
    role: 'signer',
    color: '#3B82F6',
    order: 1,
    isCC: false,
    totalFields: 0,
    status: 'pending',
  },
];

describe('AddRecipientModal', () => {
  beforeEach(() => {
    return resetSessionState();
  });

  afterEach(() => {
    void resetSessionState();
    vi.restoreAllMocks();
  });

  it('saves reusable template roles without requiring an email address', async () => {
    await setSessionUser({
      id: 'owner-1',
      email: 'owner@example.com',
      role: 'owner',
      orgId: 'org-1',
      orgRole: 'owner',
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onRecipientsChange = vi.fn();
    const onClose = vi.fn();

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AddRecipientModal
          isOpen
          isTemplateRoleMode
          onClose={onClose}
          recipients={[{ ...recipients[0], name: 'Client' }]}
          onRecipientsChange={onRecipientsChange}
        />
      </Provider>
    );

    expect(screen.getByText('Template roles (1)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Role label/)).toHaveValue('Client');
    expect(screen.getByLabelText(/Default email/)).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Add from team' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add CC Recipients' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }));

    expect(onRecipientsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Client',
        email: '',
      }),
    ]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('still requires email addresses for actual document recipients', async () => {
    await setSessionUser({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      orgId: null,
      orgRole: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ contacts: [] }),
      })
    );
    const onRecipientsChange = vi.fn();

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AddRecipientModal
          isOpen
          onClose={vi.fn()}
          recipients={recipients}
          onRecipientsChange={onRecipientsChange}
        />
      </Provider>
    );

    expect(screen.getByRole('combobox', { name: /Email address for Recipient 1/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save and Continue' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
    });
    expect(onRecipientsChange).not.toHaveBeenCalled();
  });

  it('requires unique labels for reusable template roles', async () => {
    await setSessionUser({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      orgId: null,
      orgRole: null,
    });

    vi.stubGlobal('fetch', vi.fn());
    const onRecipientsChange = vi.fn();

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AddRecipientModal
          isOpen
          isTemplateRoleMode
          onClose={vi.fn()}
          recipients={[
            { ...recipients[0], id: 'role-1', name: 'Client', order: 1 },
            { ...recipients[0], id: 'role-2', name: 'client', order: 2 },
          ]}
          onRecipientsChange={onRecipientsChange}
        />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }));

    await waitFor(() => {
      expect(screen.getAllByText('Role labels must be unique')).toHaveLength(2);
    });
    expect(onRecipientsChange).not.toHaveBeenCalled();
  });

  it('does not show team recipient controls for personal users', async () => {
    await setSessionUser({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      orgId: null,
      orgRole: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ contacts: [] }),
      })
    );

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AddRecipientModal
          isOpen
          onClose={vi.fn()}
          recipients={recipients}
          onRecipientsChange={vi.fn()}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Recipient' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Add from team' })).not.toBeInTheDocument();
    expect(screen.queryByText('Add recipients from a team')).not.toBeInTheDocument();
  });

  it('selects a prepopulated contact email from the email dropdown', async () => {
    await setSessionUser({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      orgId: null,
      orgRole: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          contacts: [
            {
              _id: 'contact-1',
              firstName: 'Asha',
              lastName: 'Rao',
              email: 'asha@example.com',
              userId: 'user-1',
            },
          ],
        }),
      })
    );

    const onRecipientsChange = vi.fn();

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AddRecipientModal
          isOpen
          onClose={vi.fn()}
          recipients={recipients}
          onRecipientsChange={onRecipientsChange}
        />
      </Provider>
    );

    const emailInput = screen.getByRole('combobox');
    fireEvent.focus(emailInput);
    fireEvent.change(emailInput, { target: { value: 'asha' } });

    await screen.findByText('asha@example.com');
    fireEvent.click(screen.getByRole('option', { name: /Asha Rao asha@example.com/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Asha Rao').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save and Continue' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(onRecipientsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        email: 'asha@example.com',
        name: 'Asha Rao',
      }),
    ]);
  });

  it('keeps team recipient controls collapsed until requested for org users', async () => {
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
            teams: [
              {
                id: 'team-1',
                name: 'Sales',
                memberCount: 2,
                members: [
                  {
                    userId: 'member-1',
                    name: 'Member One',
                    email: 'member1@example.com',
                    role: 'user',
                    status: 'active',
                  },
                ],
              },
            ],
          }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ contacts: [] }),
      } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    await renderWithAsyncEffects(
      <Provider store={store}>
        <AddRecipientModal
          isOpen
          onClose={vi.fn()}
          recipients={recipients}
          onRecipientsChange={vi.fn()}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add from team' })).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Team')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Recipient' })).toBeInTheDocument();
    expect(screen.getByText('Recipient 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add from team' }));
    await flushEffects();

    expect(screen.getByText('Add recipients from a team')).toBeInTheDocument();
    expect(screen.getByLabelText('Team')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide team picker' })).toBeInTheDocument();
  });
});
