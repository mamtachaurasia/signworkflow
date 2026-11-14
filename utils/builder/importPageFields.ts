import { DocumentField, DroppedComponent, Recipient } from '@/types/types';
import { PAGE_MARGIN } from '@/utils/builder/constants';
import { dedupeFieldsById, mapFieldToDroppedComponent } from '@/utils/builder/documentFields';
import {
  DEFAULT_BLANK_PAGE_SIZE,
  getRenderedPageSpan,
  type PageSize,
} from '@/utils/builder/pageOperations';
import { shiftSerializedPageRect } from '@/utils/builder/pageRect';

interface BuildImportedPageFieldsArgs {
  currentComponents: DroppedComponent[];
  currentPageSizes: PageSize[];
  sourceFields: DocumentField[];
  sourcePageSizes: PageSize[];
  selectedPageIndexes: number[];
  insertAfterPageNumber: number;
  recipients: Recipient[];
}

interface BuildReplacementPageFieldsArgs {
  currentComponents: DroppedComponent[];
  currentPageSizes: PageSize[];
  sourceFields: DocumentField[];
  sourcePageSizes: PageSize[];
  sourcePageIndex: number;
  targetPageNumber: number;
  recipients: Recipient[];
}

const normalizePageSize = (pageSize: PageSize | undefined): PageSize => pageSize ?? DEFAULT_BLANK_PAGE_SIZE;

const getPageTop = (pageNumber: number, pageSizes: PageSize[]) => {
  if (pageNumber <= 1) {
    return PAGE_MARGIN;
  }

  return PAGE_MARGIN + pageSizes
    .slice(0, pageNumber - 1)
    .reduce((total, pageSize) => total + getRenderedPageSpan(normalizePageSize(pageSize)), 0);
};

const buildImportedSourceFieldComponent = ({
  field,
  sourcePageSizes,
  sourcePageNumber,
  destinationPageNumber,
  destinationPageTop,
  usedIds,
  availableRecipientIds,
}: {
  field: DocumentField;
  sourcePageSizes: PageSize[];
  sourcePageNumber: number;
  destinationPageNumber: number;
  destinationPageTop: number;
  usedIds: Set<number>;
  availableRecipientIds: Set<string>;
}): DroppedComponent => {
  const importedField: DocumentField = {
    ...field,
    recipientId:
      typeof field.recipientId === 'string' && availableRecipientIds.has(field.recipientId)
        ? field.recipientId
        : null,
    value: undefined,
  };

  const mappedComponent = mapFieldToDroppedComponent(importedField, usedIds);
  const sourcePageTop = getPageTop(sourcePageNumber, sourcePageSizes);
  const offsetY = destinationPageTop - sourcePageTop;

  return {
    ...mappedComponent,
    y: mappedComponent.y + offsetY,
    pageNumber: destinationPageNumber,
    assignedRecipientId:
      mappedComponent.assignedRecipientId && availableRecipientIds.has(mappedComponent.assignedRecipientId)
        ? mappedComponent.assignedRecipientId
        : null,
    pageRect: shiftSerializedPageRect(mappedComponent.pageRect, offsetY),
  };
};

export const buildImportedPageFields = ({
  currentComponents,
  currentPageSizes,
  sourceFields,
  sourcePageSizes,
  selectedPageIndexes,
  insertAfterPageNumber,
  recipients,
}: BuildImportedPageFieldsArgs): DroppedComponent[] => {
  if (!Array.isArray(sourceFields) || sourceFields.length === 0) {
    return [];
  }

  const normalizedSelectedPageIndexes = Array.from(
    new Set(
      selectedPageIndexes.filter(
        (pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0
      )
    )
  ).sort((left, right) => left - right);

  if (normalizedSelectedPageIndexes.length === 0) {
    return [];
  }

  const selectedOrderByPageIndex = new Map<number, number>();
  const destinationTopByPageIndex = new Map<number, number>();
  let accumulatedInsertedSpan = 0;

  normalizedSelectedPageIndexes.forEach((pageIndex, order) => {
    selectedOrderByPageIndex.set(pageIndex, order);
    destinationTopByPageIndex.set(
      pageIndex,
      PAGE_MARGIN +
        currentPageSizes
          .slice(0, insertAfterPageNumber)
          .reduce((total, pageSize) => total + getRenderedPageSpan(normalizePageSize(pageSize)), 0) +
        accumulatedInsertedSpan
    );
    accumulatedInsertedSpan += getRenderedPageSpan(normalizePageSize(sourcePageSizes[pageIndex]));
  });

  const availableRecipientIds = new Set(recipients.map((recipient) => recipient.id));
  const usedIds = new Set(currentComponents.map((component) => component.id));

  return dedupeFieldsById(sourceFields)
    .map((field) => {
      const sourcePageNumber =
        typeof field.pageNumber === 'number' && field.pageNumber > 0 ? field.pageNumber : 1;
      const sourcePageIndex = sourcePageNumber - 1;
      const selectedOrder = selectedOrderByPageIndex.get(sourcePageIndex);
      const destinationPageTop = destinationTopByPageIndex.get(sourcePageIndex);

      if (selectedOrder === undefined || typeof destinationPageTop !== 'number') {
        return null;
      }

      return buildImportedSourceFieldComponent({
        field,
        sourcePageSizes,
        sourcePageNumber,
        destinationPageNumber: insertAfterPageNumber + selectedOrder + 1,
        destinationPageTop,
        usedIds,
        availableRecipientIds,
      });
    })
    .filter((component): component is DroppedComponent => component !== null);
};

export const buildReplacementPageFields = ({
  currentComponents,
  currentPageSizes,
  sourceFields,
  sourcePageSizes,
  sourcePageIndex,
  targetPageNumber,
  recipients,
}: BuildReplacementPageFieldsArgs): DroppedComponent[] => {
  if (!Array.isArray(sourceFields) || sourceFields.length === 0) {
    return [];
  }

  if (!Number.isInteger(sourcePageIndex) || sourcePageIndex < 0) {
    return [];
  }

  const availableRecipientIds = new Set(recipients.map((recipient) => recipient.id));
  const usedIds = new Set(currentComponents.map((component) => component.id));
  const sourcePageNumber = sourcePageIndex + 1;
  const destinationPageTop = getPageTop(targetPageNumber, currentPageSizes);

  return dedupeFieldsById(sourceFields)
    .filter((field) => {
      const pageNumber =
        typeof field.pageNumber === 'number' && field.pageNumber > 0 ? field.pageNumber : 1;
      return pageNumber === sourcePageNumber;
    })
    .map((field) => buildImportedSourceFieldComponent({
      field,
      sourcePageSizes,
      sourcePageNumber,
      destinationPageNumber: targetPageNumber,
      destinationPageTop,
      usedIds,
      availableRecipientIds,
    }));
};
