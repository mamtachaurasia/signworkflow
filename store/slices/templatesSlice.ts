import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { Template } from '@/types/templates';

interface TemplatesState {
  items: Template[];
  loading: boolean;
  error: string | null;
  trashedCount: number;
}

const initialState: TemplatesState = {
  items: [],
  loading: false,
  error: null,
  trashedCount: 0,
};

const templatesSlice = createSlice({
  name: 'templates',
  initialState,
  reducers: {
    setTemplatesLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setTemplatesError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setTemplates(state, action: PayloadAction<Template[]>) {
      state.items = action.payload;
    },
    upsertTemplate(state, action: PayloadAction<Template>) {
      const index = state.items.findIndex((template) => template._id === action.payload._id);
      if (index === -1) {
        state.items.push(action.payload);
        return;
      }

      state.items[index] = action.payload;
    },
    setTrashedTemplatesCount(state, action: PayloadAction<number>) {
      state.trashedCount = action.payload;
    },
  },
});

export const {
  setTemplatesLoading,
  setTemplatesError,
  setTemplates,
  upsertTemplate,
  setTrashedTemplatesCount,
} = templatesSlice.actions;

export default templatesSlice.reducer;
