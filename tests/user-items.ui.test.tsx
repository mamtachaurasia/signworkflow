// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import UserItems from '../components/builder/UserItems';
import type { User } from '../types/types';

const mocks = vi.hoisted(() => ({
  currentUser: null as User | null,
  setUser: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('@/hooks/useContextStore', () => ({
  default: () => ({
    user: mocks.currentUser,
    setUser: mocks.setUser,
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    patch: mocks.patch,
  },
}));

describe('UserItems', () => {
  beforeEach(() => {
    mocks.currentUser = {
      id: 'user-1',
      name: 'Raj Contract',
      email: 'raj@example.com',
      signatures: [
        { id: 'sig-1', value: 'Raj', type: 'typed', isDefault: true },
      ],
      initials: [],
      stamps: [],
    } as User;
    mocks.setUser.mockReset();
    mocks.setUser.mockImplementation((nextUser: User | null) => {
      mocks.currentUser = nextUser;
    });
    mocks.patch.mockReset();
    mocks.patch.mockImplementation(async (_url: string, payload: Partial<User>) => ({
      user: { ...mocks.currentUser, ...payload },
    }));
  });

  it('marks an uploaded signature as default when requested', async () => {
    render(
      <UserItems
        type="Signature"
        onClose={() => {}}
        onAdd={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add new signature/i }));
    fireEvent.click(screen.getByLabelText(/make this default/i));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['signature'], 'signature.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());

    expect(mocks.patch).toHaveBeenCalledWith(
      '/user/profile',
      expect.objectContaining({
        signatures: [
          expect.objectContaining({ id: 'sig-1', isDefault: false }),
          expect.objectContaining({ type: 'drawn', isDefault: true }),
        ],
      })
    );
  });

  it('saves default changes from the signature menu', async () => {
    mocks.currentUser = {
      ...mocks.currentUser!,
      signatures: [
        { id: 'sig-1', value: 'Raj', type: 'typed', isDefault: true },
        { id: 'sig-2', value: 'RC', type: 'typed', isDefault: false },
      ],
    };

    render(
      <UserItems
        type="Signature"
        onClose={() => {}}
        onAdd={() => {}}
      />
    );

    const menuButtons = screen.getAllByText('⋮');
    fireEvent.click(menuButtons[1]);
    fireEvent.click(screen.getByRole('button', { name: /make default/i }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());

    expect(mocks.patch).toHaveBeenCalledWith('/user/profile', {
      signatures: [
        expect.objectContaining({ id: 'sig-1', isDefault: false }),
        expect.objectContaining({ id: 'sig-2', isDefault: true }),
      ],
    });
  });

  it('promotes the remaining item when deleting the default signature', async () => {
    mocks.currentUser = {
      ...mocks.currentUser!,
      signatures: [
        { id: 'sig-1', value: 'Raj', type: 'typed', isDefault: true },
        { id: 'sig-2', value: 'RC', type: 'typed', isDefault: false },
      ],
    };

    render(
      <UserItems
        type="Signature"
        onClose={() => {}}
        onAdd={() => {}}
      />
    );

    const menuButtons = screen.getAllByText('⋮');
    fireEvent.click(menuButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());

    expect(mocks.patch).toHaveBeenCalledWith('/user/profile', {
      signatures: [expect.objectContaining({ id: 'sig-2', isDefault: true })],
    });
  });
});
