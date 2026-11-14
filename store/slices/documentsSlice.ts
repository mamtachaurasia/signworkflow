import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Doc } from '@/types/types';

interface DocumentsState {
  items: Doc[];
  selectedFile: Doc | File | string | null;
}

const initialState: DocumentsState = {
  items: [],
  selectedFile: null,
};

const documentsSlice = createSlice({
  name: 'documents',
  initialState,
  reducers: {
    setDocuments(state, action: PayloadAction<Doc[]>) {
      state.items = action.payload;
    },
    setSelectedFile(state, action: PayloadAction<Doc | File | string | null>) {
      state.selectedFile = action.payload;
    },
  },
});

export const {
  setDocuments,
  setSelectedFile,
} = documentsSlice.actions;

export default documentsSlice.reducer;
