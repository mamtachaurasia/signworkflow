"use client";
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { PDFDocument } from 'pdf-lib';
import dynamic from 'next/dynamic';
import type { RichTextEditorHandle } from '@/components/editor/RichTextEditor';

// Project utils & types
import { DroppedComponent, Recipient, DocumentField, Doc } from '@/types/types';


// Components
import useContextStore from '@/hooks/useContextStore';
import { Modal } from '@ui';
import ActionToolBar from '@/components/builder/ActionToolBar';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSignatureInitial } from '@/hooks/builder/useSignatureInitial';
import DocumentStatusBars from './DocumentStatusBars';
import DocumentSendConfirmationModal from './DocumentSendConfirmationModal';
import DocumentActionModals from './DocumentActionModals';
import EditorWorkspace from './EditorWorkspace';
import SaveAsTemplateGate from './SaveAsTemplateGate';
import { usePdfState } from '@/hooks/builder/usePdfState';
import { useFieldInteractions } from '@/hooks/builder/useFieldInteractions';
import { useDocumentSave } from '@/hooks/builder/useDocumentSave';
import { useDocumentActions } from '@/hooks/builder/useDocumentActions';
import {
  useBuilderResourceReset,
  useDocumentBuilderPropHydration,
  useDocumentLoader,
  useTemplateEditorPropHydration,
} from '@/hooks/builder/useDocumentLoader';
import { useDocumentDraft } from '@/hooks/builder/useDocumentDraft';
import { useSendFlow } from '@/hooks/builder/useSendFlow';
import { useDroppedComponentsState } from '@/hooks/builder/useDroppedComponentsState';
import { useUndoRedoControls } from '@/hooks/builder/useUndoRedoControls';
import { useFieldUpdates } from '@/hooks/builder/useFieldUpdates';
import { useDocumentStatusFlags } from '@/hooks/builder/useDocumentStatusFlags';
import { useSenderPreview } from '@/hooks/builder/useSenderPreview';
import { useBuilderStore } from '@/hooks/useBuilderStore';
import SenderPreviewModal from './SenderPreviewModal';
import { dedupeFieldsById, mapFieldToDroppedComponent } from '@/utils/builder/documentFields';
import { useUserSettings } from '@/hooks/useUserSettings';
import { buildImportedPageFields, buildReplacementPageFields } from '@/utils/builder/importPageFields';
import { validateFieldValue, getEffectiveFieldValue } from '@/lib/field-rules';
import { AUTH_SESSION_EXPIRED_EVENT, type AuthSessionExpiredEventDetail } from '@/lib/auth-events';
import toast from 'react-hot-toast';
import { usePageOperations } from '@/hooks/builder/usePageOperations';
import { PAGE_VERTICAL_SPACING } from '@/utils/builder/constants';
import { estimateAutoFieldDimensions, fitFieldWithinPageBounds, type PageBounds } from '@/utils/builder/fieldLayout';
import { buildRepeatedFieldsForPages } from '@/utils/builder/repeatFields';
import { BuilderStoreProvider } from '@/store/builderStore';
import { serializeDroppedComponentToField } from '@/lib/api';
import TemplateVariablesPanel, {
  type TemplateVariableApplyResult,
  type TemplateVariableStatus,
} from './TemplateVariablesPanel';
const LoginPage = dynamic(() => import('@/app/login/page'), { ssr: false });
const AddPageMenu = dynamic(() => import('@/components/builder/AddPageMenu'), { ssr: false });
const PageThumbnailMenu = dynamic(() => import('@/components/builder/PageThumbnailMenu'), { ssr: false });
const ReplacePageDialog = dynamic(() => import('@/components/builder/ReplacePageDialog'), { ssr: false });
const DeletedDocumentDialog = dynamic(() => import('./DeletedDocumentDialog'), { ssr: false });
const AIAssistantPanel = dynamic(() => import('@/components/ai/AIAssistantPanel'), { ssr: false });

export interface EditorProps {
  // Prefer resourceId going forward, but keep documentId for backward compatibility
  resourceId?: string | null;
  documentId?: string | null;
  initialFileUrl?: string | null;
  initialResourceName?: string | null;
  initialFields?: DocumentField[] | null;
  initialRecipients?: Recipient[] | null;
  isSigningMode?: boolean;
  isSigned?: boolean;
  onPageChange?: (page: number) => void;
  onNumPagesChange?: (numPages: number) => void;
  onSignedSaveDocument?: (saveFn: () => Promise<void>) => void;
  signingToken?: string;
  currentRecipientId?: string;
  onFieldsChange?: (fields: DocumentField[]) => void;
  isTemplateEditor?: boolean; // New prop to differentiate
  templateNavigation?: React.ReactNode;
  templateFieldReviewRequired?: boolean;
  onTemplateSaved?: () => Promise<void> | void;
  guidedFieldId?: string | null;
  guidedBadgeLabel?: 'Sign here' | 'Review';
  isPreviewOnly?: boolean;
  aiAssistantOpen?: boolean;
  onAIAssistantOpenChange?: (open: boolean) => void;
  aiAssistantRequestedTab?: 'summary' | 'translate' | 'explain' | 'risk';
  aiAssistantRequestKey?: number;
}

