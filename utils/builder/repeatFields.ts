import type { DroppedComponent } from '@/types/types';
import { fitFieldWithinPageBounds, type PageBounds } from '@/utils/builder/fieldLayout';

interface BuildRepeatedFieldsArgs {
  field: DroppedComponent;
  currentComponents: DroppedComponent[];
  pageCount: number;
  nextIdStart: number;
  targetPageNumbers: number[];
  repeatGroupId: string;
  resolvePageBounds: (pageNumber: number) => PageBounds | null;
}

interface GetRepeatCoverageArgs {
  field: DroppedComponent;
  currentComponents: DroppedComponent[];
  pageCount: number;
  resolvePageBounds: (pageNumber: number) => PageBounds | null;
}

export interface BuildRepeatedFieldsResult {
  components: DroppedComponent[];
  nextElementId: number;
  addedCount: number;
  repeatGroupId: string;
  coveredPageNumbers: number[];
  skippedExistingPageNumbers: number[];
  skippedUnavailablePageNumbers: number[];
}

const POSITION_TOLERANCE = 1;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(',')}}`;
};

const nearlyEqual = (left: number | undefined, right: number | undefined): boolean =>
  Math.abs((left ?? 0) - (right ?? 0)) <= POSITION_TOLERANCE;

const getFieldStorageId = (field: DroppedComponent): string =>
  field.fieldId ?? String(field.id);

const getRepeatSourceId = (field: DroppedComponent): string =>
  field.repeatSourceId ?? getFieldStorageId(field);

const normalizeTargetPageNumbers = (pageNumbers: number[], pageCount: number): number[] =>
  Array.from(
    new Set(
      pageNumbers
        .map((pageNumber) => Math.round(pageNumber))
        .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount)
    )
  ).sort((left, right) => left - right);

const getRelativePosition = (
  field: DroppedComponent,
  pageBounds: PageBounds
): { x: number; y: number } => ({
  x: field.x - pageBounds.left,
  y: field.y - pageBounds.top,
});

const fieldsMatchRepeatedPlacement = (
  candidate: DroppedComponent,
  sourceField: DroppedComponent,
  candidatePageBounds: PageBounds,
  targetPlacement: Pick<DroppedComponent, 'x' | 'y' | 'width' | 'height'>
): boolean => {
  if (candidate.id === sourceField.id) return false;
  if (candidate.repeatGroupId && candidate.repeatGroupId !== sourceField.repeatGroupId) return false;
  if (candidate.component !== sourceField.component) return false;
  if ((candidate.fieldOwner ?? 'recipients') !== (sourceField.fieldOwner ?? 'recipients')) return false;
  if ((candidate.assignedRecipientId ?? null) !== (sourceField.assignedRecipientId ?? null)) return false;
  if ((candidate.required !== false) !== (sourceField.required !== false)) return false;
  if ((candidate.placeholder ?? '') !== (sourceField.placeholder ?? '')) return false;
  if ((candidate.data ?? null) !== (sourceField.data ?? null)) return false;
  if ((candidate.mimeType ?? '') !== (sourceField.mimeType ?? '')) return false;
  if (stableStringify(candidate.settings ?? null) !== stableStringify(sourceField.settings ?? null)) return false;

  const candidateRelative = getRelativePosition(candidate, candidatePageBounds);
  const targetRelative = {
    x: targetPlacement.x - candidatePageBounds.left,
    y: targetPlacement.y - candidatePageBounds.top,
  };

  return (
    nearlyEqual(candidateRelative.x, targetRelative.x) &&
    nearlyEqual(candidateRelative.y, targetRelative.y) &&
    nearlyEqual(candidate.width, targetPlacement.width) &&
    nearlyEqual(candidate.height, targetPlacement.height)
  );
};

const getRepeatedPlacement = (
  field: DroppedComponent,
  sourceBounds: PageBounds,
  targetBounds: PageBounds,
): Pick<DroppedComponent, 'x' | 'y' | 'width' | 'height' | 'pageRect'> => {
  const sourceRelative = getRelativePosition(field, sourceBounds);
  const targetField = {
    ...field,
    x: targetBounds.left + sourceRelative.x,
    y: targetBounds.top + sourceRelative.y,
    pageRect: targetBounds.pageRect,
  };

  return fitFieldWithinPageBounds(targetField, targetBounds);
};

const resolveCoveredPageNumbers = ({
  field,
  currentComponents,
  pageCount,
  resolvePageBounds,
}: GetRepeatCoverageArgs): number[] => {
  const normalizedPageCount = Math.max(0, Math.floor(pageCount));
  const sourcePageNumber = Math.max(1, Math.min(field.pageNumber ?? 1, normalizedPageCount || 1));
  const sourceBounds = resolvePageBounds(sourcePageNumber);
  const covered = new Set<number>([sourcePageNumber]);
  const repeatGroupId = field.repeatGroupId;

  if (repeatGroupId) {
    currentComponents.forEach((component) => {
      const pageNumber = component.pageNumber;
      if (component.repeatGroupId === repeatGroupId && pageNumber && pageNumber >= 1 && pageNumber <= normalizedPageCount) {
        covered.add(pageNumber);
      }
    });
  }

  if (!sourceBounds) {
    return Array.from(covered).sort((left, right) => left - right);
  }

  for (let pageNumber = 1; pageNumber <= normalizedPageCount; pageNumber += 1) {
    if (covered.has(pageNumber)) continue;

    const targetBounds = resolvePageBounds(pageNumber);
    if (!targetBounds) continue;

    const targetPlacement = getRepeatedPlacement(field, sourceBounds, targetBounds);
    const matchingFieldExists = currentComponents.some(
      (component) =>
        component.pageNumber === pageNumber &&
        fieldsMatchRepeatedPlacement(component, field, targetBounds, targetPlacement)
    );

    if (matchingFieldExists) {
      covered.add(pageNumber);
    }
  }

  return Array.from(covered).sort((left, right) => left - right);
};

export const getRepeatCoveredPageNumbers = (args: GetRepeatCoverageArgs): number[] =>
  resolveCoveredPageNumbers(args);

export const buildRepeatedFieldsForPages = ({
  field,
  currentComponents,
  pageCount,
  nextIdStart,
  targetPageNumbers,
  repeatGroupId,
  resolvePageBounds,
}: BuildRepeatedFieldsArgs): BuildRepeatedFieldsResult => {
  const normalizedPageCount = Math.max(0, Math.floor(pageCount));
  const sourcePageNumber = Math.max(1, Math.min(field.pageNumber ?? 1, normalizedPageCount || 1));
  const sourceBounds = resolvePageBounds(sourcePageNumber);
  const usedIds = new Set(currentComponents.map((component) => component.id));
  const repeatSourceId = getRepeatSourceId(field);
  let nextId = Math.max(nextIdStart, 1, ...Array.from(usedIds).map((id) => id + 1));
  const skippedExistingPageNumbers: number[] = [];
  const skippedUnavailablePageNumbers: number[] = [];

  let nextComponents = currentComponents.map((component) =>
    component.id === field.id
      ? {
          ...component,
          repeatGroupId,
          repeatSourceId,
        }
      : component
  );

  if (normalizedPageCount <= 1 || !sourceBounds) {
    return {
      components: nextComponents,
      nextElementId: nextId,
      addedCount: 0,
      repeatGroupId,
      coveredPageNumbers: resolveCoveredPageNumbers({
        field: { ...field, repeatGroupId, repeatSourceId },
        currentComponents: nextComponents,
        pageCount,
        resolvePageBounds,
      }),
      skippedExistingPageNumbers,
      skippedUnavailablePageNumbers: !sourceBounds && normalizedPageCount > 1 ? [sourcePageNumber] : [],
    };
  }

  const normalizedTargets = normalizeTargetPageNumbers(targetPageNumbers, normalizedPageCount)
    .filter((pageNumber) => pageNumber !== sourcePageNumber);

  for (const pageNumber of normalizedTargets) {
    const targetBounds = resolvePageBounds(pageNumber);
    if (!targetBounds) {
      skippedUnavailablePageNumbers.push(pageNumber);
      continue;
    }

    const sourceForPlacement = { ...field, repeatGroupId, repeatSourceId };
    const fittedPlacement = getRepeatedPlacement(sourceForPlacement, sourceBounds, targetBounds);
    const existingRepeatGroupField = nextComponents.find(
      (component) => component.pageNumber === pageNumber && component.repeatGroupId === repeatGroupId
    );

    if (existingRepeatGroupField) {
      skippedExistingPageNumbers.push(pageNumber);
      continue;
    }

    const existingMatchingIndex = nextComponents.findIndex(
      (component) =>
        component.pageNumber === pageNumber &&
        fieldsMatchRepeatedPlacement(component, sourceForPlacement, targetBounds, fittedPlacement)
    );

    if (existingMatchingIndex >= 0) {
      nextComponents = nextComponents.map((component, index) =>
        index === existingMatchingIndex
          ? {
              ...component,
              repeatGroupId,
              repeatSourceId,
            }
          : component
      );
      skippedExistingPageNumbers.push(pageNumber);
      continue;
    }

    while (usedIds.has(nextId)) {
      nextId += 1;
    }

    const clone: DroppedComponent = {
      ...sourceForPlacement,
      id: nextId,
      fieldId: String(nextId),
      pageNumber,
      x: Math.round(fittedPlacement.x),
      y: Math.round(fittedPlacement.y),
      width: Math.round(fittedPlacement.width),
      height: Math.round(fittedPlacement.height),
      pageRect: fittedPlacement.pageRect,
    };

    usedIds.add(nextId);
    nextId += 1;
    nextComponents.push(clone);
  }

  return {
    components: nextComponents,
    nextElementId: nextId,
    addedCount: nextComponents.length - currentComponents.length,
    repeatGroupId,
    coveredPageNumbers: resolveCoveredPageNumbers({
      field: { ...field, repeatGroupId, repeatSourceId },
      currentComponents: nextComponents,
      pageCount,
      resolvePageBounds,
    }),
    skippedExistingPageNumbers,
    skippedUnavailablePageNumbers,
  };
};
