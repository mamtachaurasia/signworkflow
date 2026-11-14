'use client';

import { useCallback } from 'react';
import type React from 'react';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store';
import {
  setDocuments as setDocumentsAction,
  setSelectedFile as setSelectedFileAction,
} from '@/store/slices/documentsSlice';
import {
  setIsLoggedIn as setIsLoggedInAction,
  setUser as setUserAction,
} from '@/store/slices/sessionSlice';
import {
  closeModal,
  openAuthModal,
  setSearchQuery as setSearchQueryAction,
  setSelectedCategory as setSelectedCategoryAction,
} from '@/store/slices/uiSlice';
import { dispatchStateUpdate, resolveStateUpdate } from '@/store/utils';

const useContextStore = () => {
  const dispatch = useAppDispatch();

  const documents = useAppSelector((state) => state.documents.items);
  const selectedFile = useAppSelector((state) => state.documents.selectedFile);
  const isLoggedIn = useAppSelector((state) => state.session.isLoggedIn);
  const user = useAppSelector((state) => state.session.user);
  const searchQuery = useAppSelector((state) => state.ui.searchQuery);
  const selectedCategory = useAppSelector((state) => state.ui.selectedCategory);
  const trashedTemplatesCount = useAppSelector((state) => state.templates.trashedCount);
  const showModal = useAppSelector((state) => state.ui.activeModal === 'auth');

  const setDocuments = useCallback<React.Dispatch<React.SetStateAction<typeof documents>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: RootState) => state.documents.items,
        setDocumentsAction,
        update,
      );
    },
    [dispatch],
  );

  const setSelectedFile = useCallback<
    React.Dispatch<React.SetStateAction<typeof selectedFile>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: RootState) => state.documents.selectedFile,
        setSelectedFileAction,
        update,
      );
    },
    [dispatch],
  );

  const setIsLoggedIn = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: RootState) => state.session.isLoggedIn,
        setIsLoggedInAction,
        update,
      );
    },
    [dispatch],
  );

  const setUser = useCallback<React.Dispatch<React.SetStateAction<typeof user>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: RootState) => state.session.user,
        setUserAction,
        update,
      );
    },
    [dispatch],
  );

  const setShowModal = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      const nextValue = resolveStateUpdate(showModal, update);
      dispatch(nextValue ? openAuthModal() : closeModal());
    },
    [dispatch, showModal],
  );

  const setSearchQuery = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: RootState) => state.ui.searchQuery,
        setSearchQueryAction,
        update,
      );
    },
    [dispatch],
  );

  const setSelectedCategory = useCallback<
    React.Dispatch<React.SetStateAction<string | null>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: RootState) => state.ui.selectedCategory,
        setSelectedCategoryAction,
        update,
      );
    },
    [dispatch],
  );

  return {
    selectedFile,
    setSelectedFile,
    documents,
    setDocuments,
    isLoggedIn,
    setIsLoggedIn,
    showModal,
    setShowModal,
    user,
    setUser,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    trashedTemplatesCount,
  };
};

export default useContextStore;
