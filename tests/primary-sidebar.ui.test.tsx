// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { PrimarySidebar } from '@/components/dashboard/Sidebar';
import { store } from '@/store';
import { flushEffects, renderWithAsyncEffects } from './utils/renderWithAsyncEffects';
import { resetSessionState, setSessionUser } from './utils/sessionTestStore';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('PrimarySidebar', () => {
  it('opens profile when the account icon is clicked', async () => {
    await setSessionUser({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      orgId: null,
      orgRole: null,
    });

    const setActive = vi.fn();

    await renderWithAsyncEffects(
      <Provider store={store}>
        <PrimarySidebar active="documents" setActive={setActive} />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'My Account' }));
    await flushEffects();

    expect(setActive).toHaveBeenCalledWith('account');
    expect(pushMock).toHaveBeenCalledWith('/dashboard/account/profile');

    await resetSessionState();
  });
});