const DocumentEditorInner: React.FC<EditorProps> = ({
  resourceId,
  documentId: documentIdProp,
  initialFileUrl = null,
  initialResourceName: initialDocumentName = null,
  initialFields = null,
  initialRecipients = null,
  isSigningMode = false,
  isSigned = false,
  onPageChange,
  onNumPagesChange,
  onSignedSaveDocument,
  signingToken,
  currentRecipientId,
  onFieldsChange,
  isTemplateEditor = false,
  templateNavigation,
  templateFieldReviewRequired = false,
  onTemplateSaved,
  guidedFieldId,
  guidedBadgeLabel,
  isPreviewOnly = false,
  aiAssistantOpen,
  onAIAssistantOpenChange,
  aiAssistantRequestedTab,
  aiAssistantRequestKey,
}) => {
  // Support both legacy documentId prop and new resourceId prop
  const propDocumentId = resourceId ?? documentIdProp ?? null;
  const [variablesPanelOpen, setVariablesPanelOpen] = useState(false);
  const [templateVariableStatus, setTemplateVariableStatus] = useState<TemplateVariableStatus>({ available: false, loading: Boolean(propDocumentId), complete: true, dirty: false, missingLabels: [], open: false });
  const [documentFieldsNeedReview, setDocumentFieldsNeedReview] = useState(false);
  const [loadedDocumentVersion, setLoadedDocumentVersion] = useState<number | null>(null);
  // Applying variables creates a new prepared version. Do not let an older
  // loader response that was already in flight put its fields back on screen.
  const minimumRevalidatedDocumentVersionRef = useRef<number | null>(null);
  useEffect(() => {
    minimumRevalidatedDocumentVersionRef.current = null;
  }, [propDocumentId]);
  // ========= Context =========
  const {
    selectedFile: contextSelectedFile,
    setSelectedFile: setContextSelectedFile,
    isLoggedIn,
    showModal,
    setShowModal,
    user,
    setUser,
  } = useContextStore();
  const { isLoading: isAuthLoading } = useAuth();
  const { settings: userSettings } = useUserSettings({
    enabled: isLoggedIn && Boolean(user?.id),
    accountKey: user?.id ?? null,
  });
  const defaultDateFormat = userSettings?.dateFormat;
  const defaultWeekStart = userSettings?.weekStart;

  const templateInitialComponents = useMemo(() => {
    if (!isTemplateEditor || !propDocumentId) {
      return [] as DroppedComponent[];
    }
    const usedIds = new Set<number>();
    return Array.isArray(initialFields) && initialFields.length > 0
      ? dedupeFieldsById(initialFields).map((field) =>
          mapFieldToDroppedComponent(field, usedIds, { defaultDateFormat })
        )
      : [];
  }, [defaultDateFormat, initialFields, isTemplateEditor, propDocumentId]);
  const templateInitialElementId = useMemo(
    () => Math.max(0, ...templateInitialComponents.map((component) => component.id)) + 1,
    [templateInitialComponents]
  );
  const builderInitialComponents = useMemo(() => {
    if (isSigningMode || isTemplateEditor) {
      return [] as DroppedComponent[];
    }
    const usedIds = new Set<number>();
    return Array.isArray(initialFields) && initialFields.length > 0
      ? dedupeFieldsById(initialFields).map((field) =>
          mapFieldToDroppedComponent(field, usedIds, { defaultDateFormat })
        )
      : [];
  }, [defaultDateFormat, initialFields, isSigningMode, isTemplateEditor]);
  const builderInitialElementId = useMemo(
    () => Math.max(0, ...builderInitialComponents.map((component) => component.id)) + 1,
    [builderInitialComponents]
  );
  const [previewSelectedFile, setPreviewSelectedFile] = useState<File | string | Doc | null>(
    () => (isPreviewOnly ? initialFileUrl : null)
  );
  const [internalAIAssistantOpen, setInternalAIAssistantOpen] = useState(false);
  const [toolbarAIAssistantTab, setToolbarAIAssistantTab] = useState<'summary' | undefined>();
  const [toolbarAIAssistantRequestKey, setToolbarAIAssistantRequestKey] = useState(0);
  const isAIAssistantOpen = aiAssistantOpen ?? internalAIAssistantOpen;
  const setIsAIAssistantOpen = onAIAssistantOpenChange ?? setInternalAIAssistantOpen;
  const openToolbarAIAssistant = () => {
    setToolbarAIAssistantTab('summary');
    setToolbarAIAssistantRequestKey((key) => key + 1);
    setIsAIAssistantOpen(true);
  };
  const [sessionExpiredState, setSessionExpiredState] = useState<{
    resourceKey: string | null;
    message: string | null;
  }>({
    resourceKey: propDocumentId,
    message: null,
  });
  const {
    recipients,
    setRecipients,
    draggingComponent,
    setDraggingComponent,
    setPosition,
    setError,
    setPhotoDialog,
    setCanvasFields,
    showDeletedDialog,
    setShowDeletedDialog,
    setSelectedFieldForDialog,
    setSelectedFieldId,
    documentName,
    setDocumentName,
    isEditingFileName,
    setIsEditingFileName,
    documentStatus,
    setDocumentStatus,
    documentShareAccess,
    setDocumentShareAccess,
    documentCreatedAt,
    setDocumentCreatedAt,
    documentUpdatedAt,
    setDocumentUpdatedAt,
    derivedFromDocumentId,
    setDerivedFromDocumentId,
    derivedFromVersion,
    setDerivedFromVersion,
    signingEvents,
    setSigningEvents,
    showAuditModal,
    setShowAuditModal,
    showDeriveModal,
    setShowDeriveModal,
    showVoidModal,
    setShowVoidModal,
    replacePageRequest,
    setReplacePageRequest,
    appendDocumentRequest,
    setAppendDocumentRequest,
    setShowAddRecipients,
    showSaveAsTemplate,
    setShowSaveAsTemplate,
    showSendDocument,
    setShowSendDocument,
    documentId,
    setDocumentId,
    clearBuilderState,
  } = useBuilderStore();
  const selectedFile = isPreviewOnly ? previewSelectedFile : contextSelectedFile;
  const sessionExpiredMessage =
    sessionExpiredState.resourceKey === propDocumentId
      ? sessionExpiredState.message
      : null;

  // Ensure we don't attempt to load the PDF before authentication is ready in builder mode
  const readyToLoad = isPreviewOnly || isSigningMode || !isAuthLoading;
  const fileToLoad = readyToLoad ? selectedFile : null;
  const sessionExpired =
    Boolean(sessionExpiredMessage) &&
    !isPreviewOnly &&
    !isSigningMode &&
    !isAuthLoading &&
    !isLoggedIn;

  useBuilderResourceReset({
    isTemplateEditor,
    resourceId: propDocumentId,
    reset: clearBuilderState,
  });

  useEffect(() => {
    if (isPreviewOnly || isSigningMode) {
      return;
    }

    const handleSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent<AuthSessionExpiredEventDetail>).detail;
      const message = detail?.message || 'Session expired. Please log in again to continue. Edits in this tab are preserved.';
      setSessionExpiredState({
        resourceKey: propDocumentId,
        message,
      });
      setShowModal(true);
      toast.error(message);
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);
    };
  }, [isPreviewOnly, isSigningMode, propDocumentId, setShowModal]);

  const setSelectedFile = useCallback(
    (value: File | string | Doc | null) => {
      if (isPreviewOnly) {
        setPreviewSelectedFile(value);
        return;
      }
      setContextSelectedFile(value);
    },
    [isPreviewOnly, setContextSelectedFile]
  );

  const {
    pdfDoc,
    pages,
    currentPage,
    zoom,
    setZoom,
    showMenu,
    setShowMenu,
    selectedPageIndex,
    menuTriggerElement,
    showAddPageMenu,
    setShowAddPageMenu,
    insertAfterPageNumber,
    addPageMenuTriggerElement,
    documentRef,
    pageRefs,
    thumbRefs,
    generateThumbnails,
    handleThumbnailClick,
    handlePdfUpdated,
    insertBlankPageAt,
    appendPdfAt,
    replacePageAt,
    toggleMenu,
    toggleAddPageMenu,
  } = usePdfState({
    selectedFile: fileToLoad,
    setSelectedFile,
    onPageChange,
    onNumPagesChange,
  });

  const [elementId, setElementId] = useState<number>(() =>
    Math.max(templateInitialElementId, builderInitialElementId)
  );

  const {
    isReadOnly,
    isInProgress,
    isVoided,
    isRejected,
    isSent,
    isAlreadySent,
    isPreviewMode,
  } = useDocumentStatusFlags({ isSigningMode, documentStatus });
  const isShareViewOnly = documentShareAccess === 'can_view';
  const isShareSendOnly = documentShareAccess === 'can_send';
  const effectiveReadOnly = isReadOnly || isShareViewOnly || isShareSendOnly;
  const canEditDocument = !isSigningMode && !effectiveReadOnly;
  const canUseDocumentActions = !isSigningMode && !isReadOnly && !isShareViewOnly;

  const handleAddRecipients = useCallback(() => {
    setShowAddRecipients(true);
  }, [setShowAddRecipients]);

  const handleOpenReplacePageDialog = useCallback((
    pageIndex: number,
    mode: 'upload' | 'existing' | 'template',
    initialSourceFile?: File
  ) => {
    setReplacePageRequest({
      pageIndex,
      mode,
      initialSourceFile: initialSourceFile ?? null,
    });
  }, [setReplacePageRequest]);

  const handleOpenAppendDocumentDialog = useCallback((
    insertAfterPageNumber: number,
    mode: 'upload' | 'existing' | 'template',
    initialSourceFile?: File
  ) => {
    setAppendDocumentRequest({
      insertAfterPageNumber,
      mode,
      initialSourceFile: initialSourceFile ?? null,
    });
  }, [setAppendDocumentRequest]);
  // ========= Refs =========
  const imageRef = useRef<HTMLInputElement>(null);
  const textFieldRefs = useRef<Record<number, RichTextEditorHandle | null>>({});

  const { droppedComponents, setDroppedComponents, internalDroppedComponents } = useDroppedComponentsState({
    isSigningMode,
    initialFields,
    onFieldsChange,
  });

  const {
    isSenderPreviewOpen,
    senderPreviewDocument,
    openSenderPreview,
    closeSenderPreview,
  } = useSenderPreview({
    selectedFile,
    initialFileUrl,
    droppedComponents,
    recipients,
    documentId,
    documentName,
    initialDocumentName,
    documentStatus,
    currentPage,
    onPreviewError: setError,
  });

  const { defaults } = useSignatureInitial({
    user,
    setUser,
    droppedComponents,
    updateComponentData: (id, data) => setDroppedComponents(prev => prev.map(comp => comp.id === id ? { ...comp, data: data.value } : comp))
  });
  // ========= Undo/Redo =========
  const { saveState, canUndo, canRedo, resetHistory: resetHistoryWithState, handleUndo, handleRedo } = useUndoRedoControls(
    internalDroppedComponents,
    setDroppedComponents,
    showSendDocument
  );

  const clearHistory = useCallback((newState: DroppedComponent[] = []) => {
    resetHistoryWithState(newState);
  }, [resetHistoryWithState]);

  const {
    handleInsertBlankPage,
    handlePageDeleted,
    handlePageDuplicated,
    handlePageMoved,
    handlePagesInserted,
    handlePageReplaced,
  } = usePageOperations({
    droppedComponents,
    setDroppedComponents,
    resetHistory: clearHistory,
    insertBlankPageAt,
  });

  const handleReplacePage = useCallback(async ({
    sourcePdfDoc,
    sourcePageIndex,
    sourceFields = [],
    importSourceFields = false,
  }: {
    sourcePdfDoc: PDFDocument;
    sourcePageIndex?: number;
    sourceFields?: DocumentField[];
    importSourceFields?: boolean;
  }) => {
    if (!replacePageRequest) {
      return;
    }

    if (typeof sourcePageIndex !== 'number') {
      throw new Error('Choose a source page before replacing.');
    }

    const currentPageSizes = pdfDoc
      ? pdfDoc.getPages().map((page) => page.getSize())
      : [];
    const sourcePageSizes = sourcePdfDoc.getPages().map((page) => page.getSize());

    const operation = await replacePageAt(
      replacePageRequest.pageIndex,
      sourcePdfDoc,
      sourcePageIndex
    );

    if (!operation) {
      throw new Error('The selected page could not be replaced.');
    }

    const importedComponents =
      importSourceFields && sourceFields.length > 0
        ? buildReplacementPageFields({
            currentComponents: droppedComponents,
            currentPageSizes,
            sourceFields,
            sourcePageSizes,
            sourcePageIndex,
            targetPageNumber: replacePageRequest.pageIndex + 1,
            recipients,
          })
        : [];

    handlePageReplaced(operation, importedComponents);
    setReplacePageRequest(null);
    toast.success(
      importedComponents.length > 0
        ? `Page ${replacePageRequest.pageIndex + 1} replaced with ${importedComponents.length} imported ${importedComponents.length === 1 ? 'field' : 'fields'}.`
        : `Page ${replacePageRequest.pageIndex + 1} replaced.`
    );
  }, [droppedComponents, handlePageReplaced, pdfDoc, recipients, replacePageAt, replacePageRequest, setReplacePageRequest]);

  const handleAppendDocument = useCallback(async ({
    sourcePdfDoc,
    selectedPageIndexes,
    sourceFields = [],
    importSourceFields = false,
  }: {
    sourcePdfDoc: PDFDocument;
    sourcePageIndex?: number;
    selectedPageIndexes?: number[];
    sourceFields?: DocumentField[];
    importSourceFields?: boolean;
  }) => {
    if (!appendDocumentRequest) {
      return;
    }

    const normalizedSelectedPageIndexes =
      Array.isArray(selectedPageIndexes) && selectedPageIndexes.length > 0
        ? Array.from(new Set(selectedPageIndexes)).sort((left, right) => left - right)
        : Array.from({ length: sourcePdfDoc.getPageCount() }, (_, index) => index);

    if (normalizedSelectedPageIndexes.length === 0) {
      throw new Error('Choose at least one page to append.');
    }

    const currentPageSizes = pdfDoc
      ? pdfDoc.getPages().map((page) => page.getSize())
      : [];
    const sourcePageSizes = sourcePdfDoc.getPages().map((page) => page.getSize());

    const operation = await appendPdfAt(
      appendDocumentRequest.insertAfterPageNumber,
      sourcePdfDoc,
      normalizedSelectedPageIndexes
    );

    if (!operation) {
      throw new Error('The selected PDF could not be appended.');
    }

    const importedComponents =
      importSourceFields && sourceFields.length > 0
        ? buildImportedPageFields({
            currentComponents: droppedComponents,
            currentPageSizes,
            sourceFields,
            sourcePageSizes,
            selectedPageIndexes: normalizedSelectedPageIndexes,
            insertAfterPageNumber: appendDocumentRequest.insertAfterPageNumber,
            recipients,
          })
        : [];

    handlePagesInserted(operation, importedComponents);
    setAppendDocumentRequest(null);
    const insertedPageCount = operation.insertedPageSizes.length;
    toast.success(
      importedComponents.length > 0
        ? `${insertedPageCount} ${insertedPageCount === 1 ? 'page' : 'pages'} inserted after page ${appendDocumentRequest.insertAfterPageNumber} with ${importedComponents.length} imported ${importedComponents.length === 1 ? 'field' : 'fields'}.`
        : `${insertedPageCount} ${insertedPageCount === 1 ? 'page' : 'pages'} inserted after page ${appendDocumentRequest.insertAfterPageNumber}.`
    );
  }, [appendDocumentRequest, appendPdfAt, droppedComponents, handlePagesInserted, pdfDoc, recipients, setAppendDocumentRequest]);

  const { updateField } = useFieldUpdates({
    isSigningMode,
    recipients,
    setDroppedComponents,
    saveState,
    documentRef,
    pageRefs,
    zoom,
  });

  const resolvePageBounds = (pageNumber: number): PageBounds | null => {
    const canvasRect = documentRef.current?.getBoundingClientRect();
    const pageEl = pageRefs.current[Math.max(0, pageNumber - 1)];
    if (!canvasRect || !pageEl) {
      return null;
    }

    const pageRect = pageEl.getBoundingClientRect();
    const safeZoom = zoom > 0 ? zoom : 1;

    return {
      left: (pageRect.left - canvasRect.left) / safeZoom,
      top: (pageRect.top - canvasRect.top) / safeZoom,
      width: pageRect.width / safeZoom,
      height: pageRect.height / safeZoom,
      pageRect,
    };
  };

  const updateRecipientFieldCounts = (components: DroppedComponent[]) => {
    setRecipients((currentRecipients: Recipient[]) =>
      currentRecipients.map((recipient: Recipient) => ({
        ...recipient,
        totalFields: components.filter((component) => component.assignedRecipientId === recipient.id).length,
      }))
    );
  };

  const createRepeatGroupId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `repeat_${crypto.randomUUID()}`;
    }

    return `repeat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  };

  const handleUpdateField = (fieldId: number, patch: Partial<DroppedComponent>) => {
    setDroppedComponents((prevComponents) => {
      const updatedComponents = prevComponents.map((component) => {
        if (component.id !== fieldId) return component;
        const patchWithPagePlacement: Partial<DroppedComponent> = { ...patch };
        if (typeof patch.pageNumber === 'number' && patch.pageNumber > 0) {
          const maxPage = pageRefs.current.length || pages.length || patch.pageNumber;
          const safePageNumber = Math.max(1, Math.min(Math.round(patch.pageNumber), maxPage));
          const sourcePageEl = pageRefs.current[Math.max(0, (component.pageNumber ?? 1) - 1)];
          const targetBounds = resolvePageBounds(safePageNumber);

          patchWithPagePlacement.pageNumber = safePageNumber;
          if (targetBounds) {
            const canvasRect = documentRef.current?.getBoundingClientRect();
            const sourceRect = sourcePageEl?.getBoundingClientRect();
            const sourceTop = canvasRect && sourceRect
              ? (sourceRect.top - canvasRect.top) / zoom
              : targetBounds.top;
            const sourceLeft = canvasRect && sourceRect
              ? (sourceRect.left - canvasRect.left) / zoom
              : targetBounds.left;

            const relativeX = component.x - sourceLeft;
            const relativeY = component.y - sourceTop;

            patchWithPagePlacement.x = targetBounds.left + relativeX;
            patchWithPagePlacement.y = targetBounds.top + relativeY;
            patchWithPagePlacement.pageRect = targetBounds.pageRect;
          }
        }
        const mergedSettings = patchWithPagePlacement.settings
          ? {
              ...(component.settings || {}),
              ...patchWithPagePlacement.settings,
            }
          : component.settings;
        const isRecipientDateField =
          component.component === 'Date' && (component.fieldOwner ?? 'recipients') === 'recipients';
        const sanitizedSettings =
          isRecipientDateField && mergedSettings && Object.prototype.hasOwnProperty.call(mergedSettings, 'defaultValue')
            ? { ...mergedSettings, defaultValue: '' }
            : mergedSettings;
        const isDefaultValueCapable =
          ['Text', 'Full Name', 'Email', 'Date', 'Dropdown', 'Radio'].includes(component.component) &&
          !isRecipientDateField;
        const hasDefaultValuePatch = Boolean(
          patchWithPagePlacement.settings &&
          Object.prototype.hasOwnProperty.call(patchWithPagePlacement.settings, 'defaultValue')
        );
        const shouldSyncValueFromDefault =
          !isSigningMode &&
          isDefaultValueCapable &&
          hasDefaultValuePatch;
        const nextData = shouldSyncValueFromDefault
          ? (typeof sanitizedSettings?.defaultValue === 'string' ? sanitizedSettings.defaultValue : '')
          : patchWithPagePlacement.data ?? component.data;
        let nextComponent: DroppedComponent = {
          ...component,
          ...patchWithPagePlacement,
          data: nextData,
          settings: sanitizedSettings,
        };
        if (patchWithPagePlacement.data !== undefined || shouldSyncValueFromDefault) {
          nextComponent = {
            ...nextComponent,
            ...estimateAutoFieldDimensions(nextComponent, nextData ?? null),
          };
        }
        const targetPageBounds = resolvePageBounds(nextComponent.pageNumber ?? 1);
        if (targetPageBounds) {
          nextComponent = {
            ...nextComponent,
            ...fitFieldWithinPageBounds(nextComponent, targetPageBounds),
          };
        }
        const effectiveValue = getEffectiveFieldValue({
          component: nextComponent.component,
          required: nextComponent.required,
          value: nextComponent.data,
          settings: nextComponent.settings,
        });
        const validation = validateFieldValue({
          component: nextComponent.component,
          required: nextComponent.required,
          value: effectiveValue,
          settings: nextComponent.settings,
        });
        return {
          ...nextComponent,
          hasError: !validation.valid,
        };
      });
      saveState(updatedComponents);
      return updatedComponents;
    });
  };

  const handleRepeatFieldOnPages = (field: DroppedComponent, pageNumbers: number[]) => {
    const pageCount = pageRefs.current.length || pages.length;

    if (pageCount <= 1) {
      toast('Add another page to repeat this field.');
      return;
    }

    if (pageNumbers.length === 0) {
      toast('Choose at least one page to repeat this field.');
      return;
    }

    setDroppedComponents((prevComponents) => {
      const result = buildRepeatedFieldsForPages({
        field,
        currentComponents: prevComponents,
        pageCount,
        nextIdStart: elementId,
        targetPageNumbers: pageNumbers,
        repeatGroupId: field.repeatGroupId ?? createRepeatGroupId(),
        resolvePageBounds,
      });

      if (result.addedCount === 0) {
        if (result.skippedExistingPageNumbers.length >= pageNumbers.length) {
          toast('This field already exists on the selected pages.');
        } else {
          toast.error('Pages are still loading. Try again in a moment.');
        }
        return prevComponents;
      }

      saveState(result.components);
      setElementId(result.nextElementId);
      updateRecipientFieldCounts(result.components);

      const pageLabel = result.addedCount === 1 ? 'page' : 'pages';
      toast.success(`Repeated on ${result.addedCount} ${pageLabel}.`);
      return result.components;
    });
  };

  const {
    mouseDownOnField,
    mouseMoveOnDropArea,
    mouseLeaveOnDropArea,
    clickOnDropArea,
    handleDeleteField,
    handleDuplicateField,
    handleAssignRecipient,
    handleDragStop,
    handleResizeStop,
    clickField,
    onImgUpload,
    handleSelectField,
  } = useFieldInteractions({
    isSigningMode,
    currentPage,
    zoom,
    user,
    defaultDateFormat,
    defaults,
    recipients,
    setRecipients,
    draggingComponent,
    setDraggingComponent,
    setPosition,
    elementId,
    setElementId,
    setDroppedComponents,
    droppedComponents,
    saveState,
    documentRef,
    pageRefs,
    setSelectedFieldId,
    setSelectedFieldForDialog,
    setCanvasFields,
    setPhotoDialog,
    imageRef,
  });

  const clearDocumentFieldReview = useCallback((savedVersion?: number) => {
    setDocumentFieldsNeedReview(false);
    if (typeof savedVersion === 'number') {
      setLoadedDocumentVersion(savedVersion);
    }
  }, []);
  const { saveToServer, handleSavePDF, hasUnsavedChanges, markSavedState, discardUnsavedChanges } = useDocumentSave({
    selectedFile,
    setSelectedFile,
    pdfDoc,
    documentName,
    setDocumentName,
    droppedComponents,
    recipients,
    currentPage,
    zoom,
    documentId,
    setDocumentId,
    signingToken,
    isReadOnly: effectiveReadOnly,
    isLoggedIn,
    setShowModal,
    documentRef,
    pageRefs,
    setShowDeletedDialog,
    setError,
    isEditingFileName,
    isPreviewOnly,
    isTemplateEditor,
    onReviewedFieldsSaved: clearDocumentFieldReview,
    reviewedDocumentVersion: loadedDocumentVersion,
  });

  const serializeCurrentDocumentFields = (): DocumentField[] => {
    const canvasRect = documentRef.current?.getBoundingClientRect();
    return droppedComponents.map((component) =>
      serializeDroppedComponentToField(component, {
        currentPage,
        canvasRect,
        pageRect:
          pageRefs.current[(component.pageNumber ?? currentPage) - 1]?.getBoundingClientRect() ??
          component.pageRect,
        zoom,
      })
    );
  };

  const handleTemplateValuesApplied = useCallback((result: TemplateVariableApplyResult) => {
    const usedIds = new Set<number>();
    const preparedComponents = dedupeFieldsById(result.fields).map((field) =>
      mapFieldToDroppedComponent(field, usedIds, { defaultDateFormat })
    );

    setDroppedComponents(preparedComponents);
    resetHistoryWithState(preparedComponents);
    setElementId(Math.max(0, ...preparedComponents.map((component) => component.id)) + 1);
    setDocumentFieldsNeedReview(result.fieldsNeedReview);

    if (result.preparedVersion !== null) {
      minimumRevalidatedDocumentVersionRef.current = result.preparedVersion;
      setLoadedDocumentVersion(result.preparedVersion);
      const currentDocumentId = documentId ?? propDocumentId;
      if (currentDocumentId) {
        // The document endpoint remains access-controlled. The version query
        // only cache-busts the newly rendered PDF; it is not trusted input.
        setSelectedFile(`/api/documents/${encodeURIComponent(currentDocumentId)}?version=${result.preparedVersion}`);
      }
    }

    markSavedState({
      components: preparedComponents,
      name: documentName,
      recipients,
    });
  }, [
    defaultDateFormat,
    documentId,
    documentName,
    markSavedState,
    propDocumentId,
    recipients,
    resetHistoryWithState,
    setDroppedComponents,
    setElementId,
    setSelectedFile,
  ]);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);
  const shouldApplyRevalidatedDocumentState = useCallback(
    (snapshot: { currentVersion: number | null }) => {
      const minimumVersion = minimumRevalidatedDocumentVersionRef.current;
      if (
        minimumVersion !== null &&
        snapshot.currentVersion !== null &&
        snapshot.currentVersion < minimumVersion
      ) {
        return false;
      }
      return !hasUnsavedChangesRef.current;
    },
    []
  );
  const handleEditorSave = useCallback(async (options: Parameters<typeof handleSavePDF>[0]) => {
    const saved = await handleSavePDF(options);
    if (saved && isTemplateEditor) await onTemplateSaved?.();
    return saved;
  }, [handleSavePDF, isTemplateEditor, onTemplateSaved]);
  useUnsavedChangesGuard(hasUnsavedChanges || documentFieldsNeedReview);

  useDocumentLoader({
    propDocumentId,
    initialFields,
    initialRecipients,
    initialFileUrl,
    initialDocumentName,
    isSigningMode,
    isTemplateEditor,
    setRecipients,
    setSelectedFile,
    setDocumentName,
    setDocumentId,
    setDocumentStatus,
    setDocumentShareAccess,
    setDocumentCreatedAt,
    setDocumentUpdatedAt,
    setDerivedFromDocumentId,
    setDerivedFromVersion,
    setSigningEvents,
    setTemplateFieldsNeedReview: setDocumentFieldsNeedReview,
    setLoadedDocumentVersion,
    setDroppedComponents,
    resetHistory: clearHistory,
    setElementId,
    markSavedState,
    shouldApplyRevalidatedState: shouldApplyRevalidatedDocumentState,
  });

  const templateInitialRecipients = useMemo(
    () => (Array.isArray(initialRecipients) ? initialRecipients : []),
    [initialRecipients]
  );

  useTemplateEditorPropHydration({
    isTemplateEditor,
    resourceId: propDocumentId,
    components: templateInitialComponents,
    recipients: templateInitialRecipients,
    nextElementId: templateInitialElementId,
    initialName: initialDocumentName,
    currentName: documentName,
    setDroppedComponents,
    setRecipients,
    resetHistory: resetHistoryWithState,
    setElementId,
    markSavedState,
  });

  useDocumentBuilderPropHydration({
    isSigningMode,
    isTemplateEditor,
    resourceId: propDocumentId,
    hasInitialSnapshot:
      initialFields !== null ||
      initialRecipients !== null ||
      initialFileUrl !== null ||
      initialDocumentName !== null,
    components: builderInitialComponents,
    recipients: templateInitialRecipients,
    nextElementId: builderInitialElementId,
    initialName: initialDocumentName,
    currentName: documentName,
    setDroppedComponents,
    setRecipients,
    resetHistory: resetHistoryWithState,
    setElementId,
    markSavedState,
  });

  useDocumentDraft({
    documentId,
    droppedComponents,
    recipients,
    documentName,
    selectedFile,
    currentPage,
    zoom,
    documentRef,
    pageRefs,
    isPreviewOnly,
  });

  const {
    isDownloadingSigned,
    isDeriving,
    isVoiding,
    handleDownloadSigned,
    handleDeriveDocument,
    handleVoidAndDerive,
  } = useDocumentActions({
    documentId,
    documentName,
    setShowDeriveModal,
    setShowVoidModal,
  });

  const {
    showSendConfirmation,
    setShowSendConfirmation,
    handleSendComplete,
    handleGoToDashboard,
    handleVoidFromConfirmation,
    handleOpenSendModal,
  } = useSendFlow({
    isAlreadySent,
    setShowVoidModal,
    setDocumentStatus,
    setRecipients,
    setShowSendDocument,
  });

  const handleSendRequest = useCallback(async () => {
    if (documentFieldsNeedReview) {
      toast.error('Review the signing field placement and save the document before sending.');
      return;
    }
    if (templateVariableStatus.loading) {
      toast.error('Template variables are still loading. Please try again.');
      return;
    }
    if (templateVariableStatus.available && (!templateVariableStatus.complete || templateVariableStatus.dirty)) {
      setVariablesPanelOpen(true);
      toast.error(templateVariableStatus.dirty
        ? 'Apply your Smart variable changes before sending.'
        : `${templateVariableStatus.missingLabels.length} required Smart ${templateVariableStatus.missingLabels.length === 1 ? 'variable needs' : 'variables need'} values before sending.`);
      return;
    }
    handleOpenSendModal();
  }, [documentFieldsNeedReview, handleOpenSendModal, templateVariableStatus]);

  // save signed copy
  useEffect(() => {
    if (onSignedSaveDocument) {
      onSignedSaveDocument(() => saveToServer().then(() => {})); // Wrap saveToServer to return Promise<void>
    }
  }, [onSignedSaveDocument, saveToServer]);

  const containerHeight = pageRefs.current.reduce((acc, page) => {
    if (!page) return acc;
    const rect = page.getBoundingClientRect();
    return acc + rect.height + PAGE_VERTICAL_SPACING;
  }, 0);


  // ==========================================================
  // Render
  // ==========================================================
  return (
    <>
      {!isLoggedIn && (
        <Modal
          visible={showModal}
          onClose={() => setShowModal(false)}
          title={<span className="sr-only">Log in</span>}
        >
          <LoginPage />
        </Modal>
      )}
      {sessionExpired && !isSigningMode && (
        <div className="flex items-center justify-between border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>{sessionExpiredMessage || 'Session expired. Log in again to continue saving and sending this document.'}</span>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-sm border border-amber-400 px-3 py-1 text-xs font-medium hover:bg-amber-100"
          >
            Log in
          </button>
        </div>
      )}

      {!isTemplateEditor && documentFieldsNeedReview && (
        <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 text-xs text-amber-950">
          <span className="font-semibold">Field placement needs review:</span>
          <span className="ml-2">Template values changed the document layout. Existing signing fields were preserved. Check every field, then save the document to confirm placement before sending.</span>
        </div>
      )}

      {!isTemplateEditor && canEditDocument && templateVariableStatus.available && !templateVariableStatus.loading && (
        templateVariableStatus.dirty || !templateVariableStatus.complete
      ) && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950">
          <div>
            <span className="font-semibold">Smart-variable values need attention.</span>
            <span className="ml-2">{templateVariableStatus.dirty
              ? 'Apply your changes before sending this envelope.'
              : `${templateVariableStatus.missingLabels.length} required ${templateVariableStatus.missingLabels.length === 1 ? 'value is' : 'values are'} still missing before you can send.`}</span>
          </div>
          <button
            type="button"
            onClick={() => setVariablesPanelOpen(true)}
            className="rounded border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            {templateVariableStatus.dirty ? 'Review changes' : 'Add values'}
          </button>
        </div>
      )}

      {!isTemplateEditor && (
        <DocumentStatusBars
          documentId={documentId ?? propDocumentId}
          isSigningMode={isSigningMode}
          isCompleted={!isSigningMode && documentStatus === 'completed'}
          isInProgress={isInProgress}
          isSent={isSent}
          isVoided={isVoided}
          isRejected={isRejected}
          derivedFromDocumentId={derivedFromDocumentId}
          derivedFromVersion={derivedFromVersion}
          isDeriving={isDeriving}
          isDownloadingSigned={isDownloadingSigned}
          isVoiding={isVoiding}
          onShowAudit={() => setShowAuditModal(true)}
          onDownloadSigned={handleDownloadSigned}
          onShowDerive={() => setShowDeriveModal(true)}
          onShowVoid={() => setShowVoidModal(true)}
        />
      )}

      {canUseDocumentActions &&
        <ActionToolBar
          documentName={documentName}
          setDocumentName={setDocumentName}
          isEditingFileName={isEditingFileName}
          setIsEditingFileName={setIsEditingFileName}
          handleSavePDF={handleEditorSave}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          recipients={recipients}
          onSendDocument={() => void handleSendRequest()}
          isAlreadySent={isAlreadySent}
          onVoidAndDerive={() => setShowVoidModal(true)}
          onSaveAsTemplate={canEditDocument ? () => setShowSaveAsTemplate(true) : undefined}
          canSaveDocument={canEditDocument}
          hasUnsavedChanges={hasUnsavedChanges || documentFieldsNeedReview || (isTemplateEditor && templateFieldReviewRequired)}
          droppedItems={droppedComponents}
          isLoggedIn={isLoggedIn}
          setShowModal={setShowModal} // Pass setShowModal directly
          checkFieldError={setDroppedComponents} // Pass a function that triggers re-evaluation
          onPreviewDocument={openSenderPreview}
          isTemplateEditor={isTemplateEditor}
          templateNavigation={templateNavigation}
          selectedFile={fileToLoad}
          documentId={documentId ?? propDocumentId}
          documentCreatedAt={documentCreatedAt}
          documentUpdatedAt={documentUpdatedAt}
          derivedFromDocumentId={derivedFromDocumentId}
          derivedFromVersion={derivedFromVersion}
          onOpenAIAssistant={
            !isTemplateEditor && (documentId ?? propDocumentId)
              ? openToolbarAIAssistant
              : undefined
          }
          onShowHistory={!isTemplateEditor ? () => setShowAuditModal(true) : undefined}
          onDiscardUnsavedChanges={discardUnsavedChanges}
        />}

      {!isTemplateEditor && canEditDocument && propDocumentId && (
        <TemplateVariablesPanel
          documentId={propDocumentId}
          open={variablesPanelOpen}
          onOpenChange={setVariablesPanelOpen}
          onStatusChange={setTemplateVariableStatus}
          getCurrentFields={serializeCurrentDocumentFields}
          onValuesApplied={handleTemplateValuesApplied}
        />
      )}

      {!isTemplateEditor && canEditDocument && (
        <SaveAsTemplateGate
          showSaveAsTemplate={showSaveAsTemplate}
          isLoggedIn={isLoggedIn}
          setShowSaveAsTemplate={setShowSaveAsTemplate}
          setShowModal={setShowModal}
          documentId={documentId}
          documentName={documentName}
          selectedFile={selectedFile}
          droppedComponents={droppedComponents}
          recipients={recipients}
          pages={pages}
          documentRef={documentRef}
          pageRefs={pageRefs}
          currentPage={currentPage}
          zoom={zoom}
        />
      )}
      <EditorWorkspace
        isSigningMode={isSigningMode}
        isReadOnly={effectiveReadOnly}
        isPreviewMode={isPreviewMode || isShareViewOnly || isShareSendOnly}
        canEditPages={!isTemplateEditor}
        templateWorkspace={isTemplateEditor}
        isTemplateEditor={isTemplateEditor}
        isSigned={isSigned}
        selectedFile={selectedFile}
        signingToken={signingToken}
        currentRecipientId={currentRecipientId}
        onSendComplete={handleSendComplete}
        serializeFields={serializeCurrentDocumentFields}
        mouseDownOnField={mouseDownOnField}
        handleAddRecipients={handleAddRecipients}
        imageRef={imageRef}
        onImgUpload={onImgUpload}
        containerHeight={containerHeight}
        zoom={zoom}
        setZoom={setZoom}
        currentPage={currentPage}
        pages={pages}
        documentRef={documentRef}
        pageRefs={pageRefs}
        thumbRefs={thumbRefs}
        textFieldRefs={textFieldRefs}
        mouseMoveOnDropArea={mouseMoveOnDropArea}
        mouseLeaveOnDropArea={mouseLeaveOnDropArea}
        clickOnDropArea={clickOnDropArea}
        onSelectField={handleSelectField}
        onAssignRecipient={handleAssignRecipient}
        onDuplicateField={handleDuplicateField}
        onDeleteField={handleDeleteField}
        onRepeatFieldOnPages={handleRepeatFieldOnPages}
        updateField={updateField}
        handleDragStop={handleDragStop}
        handleResizeStop={handleResizeStop}
        onClickField={clickField}
        guidedFieldId={guidedFieldId}
        guidedBadgeLabel={guidedBadgeLabel}
        handleThumbnailClick={handleThumbnailClick}
        toggleAddPageMenu={toggleAddPageMenu}
        toggleMenu={toggleMenu}
        generateThumbnails={generateThumbnails}
        showAddPageMenu={showAddPageMenu}
        insertAfterPageNumber={insertAfterPageNumber}
        onUpdateField={handleUpdateField}
        resolvePageBounds={resolvePageBounds}
        defaultDateFormat={defaultDateFormat}
        defaultWeekStart={defaultWeekStart}
      />
      {!isTemplateEditor && (documentId ?? propDocumentId) && (
        <AIAssistantPanel
          documentId={String(documentId ?? propDocumentId)}
          isOpen={isAIAssistantOpen}
          onToggle={setIsAIAssistantOpen}
          requestedTab={aiAssistantRequestedTab ?? toolbarAIAssistantTab}
          requestKey={aiAssistantRequestKey ?? toolbarAIAssistantRequestKey}
          isRecipientMode={isSigningMode}
          signingToken={signingToken}
          recipientId={currentRecipientId}
        />
      )}
      {!isTemplateEditor && showAddPageMenu && insertAfterPageNumber !== null && (
        <AddPageMenu
          onClose={() => setShowAddPageMenu(false)}
          triggerElement={addPageMenuTriggerElement}
          insertAfterPageNumber={insertAfterPageNumber}
          onInsertBlankPage={handleInsertBlankPage}
          onAppendPdfRequested={handleOpenAppendDocumentDialog}
        />
      )}
      {/* -- PageThumbnailMenu integration (uses pdfDoc, pageIndex and onPdfUpdated) */}
      {!isTemplateEditor && pdfDoc && showMenu && selectedPageIndex !== null && (
        <PageThumbnailMenu
          key={selectedPageIndex}
          onClose={() => setShowMenu(false)}
          triggerElement={menuTriggerElement}
          pdfDoc={pdfDoc}
          pageIndex={selectedPageIndex}
          onPdfUpdated={handlePdfUpdated}
          onPageMoved={handlePageMoved}
          onPageDeleted={handlePageDeleted}
          onPageDuplicated={handlePageDuplicated}
          onReplacePageRequested={handleOpenReplacePageDialog}
        />
      )}
      {!isTemplateEditor && replacePageRequest && (
        <ReplacePageDialog
          visible
          mode={replacePageRequest.mode}
          targetPageNumber={replacePageRequest.pageIndex + 1}
          actionMode="replace"
          currentDocumentId={documentId ?? propDocumentId}
          initialSourceFile={replacePageRequest.initialSourceFile ?? null}
          onClose={() => setReplacePageRequest(null)}
          onConfirm={handleReplacePage}
        />
      )}
      {!isTemplateEditor && appendDocumentRequest && (
        <ReplacePageDialog
          visible
          mode={appendDocumentRequest.mode}
          targetPageNumber={appendDocumentRequest.insertAfterPageNumber}
          actionMode="append"
          currentDocumentId={documentId ?? propDocumentId}
          initialSourceFile={appendDocumentRequest.initialSourceFile ?? null}
          onClose={() => setAppendDocumentRequest(null)}
          onConfirm={handleAppendDocument}
        />
      )}
      <DeletedDocumentDialog isOpen={showDeletedDialog} onClose={() => setShowDeletedDialog(false)} />

      {!isTemplateEditor && (
        <>
          <DocumentSendConfirmationModal
            visible={showSendConfirmation}
            onClose={() => setShowSendConfirmation(false)}
            onGoToDashboard={handleGoToDashboard}
            onVoidAndCreateRevision={handleVoidFromConfirmation}
          />

          <DocumentActionModals
            documentStatus={documentStatus}
            showVoidModal={showVoidModal}
            setShowVoidModal={setShowVoidModal}
            isVoiding={isVoiding}
            onVoidAndDerive={handleVoidAndDerive}
            showDeriveModal={showDeriveModal}
            setShowDeriveModal={setShowDeriveModal}
            isDeriving={isDeriving}
            onDeriveDocument={handleDeriveDocument}
            showAuditModal={showAuditModal}
            setShowAuditModal={setShowAuditModal}
            signingEvents={signingEvents}
          />
        </>
      )}

      <SenderPreviewModal
        visible={isSenderPreviewOpen}
        previewDocument={senderPreviewDocument}
        onClose={closeSenderPreview}
      />
    </>
  );
};

const DocumentEditor: React.FC<EditorProps> = (props) => (
  <BuilderStoreProvider>
    <DocumentEditorInner {...props} />
  </BuilderStoreProvider>
);

export default DocumentEditor;
