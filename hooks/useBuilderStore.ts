'use client';

import { useCallback, useMemo } from 'react';
import type React from 'react';

import {
  useBuilderDispatch,
  useBuilderReduxStore,
  useBuilderSelector,
  type BuilderRootState,
} from '@/store/builderStore';
import {
  resetBuilderState,
  setAppendDocumentRequest as setAppendDocumentRequestAction,
  setBuilderDocumentId as setBuilderDocumentIdAction,
  setBuilderError as setBuilderErrorAction,
  setCanvasFields as setCanvasFieldsAction,
  setDerivedFromDocumentId as setDerivedFromDocumentIdAction,
  setDerivedFromVersion as setDerivedFromVersionAction,
  setDialogFieldId as setDialogFieldIdAction,
  setDocumentCreatedAt as setDocumentCreatedAtAction,
  setDocumentName as setDocumentNameAction,
  setDocumentShareAccess as setDocumentShareAccessAction,
  setDocumentStatus as setDocumentStatusAction,
  setDocumentUpdatedAt as setDocumentUpdatedAtAction,
  setDocumentRetention as setDocumentRetentionAction,
  setDocumentLegalHold as setDocumentLegalHoldAction,
  setDraggingComponent as setDraggingComponentAction,
  setDroppedComponents as setDroppedComponentsAction,
  setIsEditingFileName as setIsEditingFileNameAction,
  setPhotoDialog as setPhotoDialogAction,
  setPosition as setPositionAction,
  setRecipients as setRecipientsAction,
  setReplacePageRequest as setReplacePageRequestAction,
  setSelectedFieldId as setSelectedFieldIdAction,
  setShowAddRecipients as setShowAddRecipientsAction,
  setShowAuditModal as setShowAuditModalAction,
  setShowDeletedDialog as setShowDeletedDialogAction,
  setShowDeriveModal as setShowDeriveModalAction,
  setShowSaveAsTemplate as setShowSaveAsTemplateAction,
  setShowSendDocument as setShowSendDocumentAction,
  setShowVoidModal as setShowVoidModalAction,
  setSigningEvents as setSigningEventsAction,
  sanitizeDroppedComponents,
} from '@/store/slices/builderSlice';
import { dispatchStateUpdate, resolveStateUpdate } from '@/store/utils';

