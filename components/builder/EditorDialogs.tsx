'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import { DocumentField, DroppingField, Recipient } from '@/types/types';
import { useBuilderStore } from '@/hooks/useBuilderStore';

const AddRecipientModal = dynamic(() => import('./AddRecipientModal'), { ssr: false });
const SendDocumentModal = dynamic(() => import('./SendDocumentModal'), { ssr: false });
const LivePhotoDialog = dynamic(
  () => import('@/components/builder/LivePhotoDialog').then((mod) => mod.LivePhotoDialog),
  { ssr: false }
);
const UserItems = dynamic(() => import('@/components/builder/UserItems'), { ssr: false });
const RecipientItems = dynamic(() => import('./RecipientItems'), { ssr: false });

interface EditorDialogsProps {
  isSigningMode: boolean;
  isReadOnly: boolean;
  isTemplateEditor: boolean;
  onSendComplete: (payload: { recipients: Recipient[]; signingMode: 'sequential' | 'parallel' }) => void;
  serializeFields: () => DocumentField[];
  updateField: (data: string | null, id: number) => void;
}

const EditorDialogs: React.FC<EditorDialogsProps> = ({
  isSigningMode,
  isReadOnly,
  isTemplateEditor,
  onSendComplete,
  serializeFields,
  updateField,
}) => {
  const {
    canvasFields,
    documentId,
    documentName,
    draggingComponent,
    droppedComponents,
    photoDialog,
    recipients,
    selectedFieldForDialog,
    setCanvasFields,
    setPhotoDialog,
    setRecipients,
    setShowAddRecipients,
    setShowSendDocument,
    showAddRecipients,
    showSendDocument,
  } = useBuilderStore();
  return (
    <>
      {photoDialog && (
        <LivePhotoDialog
          onClose={() => setPhotoDialog(false)}
          onConfirm={(data: string) => {
            if (selectedFieldForDialog) updateField(data, selectedFieldForDialog.id);
            setPhotoDialog(false);
          }}
        />
      )}
      {canvasFields && draggingComponent?.fieldOwner === "me" && (
        <UserItems
          onClose={() => setCanvasFields(false)}
          onAdd={(value) => {
            if (selectedFieldForDialog) {
              updateField(value.value, selectedFieldForDialog.id);
            }
          }}
          component={selectedFieldForDialog}
        />
      )}
      {canvasFields && isSigningMode && draggingComponent?.fieldOwner !== "me" && (
        <RecipientItems
          component={draggingComponent as DroppingField}
          value={selectedFieldForDialog?.data ?? null}
          onAdd={(value) => {
            if (selectedFieldForDialog) {
              updateField(value.value, selectedFieldForDialog.id);
            }
          }}
          onClose={() => setCanvasFields(false)}
        />
      )}
      {!isSigningMode && !isReadOnly && (
        <>
          {showAddRecipients && (
            <AddRecipientModal
              isOpen={showAddRecipients}
              onClose={() => setShowAddRecipients(false)}
              recipients={recipients}
              onRecipientsChange={setRecipients}
              isTemplateRoleMode={isTemplateEditor}
            />
          )}

          {!isTemplateEditor && showSendDocument && (
            <SendDocumentModal
              isOpen={showSendDocument}
              onClose={() => setShowSendDocument(false)}
              recipients={recipients}
              fields={droppedComponents}
              serializeFields={serializeFields}
              documentName={documentName}
              documentId={documentId}
              setRecipients={setRecipients}
              onSendComplete={onSendComplete}
            />
          )}
        </>
      )}
    </>
  );
};

export default EditorDialogs;
