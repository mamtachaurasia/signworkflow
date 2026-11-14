"use client";
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { getFieldTypeFromComponentLabel } from '@/lib/api';
import { normalizeComponentSettings } from '@/utils/builder/documentFields';
import {
  Doc,
  DocumentField,
  DroppedComponent,
  Recipient,
  SigningViewDocument,
} from '@/types/types';

interface UseSenderPreviewArgs {
  selectedFile: File | string | Doc | null;
  initialFileUrl?: string | null;
  droppedComponents: DroppedComponent[];
  recipients: Recipient[];
  documentId: string | null;
  documentName: string;
  initialDocumentName?: string | null;
  documentStatus: string | null;
  currentPage: number;
  onPreviewError?: (message: string) => void;
}

const toPreviewFields = (
  components: DroppedComponent[],
  currentPage: number
): DocumentField[] => {
  const defaultValueCapableComponents = new Set(['Text', 'Full Name', 'Email', 'Date', 'Dropdown', 'Radio']);

  return components.map((component) => {
    const normalizedSettings = normalizeComponentSettings(component.component, component.settings);
    const isRecipientDateField =
      component.component === 'Date' && (component.fieldOwner ?? 'recipients') === 'recipients';
    const rawValue =
      component.data === null || component.data === undefined
        ? ''
        : String(component.data);
    const configuredDefault = String(normalizedSettings?.defaultValue || '').trim();
    const shouldPromoteTypedValueToDefault =
      defaultValueCapableComponents.has(component.component) &&
      !isRecipientDateField &&
      rawValue.length > 0 &&
      configuredDefault.length === 0;
    const settings = shouldPromoteTypedValueToDefault
      ? {
          ...(normalizedSettings || {}),
          defaultValue: rawValue,
        }
      : normalizedSettings;
    const sanitizedSettings =
      isRecipientDateField && settings
        ? (() => {
            const rest = { ...settings };
            delete rest.defaultValue;
            return Object.keys(rest).length > 0 ? rest : undefined;
          })()
        : settings;
    const effectiveDefault = isRecipientDateField
      ? ''
      : String(settings?.defaultValue || '').trim();
    const value =
      defaultValueCapableComponents.has(component.component) &&
      !isRecipientDateField &&
      effectiveDefault.length > 0 &&
      rawValue.length === 0
        ? effectiveDefault
        : rawValue;

    return {
      id: component.fieldId ?? String(component.id),
      type: getFieldTypeFromComponentLabel(component.component) as DocumentField['type'],
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height,
      pageNumber: component.pageNumber ?? currentPage,
      recipientId: component.assignedRecipientId,
      required: component.required !== false,
      value,
      placeholder: component.placeholder,
      settings: sanitizedSettings,
      mimeType: component.mimeType,
      pageRect: component.pageRect,
      fieldOwner: component.fieldOwner,
    };
  });
};

const normalizeRecipients = (recipients: Recipient[]): Recipient[] =>
  recipients.map((recipient, index) => ({
    ...recipient,
    status: recipient.status ?? 'pending',
    order: typeof recipient.order === 'number' ? recipient.order : index + 1,
  }));

const pickPreviewRecipient = (
  fields: DocumentField[],
  recipients: Recipient[]
): Recipient | null => {
  const fieldCountByRecipient = new Map<string, number>();
  fields.forEach((field) => {
    if (!field.recipientId) return;
    fieldCountByRecipient.set(
      field.recipientId,
      (fieldCountByRecipient.get(field.recipientId) ?? 0) + 1
    );
  });

  return (
    recipients.find((recipient) => {
      if (recipient.isCC || recipient.role === 'viewer') return false;
      return (fieldCountByRecipient.get(recipient.id) ?? 0) > 0;
    }) ??
    recipients.find((recipient) => !recipient.isCC && recipient.role !== 'viewer') ??
    recipients.find((recipient) => (fieldCountByRecipient.get(recipient.id) ?? 0) > 0) ??
    recipients[0] ??
    null
  );
};

export const useSenderPreview = ({
  selectedFile,
  initialFileUrl = null,
  droppedComponents,
  recipients,
  documentId,
  documentName,
  initialDocumentName = null,
  documentStatus,
  currentPage,
  onPreviewError,
}: UseSenderPreviewArgs) => {
  const [isSenderPreviewOpen, setIsSenderPreviewOpen] = useState(false);
  const [senderPreviewDocument, setSenderPreviewDocument] =
    useState<SigningViewDocument | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const previewSourceFileRef = useRef<File | null>(null);

  const resolvePreviewFileUrl = useCallback((): string | null => {
    if (typeof selectedFile === 'string') {
      return selectedFile;
    }
    if (
      selectedFile &&
      typeof selectedFile === 'object' &&
      'fileUrl' in selectedFile &&
      typeof selectedFile.fileUrl === 'string'
    ) {
      return selectedFile.fileUrl;
    }
    if (selectedFile instanceof File) {
      if (previewObjectUrlRef.current && previewSourceFileRef.current === selectedFile) {
        return previewObjectUrlRef.current;
      }
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
      previewSourceFileRef.current = selectedFile;
      previewObjectUrlRef.current = URL.createObjectURL(selectedFile);
      return previewObjectUrlRef.current;
    }
    previewSourceFileRef.current = null;
    return initialFileUrl;
  }, [initialFileUrl, selectedFile]);

  const buildPreviewDocument = useCallback((): SigningViewDocument | null => {
    const fileUrl = resolvePreviewFileUrl();
    if (!fileUrl) {
      return null;
    }

    const previewFields = toPreviewFields(droppedComponents, currentPage);
    const previewRecipients = normalizeRecipients(recipients);
    const previewRecipient = pickPreviewRecipient(previewFields, previewRecipients);

    return {
      id: documentId ?? 'preview-document',
      fileUrl,
      name: documentName || initialDocumentName || 'Document Preview',
      fields: previewFields,
      recipients: previewRecipients,
      currentRecipientId: previewRecipient?.id,
      currentRecipient: previewRecipient ?? undefined,
      status: documentStatus ?? 'sent',
    };
  }, [
    currentPage,
    documentId,
    documentName,
    documentStatus,
    droppedComponents,
    initialDocumentName,
    recipients,
    resolvePreviewFileUrl,
  ]);

  const openSenderPreview = useCallback(() => {
    const nextPreviewDocument = buildPreviewDocument();
    if (!nextPreviewDocument) {
      onPreviewError?.('No document file available to preview.');
      return;
    }

    setSenderPreviewDocument(nextPreviewDocument);
    setIsSenderPreviewOpen(true);
  }, [buildPreviewDocument, onPreviewError]);

  const closeSenderPreview = useCallback(() => {
    setIsSenderPreviewOpen(false);
  }, []);

  useEffect(() => {
    if (!isSenderPreviewOpen) {
      return;
    }

    const nextPreviewDocument = buildPreviewDocument();
    if (!nextPreviewDocument) {
      return;
    }

    startTransition(() => {
      setSenderPreviewDocument(nextPreviewDocument);
    });
  }, [buildPreviewDocument, isSenderPreviewOpen]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      previewSourceFileRef.current = null;
    };
  }, []);

  return {
    isSenderPreviewOpen,
    senderPreviewDocument,
    openSenderPreview,
    closeSenderPreview,
  };
};