export function useBuilderStore() {
  const dispatch = useBuilderDispatch();
  const store = useBuilderReduxStore();
  const builder = useBuilderSelector((state) => state.builder);

  const selectedField = useMemo(
    () =>
      builder.droppedComponents.find((component) => component.id === builder.selectedFieldId) ??
      null,
    [builder.droppedComponents, builder.selectedFieldId],
  );

  const selectedFieldForDialog = useMemo(
    () =>
      builder.droppedComponents.find((component) => component.id === builder.dialogFieldId) ?? null,
    [builder.dialogFieldId, builder.droppedComponents],
  );

  const setDroppedComponents = useCallback<
    React.Dispatch<React.SetStateAction<typeof builder.droppedComponents>>
  >(
    (update) => {
      const currentDroppedComponents = store.getState().builder.droppedComponents;
      const nextDroppedComponents = resolveStateUpdate(currentDroppedComponents, update);
      dispatch(setDroppedComponentsAction(sanitizeDroppedComponents(nextDroppedComponents)));
    },
    [dispatch, store],
  );

  const setRecipients = useCallback<
    React.Dispatch<React.SetStateAction<typeof builder.recipients>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.recipients,
        setRecipientsAction,
        update,
      );
    },
    [dispatch],
  );

  const setDraggingComponent = useCallback<
    React.Dispatch<React.SetStateAction<typeof builder.draggingComponent>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.draggingComponent,
        setDraggingComponentAction,
        update,
      );
    },
    [dispatch],
  );

  const setPosition = useCallback<
    React.Dispatch<React.SetStateAction<typeof builder.position>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.position,
        setPositionAction,
        update,
      );
    },
    [dispatch],
  );

  const setError = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.error,
        setBuilderErrorAction,
        update,
      );
    },
    [dispatch],
  );

  const setPhotoDialog = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.photoDialog,
        setPhotoDialogAction,
        update,
      );
    },
    [dispatch],
  );

  const setCanvasFields = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.canvasFields,
        setCanvasFieldsAction,
        update,
      );
    },
    [dispatch],
  );

  const setShowDeletedDialog = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.showDeletedDialog,
        setShowDeletedDialogAction,
        update,
      );
    },
    [dispatch],
  );

  const setSelectedFieldId = useCallback<
    React.Dispatch<React.SetStateAction<number | null>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.selectedFieldId,
        setSelectedFieldIdAction,
        update,
      );
    },
    [dispatch],
  );

  const setSelectedFieldForDialog = useCallback<
    React.Dispatch<React.SetStateAction<typeof selectedFieldForDialog>>
  >(
    (update) => {
      const currentBuilder = store.getState().builder;
      const currentSelectedFieldForDialog =
        currentBuilder.droppedComponents.find(
          (component) => component.id === currentBuilder.dialogFieldId,
        ) ?? null;
      const nextValue = resolveStateUpdate(currentSelectedFieldForDialog, update);
      dispatch(setDialogFieldIdAction(nextValue?.id ?? null));
    },
    [dispatch, store],
  );

  const setDocumentName = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.documentName,
        setDocumentNameAction,
        update,
      );
    },
    [dispatch],
  );

  const setIsEditingFileName = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.isEditingFileName,
        setIsEditingFileNameAction,
        update,
      );
    },
    [dispatch],
  );

  const setDocumentStatus = useCallback<
    React.Dispatch<React.SetStateAction<string | null>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.documentStatus,
        setDocumentStatusAction,
        update,
      );
    },
    [dispatch],
  );

  const setDocumentShareAccess = useCallback<
    React.Dispatch<React.SetStateAction<typeof builder.documentShareAccess>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.documentShareAccess,
        setDocumentShareAccessAction,
        update,
      );
    },
    [dispatch],
  );

  const setDocumentCreatedAt = useCallback<
    React.Dispatch<React.SetStateAction<string | null>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.documentCreatedAt,
        setDocumentCreatedAtAction,
        update,
      );
    },
    [dispatch],
  );

  const setDocumentUpdatedAt = useCallback<
    React.Dispatch<React.SetStateAction<string | null>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.documentUpdatedAt,
        setDocumentUpdatedAtAction,
        update,
      );
    },
    [dispatch],
  );

  const setDocumentRetention = useCallback<
    React.Dispatch<React.SetStateAction<BuilderRootState['builder']['documentRetention']>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.documentRetention,
        setDocumentRetentionAction,
        update,
      );
    },
    [dispatch],
  );

  const setDocumentLegalHold = useCallback<
    React.Dispatch<React.SetStateAction<BuilderRootState['builder']['documentLegalHold']>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.documentLegalHold,
        setDocumentLegalHoldAction,
        update,
      );
    },
    [dispatch],
  );

  const setDerivedFromDocumentId = useCallback<
    React.Dispatch<React.SetStateAction<string | null>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.derivedFromDocumentId,
        setDerivedFromDocumentIdAction,
        update,
      );
    },
    [dispatch],
  );

  const setDerivedFromVersion = useCallback<
    React.Dispatch<React.SetStateAction<number | null>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.derivedFromVersion,
        setDerivedFromVersionAction,
        update,
      );
    },
    [dispatch],
  );

  const setSigningEvents = useCallback<
    React.Dispatch<React.SetStateAction<typeof builder.signingEvents>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.signingEvents,
        setSigningEventsAction,
        update,
      );
    },
    [dispatch],
  );

  const setShowAuditModal = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.showAuditModal,
        setShowAuditModalAction,
        update,
      );
    },
    [dispatch],
  );

  const setShowDeriveModal = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.showDeriveModal,
        setShowDeriveModalAction,
        update,
      );
    },
    [dispatch],
  );

  const setShowVoidModal = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.showVoidModal,
        setShowVoidModalAction,
        update,
      );
    },
    [dispatch],
  );

  const setReplacePageRequest = useCallback<
    React.Dispatch<React.SetStateAction<typeof builder.replacePageRequest>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.replacePageRequest,
        setReplacePageRequestAction,
        update,
      );
    },
    [dispatch],
  );

  const setAppendDocumentRequest = useCallback<
    React.Dispatch<React.SetStateAction<typeof builder.appendDocumentRequest>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.appendDocumentRequest,
        setAppendDocumentRequestAction,
        update,
      );
    },
    [dispatch],
  );

  const setShowAddRecipients = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.showAddRecipients,
        setShowAddRecipientsAction,
        update,
      );
    },
    [dispatch],
  );

  const setShowSaveAsTemplate = useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.showSaveAsTemplate,
        setShowSaveAsTemplateAction,
        update,
      );
    },
    [dispatch],
  );

  const setShowSendDocument = useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.showSendDocument,
        setShowSendDocumentAction,
        update,
      );
    },
    [dispatch],
  );

  const setDocumentId = useCallback<
    React.Dispatch<React.SetStateAction<string | null>>
  >(
    (update) => {
      dispatchStateUpdate(
        dispatch,
        (state: BuilderRootState) => state.builder.documentId,
        setBuilderDocumentIdAction,
        update,
      );
    },
    [dispatch],
  );

  const clearBuilderState = useCallback(() => {
    dispatch(resetBuilderState());
  }, [dispatch]);

  return {
    ...builder,
    selectedField,
    selectedFieldForDialog,
    setDroppedComponents,
    setRecipients,
    setDraggingComponent,
    setPosition,
    setError,
    setPhotoDialog,
    setCanvasFields,
    setShowDeletedDialog,
    setSelectedFieldId,
    setSelectedFieldForDialog,
    setDocumentName,
    setIsEditingFileName,
    setDocumentStatus,
    setDocumentShareAccess,
    setDocumentCreatedAt,
    setDocumentUpdatedAt,
    setDocumentRetention,
    setDocumentLegalHold,
    setDerivedFromDocumentId,
    setDerivedFromVersion,
    setSigningEvents,
    setShowAuditModal,
    setShowDeriveModal,
    setShowVoidModal,
    setReplacePageRequest,
    setAppendDocumentRequest,
    setShowAddRecipients,
    setShowSaveAsTemplate,
    setShowSendDocument,
    setDocumentId,
    clearBuilderState,
  };
}
