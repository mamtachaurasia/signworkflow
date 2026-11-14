import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Contact } from '@/types/types';

interface ContactsState {
  items: Contact[];
  loading: boolean;
  error: string | null;
}

const initialState: ContactsState = {
  items: [],
  loading: true,
  error: null,
};

const contactsSlice = createSlice({
  name: 'contacts',
  initialState,
  reducers: {
    setContactsLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setContactsError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setContacts(state, action: PayloadAction<Contact[]>) {
      state.items = action.payload;
    },
    addContact(state, action: PayloadAction<Contact>) {
      state.items.unshift(action.payload);
    },
    updateContact(state, action: PayloadAction<Contact>) {
      state.items = state.items.map((contact) =>
        contact._id === action.payload._id ? action.payload : contact,
      );
    },
  },
});

export const {
  setContactsLoading,
  setContactsError,
  setContacts,
  addContact,
  updateContact,
} = contactsSlice.actions;

export default contactsSlice.reducer;
