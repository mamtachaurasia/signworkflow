"use client";
import { useCallback, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { DraggableData } from 'react-rnd';
import { blobToURL } from '@/lib/pdf';
import { DroppedComponent, DroppingField, FieldOwner, Recipient, SignatureInitial, User } from '@/types/types';
import {
  ensureFourDigitYearFormat,
  formatForPicker,
  getLocalIsoDate,
  normalizeDateFormat,
} from '@/lib/date-formats';
import { validateFieldValue, getEffectiveFieldValue } from '@/lib/field-rules';

interface UseFieldInteractionsArgs {
  isSigningMode: boolean;
  currentPage: number;
  zoom: number;
  user: User | null;
  defaultDateFormat?: string;
  defaults: {
    signature?: SignatureInitial | null;
    initial?: SignatureInitial | null;
    stamp?: SignatureInitial | null;
  };
  recipients: Recipient[];
  setRecipients: React.Dispatch<React.SetStateAction<Recipient[]>>;
  draggingComponent: DroppingField | null;
  setDraggingComponent: React.Dispatch<React.SetStateAction<DroppingField | null>>;
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  elementId: number;
  setElementId: React.Dispatch<React.SetStateAction<number>>;
  setDroppedComponents: React.Dispatch<React.SetStateAction<DroppedComponent[]>>;
  droppedComponents: DroppedComponent[];
  saveState: (components: DroppedComponent[]) => void;
  documentRef: React.RefObject<HTMLDivElement | null>;
  pageRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  setSelectedFieldId: React.Dispatch<React.SetStateAction<number | null>>;
  setSelectedFieldForDialog: React.Dispatch<React.SetStateAction<DroppedComponent | null>>;
  setCanvasFields: React.Dispatch<React.SetStateAction<boolean>>;
  setPhotoDialog: React.Dispatch<React.SetStateAction<boolean>>;
  imageRef: React.RefObject<HTMLInputElement | null>;
}

export const useFieldInteractions = ({
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
}: UseFieldInteractionsArgs) => {
  const pendingImageUploadFieldIdRef = useRef<number | null>(null);
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

  const resolvePageBounds = useCallback((pageIndex: number) => {
    const canvas = documentRef.current;
    const pageEl = pageRefs.current[pageIndex];
    if (!canvas || !pageEl) return null;

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

  const getDefaultComponentDimensions = useCallback((component: string): { width: number; height: number } => {
    switch (component) {
      case 'Checkbox':
        return { width: 320, height: 90 };
      case 'Radio':
        return { width: 280, height: 140 };
      default:
        return { width: 100, height: 50 };
    }
  }, []);

  const getDefaultComponentSettings = useCallback((component: string) => {
    if (component === 'Radio') {
      return {
        options: ['Option 1', 'Option 2'],
      };
    }
    if (component === 'Text') {
      return undefined;
    }
    if (component === 'Email') {
      return {
        inputType: 'email' as const,
        multiline: false,
      };
    }
    if (component === 'Full Name') {
      return {
        multiline: false,
      };
    }
    return undefined;
  }, []);

  const getDefaultPlaceholder = useCallback((component: string): string | undefined => {
    if (component === 'Text') return 'Enter text';
    if (component === 'Full Name') return 'Enter full name';
    return undefined;
  }, []);

  const isPaletteDrag = useCallback(
    (candidate: DroppingField | null) => {
      if (!candidate) return false;
      const candidateId = (candidate as unknown as { id?: unknown }).id;
      return typeof candidateId !== 'number';
    },
    []
  );

  const handleDragStart = useCallback(() => {
    document.body.classList.add('dragging-no-select');
  }, []);

  const mouseDownOnField = useCallback(
    (component: string, e: ReactMouseEvent<HTMLDivElement>, fieldOwner: FieldOwner) => {
      const xy = { x: e.clientX, y: e.clientY };
      let data: string | null | undefined;
      if (fieldOwner === 'me') {
        if (component === 'Full Name') {
          data = user?.name;
        }
        if (component === 'Email') {
          data = user?.email;
        }
        if (component === 'Initials') {
          data = defaults.initial?.value || user?.name?.split(' ').map(n => n[0]).join('').toUpperCase();
        } else if (component === 'Signature') {
          data = defaults.signature?.value;
        }
        if (component === 'Date') {
          const iso = getLocalIsoDate();
          const fallbackFormat = defaultDateFormat || 'DD/MM/YYYY (EU)';
          data = formatForPicker(iso, normalizeDateFormat(fallbackFormat)) || iso;
        }
      }
      setDraggingComponent({ component, ...xy, fieldOwner, data: data ?? null });
      setPosition(xy);
      handleDragStart();
    },
    [defaultDateFormat, defaults, handleDragStart, setDraggingComponent, setPosition, user]
  );

  const mouseMoveOnDropArea = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPaletteDrag(draggingComponent)) return;
    setPosition({ x: e.clientX - 65, y: e.clientY });
  }, [draggingComponent, isPaletteDrag, setPosition]);

  const clickOnDropArea = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (isSigningMode) {
      return;
    }
    const droppingFromPalette = isPaletteDrag(draggingComponent);
    const sourceField = !droppingFromPalette && draggingComponent
      ? (draggingComponent as Partial<DroppedComponent>)
      : null;
    if (
      !draggingComponent ||
      (e.target instanceof HTMLElement && e.target.closest('.react-draggable')) ||
      (e.target instanceof HTMLElement && e.target?.closest('.page-brake'))
    ) {
      return;
    }

    const rect = documentRef.current?.getBoundingClientRect();
    if (!rect) return;
    let targetPageNumber = currentPage;
    const dropY = e.clientY;
    let pageRect: DOMRect | null = null;
    let targetPageIndex = Math.max(0, currentPage - 1);
    for (let i = 0; i < pageRefs.current.length; i++) {
      const pageEl = pageRefs.current[i];
      if (!pageEl) continue;

      pageRect = pageEl.getBoundingClientRect();
      if (dropY >= pageRect.top && dropY <= pageRect.bottom) {
        targetPageNumber = i + 1;
        targetPageIndex = i;
        break;
      }
    }
    const defaultDimensions = getDefaultComponentDimensions(draggingComponent.component);
    const width = typeof sourceField?.width === 'number' ? sourceField.width : defaultDimensions.width;
    const height = typeof sourceField?.height === 'number' ? sourceField.height : defaultDimensions.height;
    const rawX = (e.clientX - rect.left) / zoom;
    const rawY = (e.clientY - rect.top) / zoom;
    const targetBounds = resolvePageBounds(targetPageIndex);
    const x = targetBounds
      ? clamp(rawX, targetBounds.left, targetBounds.left + Math.max(0, targetBounds.width - width))
      : rawX;
    const y = targetBounds
      ? clamp(rawY, targetBounds.top, targetBounds.top + Math.max(0, targetBounds.height - height))
      : rawY;

    // seed initial value and settings for the new field
    let initialData: DroppedComponent['data'] =
      sourceField?.data !== undefined ? sourceField.data : draggingComponent.data;
    let initialSettings: DroppedComponent['settings'] =
      sourceField?.settings ?? getDefaultComponentSettings(draggingComponent.component);
    const effectiveFieldOwner = sourceField?.fieldOwner ?? draggingComponent.fieldOwner ?? 'recipients';

    if (draggingComponent.component === 'Date') {
      const fallbackFormat = defaultDateFormat || 'DD/MM/YYYY (EU)';
      const rawFormat =
        initialSettings && 'dateFormat' in initialSettings && initialSettings.dateFormat
          ? initialSettings.dateFormat
          : fallbackFormat;
      const normalizedFormat = ensureFourDigitYearFormat(rawFormat);
      const pickerFormat = normalizeDateFormat(normalizedFormat);
      initialSettings = {
        ...(initialSettings || {}),
        dateFormat: normalizedFormat,
      };

      if (typeof initialData === 'string' && initialData.trim().length > 0) {
        const normalizedData = formatForPicker(initialData, pickerFormat);
        if (normalizedData) {
          initialData = normalizedData;
        }
      }

      // When a Date field is first dropped for the sender ("me"), seed it with today's date.
      if (
        effectiveFieldOwner === 'me' &&
        (initialData === null || initialData === undefined || String(initialData).trim() === '')
      ) {
        const iso = getLocalIsoDate();
        initialData = formatForPicker(iso, pickerFormat) || iso;
      }
    }

    const newComponent: DroppedComponent = {
      width,
      height,
      id: elementId,
      fieldId: String(elementId),
      component: draggingComponent.component,
      x,
      y,
      pageNumber: targetPageNumber,
      pageRect: targetBounds?.pageRect ?? pageRect,
      fieldOwner: sourceField?.fieldOwner ?? draggingComponent.fieldOwner,
      data: initialData ?? null,
      settings: initialSettings,
      assignedRecipientId: sourceField?.assignedRecipientId,
      required: sourceField?.required !== false,
      placeholder: sourceField?.placeholder ?? getDefaultPlaceholder(draggingComponent.component),
      mimeType: sourceField?.mimeType,
    };

    setDroppedComponents((prev) => {
      const newComponents = [...prev, newComponent].map(c => {
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
    setElementId((id) => id + 1);
    // Keep palette selection active to allow consecutive placement without reselecting.
    setDraggingComponent((previous) => {
      if (!previous) return previous;
      if (!isPaletteDrag(previous)) return null;
      return {
        ...previous,
        x: e.clientX,
        y: e.clientY,
      };
    });
  }, [currentPage, defaultDateFormat, documentRef, draggingComponent, elementId, isSigningMode, isPaletteDrag, pageRefs, recipients, saveState, setDroppedComponents, setElementId, setDraggingComponent, zoom, getDefaultComponentDimensions, getDefaultPlaceholder, getDefaultComponentSettings, resolvePageBounds]);

  const handleDeleteField = useCallback((item: DroppedComponent) => {
    setDroppedComponents((prev) => {
      const newComponents = prev.filter((c) => c.id !== item.id);
      saveState(newComponents);
      return newComponents;
    });
    setSelectedFieldId(null);
  }, [saveState, setDroppedComponents, setSelectedFieldId]);

  const handleDuplicateField = useCallback((item: DroppedComponent) => {
    const newComponent: DroppedComponent = {
      ...item,
      id: elementId,
      fieldId: String(elementId),
      repeatGroupId: undefined,
      repeatSourceId: undefined,
      x: item.x + 20,
      y: item.y + 20,
      assignedRecipientId: item.assignedRecipientId
    };

    setDroppedComponents((prev) => {
      const newComponents = [...prev, newComponent].map(c => {
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
    setElementId((id) => id + 1);
    setSelectedFieldId(newComponent.id);
  }, [elementId, recipients, saveState, setDroppedComponents, setElementId, setSelectedFieldId]);

  const handleAssignRecipient = useCallback((fieldId: number, recipientId: string | null) => {
    let previousRecipientId: string | null | undefined;

    const newComponents = droppedComponents.map((c) => {
      if (c.id === fieldId) {
        const previousRecipient = recipients.find(r => r.id === c.assignedRecipientId);
        previousRecipientId = c.assignedRecipientId;
        const recipient = recipients.find(r => r.id === recipientId);
        let data = c.data;
        if (c.component === 'Email' && c.fieldOwner === 'recipients') {
          const isCurrentlyEmpty = !c.data;
          const isOldRecipientEmail = previousRecipient && c.data === previousRecipient.email;
          if (isCurrentlyEmpty || isOldRecipientEmail) {
            data = recipient ? recipient.email : '';
          }
        }
        const next = { ...c, assignedRecipientId: recipientId, data } as DroppedComponent;
        const effectiveValue = getEffectiveFieldValue({
          component: next.component,
          required: next.required,
          value: next.data,
          settings: next.settings,
        });
        const validation = validateFieldValue({
          component: next.component,
          required: next.required,
          value: effectiveValue,
          settings: next.settings,
        });
        return { ...next, hasError: !validation.valid };
      }
      return c;
    });

    setRecipients((prevRecipients) =>
      prevRecipients.map((r) => {
        const assignedCount = newComponents.filter(
          (c) => c.assignedRecipientId === r.id
        ).length;

        const shouldResetStatus =
          recipientId !== null &&
          r.id === recipientId &&
          (r.status === 'signed' || r.status === 'approved') &&
          previousRecipientId !== recipientId;

        if (shouldResetStatus) {
          return {
            ...r,
            totalFields: assignedCount,
            status: 'pending',
          };
        }

        return {
          ...r,
          totalFields: assignedCount,
          status: r.status,
        };
      })
    );

    const finalComponents = newComponents.map((c) => {
      const recipient = recipients.find(r => r.id === c.assignedRecipientId);
      if (recipient && (recipient.status === 'signed' || recipient.status === 'approved')) {
        const prevComponent = droppedComponents.find((pc) => pc.id === c.id);
        if (prevComponent && prevComponent.data) {
          return { ...c, data: prevComponent.data };
        }
      }
      return c;
    });

    setDroppedComponents(finalComponents);
    saveState(finalComponents);
  }, [droppedComponents, recipients, saveState, setDroppedComponents, setRecipients]);

  const handleDragStop = useCallback((e: MouseEvent | TouchEvent, item: DroppedComponent, data: DraggableData) => {
    document.body.classList.remove('dragging-no-select');
    if ((e.target as HTMLElement).closest('.delete-button-wrapper')) {
      return;
    }

    if (data.x === item.x && data.y === item.y) {
      return;
    }

    e.stopPropagation();
    const fieldMidY = data.y + item.height / 2;
    let targetPageIndex = Math.max(0, (item.pageNumber ?? 1) - 1);
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < pageRefs.current.length; i++) {
      const bounds = resolvePageBounds(i);
      if (!bounds) continue;
      const pageTop = bounds.top;
      const pageBottom = bounds.top + bounds.height;
      if (fieldMidY >= pageTop && fieldMidY <= pageBottom) {
        targetPageIndex = i;
        bestDistance = 0;
        break;
      }
      const distance = fieldMidY < pageTop ? pageTop - fieldMidY : fieldMidY - pageBottom;
      if (distance < bestDistance) {
        bestDistance = distance;
        targetPageIndex = i;
      }
    }

    const targetBounds = resolvePageBounds(targetPageIndex);
    if (!targetBounds) return;

    const maxX = targetBounds.left + Math.max(0, targetBounds.width - item.width);
    const maxY = targetBounds.top + Math.max(0, targetBounds.height - item.height);
    const newX = clamp(data.x, targetBounds.left, maxX);
    const newY = clamp(data.y, targetBounds.top, maxY);
    const newPageNumber = targetPageIndex + 1;

    setDroppedComponents(prev => {
      const newComponents = prev.map(c =>
        c.id === item.id
          ? { ...c, x: newX, y: newY, pageNumber: newPageNumber, pageRect: targetBounds.pageRect }
          : c
      );
      saveState(newComponents);
      return newComponents;
    }
    );
  }, [pageRefs, resolvePageBounds, saveState, setDroppedComponents]);

  const handleResizeStop = useCallback((e: MouseEvent | TouchEvent, item: DroppedComponent, ref: { style: { width: string; height: string } }, pos: { x: number, y: number }) => {
    document.body.classList.remove('dragging-no-select');
    e.stopPropagation();
    const rawWidth = Number.parseFloat(ref.style.width);
    const rawHeight = Number.parseFloat(ref.style.height);
    const minWidth = 24;
    const minHeight = 24;
    let nextX = pos.x;
    let nextY = pos.y;
    let nextWidth = Number.isFinite(rawWidth) ? Math.max(minWidth, rawWidth) : item.width;
    let nextHeight = Number.isFinite(rawHeight) ? Math.max(minHeight, rawHeight) : item.height;
    let nextPageRect: DOMRect | null = null;

    const targetPageIndex = Math.max(0, (item.pageNumber ?? 1) - 1);
    const targetBounds = resolvePageBounds(targetPageIndex);
    if (targetBounds) {
      const maxX = targetBounds.left + targetBounds.width;
      const maxY = targetBounds.top + targetBounds.height;
      nextX = clamp(nextX, targetBounds.left, Math.max(targetBounds.left, maxX - minWidth));
      nextY = clamp(nextY, targetBounds.top, Math.max(targetBounds.top, maxY - minHeight));
      nextWidth = Math.min(nextWidth, Math.max(minWidth, maxX - nextX));
      nextHeight = Math.min(nextHeight, Math.max(minHeight, maxY - nextY));
      nextPageRect = targetBounds.pageRect;
    }

    setDroppedComponents((prev) => {
      const newComponents = prev.map((c) =>
        c.id === item.id
          ? {
            ...c,
            x: nextX,
            y: nextY,
            width: Math.round(nextWidth),
            height: Math.round(nextHeight),
            pageRect: nextPageRect ?? c.pageRect ?? null,
          }
          : c
      );
      saveState(newComponents);
      return newComponents;
    });
  }, [resolvePageBounds, saveState, setDroppedComponents]);

  const mouseLeaveOnDropArea = useCallback(() => {
    document.body.classList.remove('dragging-no-select');
  }, []);

  const clickField = useCallback((event: ReactMouseEvent<Element>, item: DroppedComponent) => {
    event.stopPropagation();
    const paletteModeActive = isPaletteDrag(draggingComponent);
    if (!paletteModeActive) {
      setDraggingComponent(item);
    }

    if (!isSigningMode && item.fieldOwner == 'recipients') {
      return;
    }

    switch (item.component) {
      case "Image":
        setSelectedFieldForDialog(item);
        pendingImageUploadFieldIdRef.current = item.id;
        imageRef.current?.click();
        break;
      case "Stamp":
      case "Signature":
      case "Initials":
        setSelectedFieldForDialog(item);
        setCanvasFields(true);
        break;
      case "Text":
      case "Full Name":
      case "Date":
      case "Email":
      case "Checkbox":
      case "Dropdown":
      case "Radio":
        setSelectedFieldForDialog(item);
        break;
      case "Live Photo":
        setSelectedFieldForDialog(item);
        setPhotoDialog(true);
        break;
      default:
        console.warn("Unknown component clicked:", item.component);
    }
  }, [draggingComponent, imageRef, isPaletteDrag, isSigningMode, setCanvasFields, setDraggingComponent, setPhotoDialog, setSelectedFieldForDialog]);

  const onImgUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await blobToURL(file);
    const targetFieldId =
      pendingImageUploadFieldIdRef.current ??
      (draggingComponent && 'id' in draggingComponent ? draggingComponent.id : null);

    if (typeof targetFieldId === 'number') {
      setDroppedComponents(prev => {
        const newComponents = prev.map(comp => {
          if (comp.id === targetFieldId) {
            return {
              ...comp,
              data: url,
              mimeType: file.type || comp.mimeType,
            };
          }
          const recipient = recipients.find(r => r.id === comp.assignedRecipientId);
          if (recipient && recipient.status === 'signed') {
            const prevComponent = prev.find(pc => pc.id === comp.id);
            if (prevComponent && prevComponent.data) {
              return { ...comp, data: prevComponent.data };
            }
          }
          return comp;
        });
        saveState(newComponents);
        return newComponents;
      });
    }

    pendingImageUploadFieldIdRef.current = null;
    e.target.value = '';
  }, [draggingComponent, recipients, saveState, setDroppedComponents]);

  const handleSelectField = useCallback((field: DroppedComponent) => {
    setDraggingComponent((previous) => {
      if (isPaletteDrag(previous)) {
        return previous;
      }
      return field;
    });
  }, [isPaletteDrag, setDraggingComponent]);

  return {
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
  };
};
