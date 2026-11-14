import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type {
  DroppedComponent,
  DroppingField,
  IDocument,
  Recipient,
} from '@/types/types';
import { serializePageRect } from '@/utils/builder/pageRect';

type ReplacePageRequest = {
  pageIndex: number;
  mode: 'upload' | 'existing' | 'template';
  initialSourceFile?: File | null;
} | null;

type AppendDocumentRequest = {
  insertAfterPageNumber: number;
  mode: 'upload' | 'existing' | 'template';
  initialSourceFile?: File | null;
} | null;

interface BuilderState {
  droppedComponents: DroppedComponent[];
  recipients: Recipient[];
  draggingComponent: DroppingField | null;
  position: { x: number; y: number };
  error: string | null;
  photoDialog: boolean;
  canvasFields: boolean;
  showDeletedDialog: boolean;
  selectedFieldId: number | null;
  dialogFieldId: number | null;
  documentName: string;
  isEditingFileName: boolean;
  documentStatus: string | null;
  documentShareAccess: 'can_view' | 'can_send' | 'can_edit' | null;
  documentCreatedAt: string | null;
  documentUpdatedAt: string | null;
  documentRetention: IDocument['retention'] | null;
  documentLegalHold: IDocument['legalHold'] | null;
  derivedFromDocumentId: string | null;
  derivedFromVersion: number | null;
  signingEvents: NonNullable<IDocument['signingEvents']>;
  showAuditModal: boolean;
  showDeriveModal: boolean;
  showVoidModal: boolean;
  replacePageRequest: ReplacePageRequest;
  appendDocumentRequest: AppendDocumentRequest;
  showAddRecipients: boolean;
  showSaveAsTemplate: boolean;
  showSendDocument: boolean;
  documentId: string | null;
}

const initialState: BuilderState = {
  droppedComponents: [],
  recipients: [],
  draggingComponent: null,
  position: { x: 0, y: 0 },
  error: null,
  photoDialog: false,
  canvasFields: false,
  showDeletedDialog: false,
  selectedFieldId: null,
  dialogFieldId: null,
  documentName: '',
  isEditingFileName: false,
  documentStatus: null,
  documentShareAccess: null,
  documentCreatedAt: null,
  documentUpdatedAt: null,
  documentRetention: null,
  documentLegalHold: null,
  derivedFromDocumentId: null,
  derivedFromVersion: null,
  signingEvents: [],
  showAuditModal: false,
  showDeriveModal: false,
  showVoidModal: false,
  replacePageRequest: null,
  appendDocumentRequest: null,
  showAddRecipients: false,
  showSaveAsTemplate: false,
  showSendDocument: false,
  documentId: null,
};

export function sanitizeDroppedComponent(component: DroppedComponent): DroppedComponent {
  return {
    ...component,
    pageRect: serializePageRect(component.pageRect),
  };
}

export function sanitizeDroppedComponents(components: DroppedComponent[]): DroppedComponent[] {
  return components.map(sanitizeDroppedComponent);
}

const builderSlice = createSlice({
  name: 'builder',
  initialState,
  reducers: {
    resetBuilderState: () => initialState,
    setDroppedComponents(state, action: PayloadAction<DroppedComponent[]>) {
      state.droppedComponents = sanitizeDroppedComponents(action.payload);
    },
    setRecipients(state, action: PayloadAction<Recipient[]>) {
      state.recipients = action.payload;
    },
    setDraggingComponent(state, action: PayloadAction<DroppingField | null>) {
      state.draggingComponent = action.payload;
    },
    setPosition(state, action: PayloadAction<{ x: number; y: number }>) {
      state.position = action.payload;
    },
    setBuilderError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setPhotoDialog(state, action: PayloadAction<boolean>) {
      state.photoDialog = action.payload;
    },
    setCanvasFields(state, action: PayloadAction<boolean>) {
      state.canvasFields = action.payload;
    },
    setShowDeletedDialog(state, action: PayloadAction<boolean>) {
      state.showDeletedDialog = action.payload;
    },
    setSelectedFieldId(state, action: PayloadAction<number | null>) {
      state.selectedFieldId = action.payload;
    },
    setDialogFieldId(state, action: PayloadAction<number | null>) {
      state.dialogFieldId = action.payload;
    },
    setDocumentName(state, action: PayloadAction<string>) {
      state.documentName = action.payload;
    },
    setIsEditingFileName(state, action: PayloadAction<boolean>) {
      state.isEditingFileName = action.payload;
    },
    setDocumentStatus(state, action: PayloadAction<string | null>) {
      state.documentStatus = action.payload;
    },
    setDocumentShareAccess(state, action: PayloadAction<'can_view' | 'can_send' | 'can_edit' | null>) {
      state.documentShareAccess = action.payload;
    },
    setDocumentCreatedAt(state, action: PayloadAction<string | null>) {
      state.documentCreatedAt = action.payload;
    },
    setDocumentUpdatedAt(state, action: PayloadAction<string | null>) {
      state.documentUpdatedAt = action.payload;
    },
    setDocumentRetention(state, action: PayloadAction<IDocument['retention'] | null>) {
      state.documentRetention = action.payload;
    },
    setDocumentLegalHold(state, action: PayloadAction<IDocument['legalHold'] | null>) {
      state.documentLegalHold = action.payload;
    },
    setDerivedFromDocumentId(state, action: PayloadAction<string | null>) {
      state.derivedFromDocumentId = action.payload;
    },
    setDerivedFromVersion(state, action: PayloadAction<number | null>) {
      state.derivedFromVersion = action.payload;
    },
    setSigningEvents(state, action: PayloadAction<NonNullable<IDocument['signingEvents']>>) {
      state.signingEvents = action.payload;
    },
    setShowAuditModal(state, action: PayloadAction<boolean>) {
      state.showAuditModal = action.payload;
    },
    setShowDeriveModal(state, action: PayloadAction<boolean>) {
      state.showDeriveModal = action.payload;
    },
    setShowVoidModal(state, action: PayloadAction<boolean>) {
      state.showVoidModal = action.payload;
    },
    setReplacePageRequest(state, action: PayloadAction<ReplacePageRequest>) {
      state.replacePageRequest = action.payload;
    },
    setAppendDocumentRequest(state, action: PayloadAction<AppendDocumentRequest>) {
      state.appendDocumentRequest = action.payload;
    },
    setShowAddRecipients(state, action: PayloadAction<boolean>) {
      state.showAddRecipients = action.payload;
    },
    setShowSaveAsTemplate(state, action: PayloadAction<boolean>) {
      state.showSaveAsTemplate = action.payload;
    },
    setShowSendDocument(state, action: PayloadAction<boolean>) {
      state.showSendDocument = action.payload;
    },
    setBuilderDocumentId(state, action: PayloadAction<string | null>) {
      state.documentId = action.payload;
    },
  },
});

export const {
  resetBuilderState,
  setDroppedComponents,
  setRecipients,
  setDraggingComponent,
  setPosition,
  setBuilderError,
  setPhotoDialog,
  setCanvasFields,
  setShowDeletedDialog,
  setSelectedFieldId,
  setDialogFieldId,
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
  setBuilderDocumentId,
} = builderSlice.actions;

export default builderSlice.reducer;
