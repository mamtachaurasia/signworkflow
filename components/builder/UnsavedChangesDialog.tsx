'use client';
import { useState, type ReactNode } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import { Modal } from '@ui';

interface UnsavedChangesDialogProps {
  isVisible: boolean;
  onCancel: () => void;
  onSaveAndContinue: () => void | Promise<void>;
  title?: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onDiscard?: () => void;
  confirmClass?: string;
  cancelClass?: string;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  saving?: boolean;
}

export function UnsavedChangesDialog({
  isVisible,
  onCancel,
  onSaveAndContinue,
  title = 'Unsaved Changes',
  message,
  confirmLabel = 'Save and continue',
  cancelLabel = 'Cancel',
  onDiscard,
  confirmClass,
  cancelClass,
  confirmDisabled,
  cancelDisabled,
  saving = false,
}: UnsavedChangesDialogProps) {
  const [internalSaving, setInternalSaving] = useState(false);
  const isSaving = saving || internalSaving;

  const handleConfirm = async () => {
    if (isSaving) return;
    setInternalSaving(true);
    try {
      await onSaveAndContinue();
    } finally {
      setInternalSaving(false);
    }
  };

  return (
    <Modal
      visible={isVisible}
      title={title}
      onClose={() => {
        if (!isSaving) onCancel();
      }}
      handleCancel={onDiscard ?? onCancel}
      handleConfirm={handleConfirm}
      confirmLabel={isSaving ? 'Saving…' : confirmLabel}
      cancelLabel={cancelLabel}
      confirmClass={confirmClass}
      cancelClass={cancelClass}
      confirmDisabled={confirmDisabled || isSaving}
      cancelDisabled={cancelDisabled || isSaving}
      confirmIcon={isSaving
        ? <LoaderCircle className="h-4 w-4 animate-spin" />
        : <Save className="h-4 w-4" />}
      closeOnBackdrop={!isSaving}
    >
      {message ?? (
        <>
          <p>You have unsaved changes.</p>
          <p>Please save your changes before sending the document to recipient(s).</p>
        </>
      )}
    </Modal>
  );
}
