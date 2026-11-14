"use client";
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DocumentField, DocumentFieldType, DroppedComponent } from '@/types/types';
import { dedupeFieldsById, mapFieldToDroppedComponent, normalizeComponentSettings } from '@/utils/builder/documentFields';
import { areDroppedComponentsEqual } from '@/utils/comparison';
import { getFieldTypeFromComponentLabel } from '@/lib/api';
import { useBuilderStore } from '@/hooks/useBuilderStore';

interface UseDroppedComponentsStateArgs {
  isSigningMode: boolean;
  initialFields: DocumentField[] | null;
  onFieldsChange?: (fields: DocumentField[]) => void;
}

const mapDroppedComponentToDocumentField = (comp: DroppedComponent): DocumentField => ({
  id: comp.fieldId ?? String(comp.id),
  repeatGroupId: comp.repeatGroupId,
  repeatSourceId: comp.repeatSourceId,
  type: getFieldTypeFromComponentLabel(comp.component) as DocumentFieldType,
  x: comp.x,
  y: comp.y,
  width: comp.width,
  height: comp.height,
  pageNumber: comp.pageNumber as number,
  recipientId: comp.assignedRecipientId,
  required: comp.required !== undefined ? comp.required : true,
  value: comp.data || '',
  placeholder: comp.placeholder,
  settings: normalizeComponentSettings(comp.component, comp.settings),
  mimeType: comp.mimeType,
  pageRect: comp.pageRect,
  fieldOwner: comp.fieldOwner,
});

const droppedComponentsSignature = (components: DroppedComponent[]): string =>
  JSON.stringify(
    components.map((component) => ({
      id: component.id,
      fieldId: component.fieldId ?? null,
      repeatGroupId: component.repeatGroupId ?? null,
      repeatSourceId: component.repeatSourceId ?? null,
      component: component.component,
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height,
      pageNumber: component.pageNumber ?? null,
      assignedRecipientId: component.assignedRecipientId ?? null,
      required: component.required !== false,
      data: component.data ?? '',
      placeholder: component.placeholder ?? null,
      fieldOwner: component.fieldOwner ?? null,
      settings: component.settings ?? null,
    }))
  );

export const useDroppedComponentsState = ({
  isSigningMode,
  initialFields,
  onFieldsChange,
}: UseDroppedComponentsStateArgs) => {
  const {
    droppedComponents: internalDroppedComponents,
    setDroppedComponents: setInternalDroppedComponents,
  } = useBuilderStore();
  const onFieldsChangeRef = useRef<typeof onFieldsChange>(onFieldsChange);
  const pendingPropSyncSignatureRef = useRef<string | null>(null);

  const signingComponents: DroppedComponent[] = useMemo(() => {
    if (!initialFields) return [];
    const usedIds = new Set<number>();
    const normalizedFields = dedupeFieldsById(initialFields);
    return normalizedFields.map((field: DocumentField) =>
      mapFieldToDroppedComponent(field, usedIds)
    );
  }, [initialFields]);

  useEffect(() => {
    if (!isSigningMode) {
      pendingPropSyncSignatureRef.current = null;
      return;
    }

    const propSignature = droppedComponentsSignature(signingComponents);
    if (
      pendingPropSyncSignatureRef.current &&
      pendingPropSyncSignatureRef.current !== propSignature
    ) {
      return;
    }

    if (pendingPropSyncSignatureRef.current === propSignature) {
      pendingPropSyncSignatureRef.current = null;
    }

    if (areDroppedComponentsEqual(internalDroppedComponents, signingComponents)) {
      return;
    }

    setInternalDroppedComponents(signingComponents);
  }, [internalDroppedComponents, isSigningMode, setInternalDroppedComponents, signingComponents]);

  const currentSigningComponents = useMemo(() => {
    if (internalDroppedComponents.length > 0 || signingComponents.length === 0) {
      return internalDroppedComponents;
    }

    return signingComponents;
  }, [internalDroppedComponents, signingComponents]);

  useEffect(() => {
    onFieldsChangeRef.current = onFieldsChange;
  }, [onFieldsChange]);

  const droppedComponents: DroppedComponent[] = useMemo(() => {
    if (isSigningMode) {
      return currentSigningComponents;
    }
    return internalDroppedComponents;
  }, [currentSigningComponents, isSigningMode, internalDroppedComponents]);

  const setDroppedComponents = useCallback((updater: React.SetStateAction<DroppedComponent[]>) => {
    if (isSigningMode) {
      setInternalDroppedComponents((currentComponents) => {
        const nextComponents =
          typeof updater === 'function' ? updater(currentComponents) : updater;
        pendingPropSyncSignatureRef.current = droppedComponentsSignature(nextComponents);
        onFieldsChangeRef.current?.(nextComponents.map(mapDroppedComponentToDocumentField));
        return nextComponents;
      });
      return;
    }

    setInternalDroppedComponents(updater);
  }, [isSigningMode, setInternalDroppedComponents]);

  return {
    droppedComponents,
    setDroppedComponents,
    internalDroppedComponents,
  };
};
