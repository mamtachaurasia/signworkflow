import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { User } from '@/types/types';

interface SessionState {
  isLoggedIn: boolean;
  user: User | null;
}

const initialState: SessionState = {
  isLoggedIn: false,
  user: null,
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setIsLoggedIn(state, action: PayloadAction<boolean>) {
      state.isLoggedIn = action.payload;
    },
    setUser(state, action: PayloadAction<User | null>) {
      state.user = action.payload;
    },
    resetSession(state) {
      state.isLoggedIn = false;
      state.user = null;
    },
  },
});

export const {
  setIsLoggedIn,
  setUser,
  resetSession,
} = sessionSlice.actions;

export default sessionSlice.reducer;
