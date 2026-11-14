"use client";
import { useEffect } from 'react';
import { DroppedComponent, Doc, Recipient } from '@/types/types';
import { getFieldTypeFromComponentLabel } from '@/lib/api';
import { serializePageRect } from '@/utils/builder/pageRect';
import { buildDraftKey } from '@/utils/builder/documentDraft';
import { normalizeComponentSettings } from '@/utils/builder/documentFields';

interface UseDocumentDraftArgs {
  documentId: string | null;
  droppedComponents: DroppedComponent[];
  recipients: Recipient[];
  documentName: string;
  selectedFile: File | string | Doc | null;
  currentPage: number;
  zoom: number;
  documentRef: React.RefObject<HTMLDivElement | null>;
  pageRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  isPreviewOnly: boolean;
}

export const useDocumentDraft = ({
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
}: UseDocumentDraftArgs) => {
  useEffect(() => {
    if (isPreviewOnly || !documentId) return;

    const timeout = setTimeout(() => {
      const draftKey = buildDraftKey(documentId);
      const isQuotaExceeded = (error: unknown) => {
        if (!error || typeof error !== 'object') return false;
        const maybeDom = error as DOMException;
        return (
          maybeDom.name === 'QuotaExceededError' ||
          maybeDom.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          maybeDom.name === 'QUOTA_EXCEEDED_ERR'
        );
      };

      const canvasRect = documentRef.current?.getBoundingClientRect();
      const fields = droppedComponents.map(c => ({
          id: c.fieldId ?? c.id?.toString(),
          type: getFieldTypeFromComponentLabel(c.component || ''),
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
          pageNumber: c.pageNumber,
          pageRect: serializePageRect(
            pageRefs.current[(c.pageNumber ?? currentPage) - 1]?.getBoundingClientRect() ?? c.pageRect,
            canvasRect,
            zoom
          ),
          recipientId: c.assignedRecipientId,
          required: c.required,
          value: c.data,
          placeholder: c.placeholder,
          settings: normalizeComponentSettings(c.component, c.settings),
          fieldOwner: c.fieldOwner,
          fieldId: c.fieldId ?? c.id?.toString(),
        }));

      const payload = {
        fields,
        recipients,
        documentName,
        fileUrl: typeof selectedFile === 'string' ? selectedFile : null,
        updatedAt: new Date().toISOString(),
      };

      const writeDraft = (nextPayload: typeof payload) => {
        sessionStorage.setItem(draftKey, JSON.stringify(nextPayload));
        return true;
      };

      try {
        writeDraft(payload);
      } catch (error) {
        if (!isQuotaExceeded(error)) {
          console.error(error);
          return;
        }

        // Retry with a slimmer payload: drop pageRect and large field values.
        const largeValueTypes = new Set([
          'signature',
          'initials',
          'stamp',
          'image',
          'live_photo',
          'live photo',
          'live-photo',
        ]);
        const slimFields = fields.map(field => {
          const fieldType = String(field.type || '').toLowerCase();
          return {
          ...field,
          pageRect: undefined,
          value: largeValueTypes.has(fieldType) ? null : field.value,
        };
        });

        try {
          writeDraft({ ...payload, fields: slimFields });
        } catch (retryError) {
          if (!isQuotaExceeded(retryError)) {
            console.error(retryError);
            return;
          }
          // Final fallback: drop recipients to shrink further.
          try {
            writeDraft({ ...payload, fields: slimFields, recipients: [] });
          } catch (finalError) {
            if (!isQuotaExceeded(finalError)) {
              console.error(finalError);
            }
          }
        }
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [
    droppedComponents,
    recipients,
    documentName,
    selectedFile,
    documentId,
    isPreviewOnly,
    currentPage,
    zoom,
    documentRef,
    pageRefs,
  ]);
};
