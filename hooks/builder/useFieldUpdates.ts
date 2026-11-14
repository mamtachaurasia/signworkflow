"use client";
import { useCallback } from 'react';
import { DroppedComponent, Recipient } from '@/types/types';
import { validateFieldValue } from '@/lib/field-rules';
import { formatForPicker, normalizeDateFormat } from '@/lib/date-formats';
import { estimateAutoFieldDimensions, fitFieldWithinPageBounds } from '@/utils/builder/fieldLayout';

interface UseFieldUpdatesArgs {
  isSigningMode: boolean;
  recipients: Recipient[];
  setDroppedComponents: React.Dispatch<React.SetStateAction<DroppedComponent[]>>;
  saveState: (newState: DroppedComponent[]) => void;
  documentRef: React.RefObject<HTMLDivElement | null>;
  pageRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  zoom: number;
}

export const useFieldUpdates = ({
  isSigningMode,
  recipients,
  setDroppedComponents,
  saveState,
  documentRef,
  pageRefs,
  zoom,
}: UseFieldUpdatesArgs) => {
  const resolvePageBounds = useCallback((field: DroppedComponent) => {
    const canvas = documentRef.current;
    if (!canvas) return null;
    const pageIndex = Math.max(0, (field.pageNumber ?? 1) - 1);
    const pageEl = pageRefs.current[pageIndex];
    if (!pageEl) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    const safeZoom = zoom > 0 ? zoom : 1;

    return {
      left: (pageRect.left - canvasRect.left) / safeZoom,
      top: (pageRect.top - canvasRect.top) / safeZoom,
      width: pageRect.width / safeZoom,
      height: pageRect.height / safeZoom,
      pageRect,
    };
  }, [documentRef, pageRefs, zoom]);

  const normalizeUpdatedValue = useCallback((field: DroppedComponent, nextValue: string | null): string | null => {
    if (nextValue === null) return null;
    let normalized = String(nextValue);
    if (typeof field.settings?.maxLength === 'number' && field.settings.maxLength >= 0) {
      normalized = normalized.slice(0, field.settings.maxLength);
    }
    if (typeof field.settings?.maxLines === 'number' && field.settings.maxLines > 0) {
      normalized = normalized.split(/\r\n|\r|\n/).slice(0, field.settings.maxLines).join('\n');
    }
    return normalized;
  }, []);

  const updateField = useCallback((data: string | null, id: number) => {
    setDroppedComponents(prev => {
      const newComponents = prev.map(c => {
        if (c.id === id) {
          const nextValue = normalizeUpdatedValue(c, data);
          const nextValueString = nextValue === null ? '' : String(nextValue);
          const isDateField = c.component === 'Date';
          const normalizedDateValue =
            isDateField && nextValueString.trim().length > 0
              ? formatForPicker(nextValueString, normalizeDateFormat(c.settings?.dateFormat)) ||
                nextValueString
              : nextValueString;
          const defaultCapable = ['Text', 'Full Name', 'Email', 'Date', 'Dropdown', 'Radio'].includes(c.component);
          const isRecipientDateField =
            c.component === 'Date' && (c.fieldOwner ?? 'recipients') === 'recipients';
          const shouldAutoSyncDefault =
            !isSigningMode &&
            defaultCapable &&
            !isRecipientDateField;
          const nextSettings = shouldAutoSyncDefault
            ? {
                ...(c.settings || {}),
                defaultValue: isDateField ? normalizedDateValue : nextValueString,
              }
            : c.settings;
          const nextDataValue =
            nextValue === null ? null : isDateField ? normalizedDateValue : nextValue;
          const nextSize = estimateAutoFieldDimensions(
            {
              ...c,
              settings: nextSettings,
            },
            nextDataValue
          );
          const nextComponent = { ...c, ...nextSize, settings: nextSettings };
          const pageBounds = resolvePageBounds(nextComponent);

          let nextX = nextComponent.x;
          let nextY = nextComponent.y;
          let nextWidth = nextComponent.width;
          let nextHeight = nextComponent.height;
          let nextPageRect = nextComponent.pageRect;

          if (pageBounds) {
            const fittedField = fitFieldWithinPageBounds(nextComponent, pageBounds);
            nextX = fittedField.x;
            nextY = fittedField.y;
            nextWidth = fittedField.width;
            nextHeight = fittedField.height;
            nextPageRect = fittedField.pageRect;
          }

          const result = validateFieldValue({
            component: c.component,
            required: c.required,
            value: nextDataValue,
            settings: nextSettings,
          });
          return {
            ...c,
            x: nextX,
            y: nextY,
            width: Math.round(nextWidth),
            height: Math.round(nextHeight),
            pageRect: nextPageRect,
            settings: nextSettings,
            data: nextDataValue,
            hasError: !result.valid,
          };
        }
        const recipient = recipients.find(r => r.id === c.assignedRecipientId);
        if (recipient && recipient.status === 'signed') {
          const prevComponent = prev.find(pc => pc.id === c.id);
          if (prevComponent && prevComponent.data) {
            return { ...c, data: prevComponent.data };
          }
        }
        return c;
      });
      saveState(newComponents);
      return newComponents;
    });
  }, [isSigningMode, normalizeUpdatedValue, recipients, resolvePageBounds, saveState, setDroppedComponents]);

  return {
    updateField,
  };
};
