import { act } from '@testing-library/react';

import { store } from '@/store';
import { resetSession, setUser } from '@/store/slices/sessionSlice';
import type { User } from '@/types/types';

export async function resetSessionState() {
  await act(async () => {
    store.dispatch(resetSession());
  });
}

export async function setSessionUser(user: User) {
  await act(async () => {
    store.dispatch(resetSession());
    store.dispatch(setUser(user));
  });
}
