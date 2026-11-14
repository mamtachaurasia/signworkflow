import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type ActiveModal = 'auth' | 'contact' | null;

interface UiState {
  activeModal: ActiveModal;
  searchQuery: string;
  selectedCategory: string | null;
}

const initialState: UiState = {
  activeModal: null,
  searchQuery: '',
  selectedCategory: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openAuthModal(state) {
      state.activeModal = 'auth';
    },
    openContactModal(state) {
      state.activeModal = 'contact';
    },
    closeModal(state) {
      state.activeModal = null;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setSelectedCategory(state, action: PayloadAction<string | null>) {
      state.selectedCategory = action.payload;
    },
  },
});

export const {
  openAuthModal,
  openContactModal,
  closeModal,
  setSearchQuery,
  setSelectedCategory,
} = uiSlice.actions;

export default uiSlice.reducer;
