import { DroppedComponent, FieldPropertySettings } from '@/types/types';
import {
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_WIDTH,
  PAGE_VERTICAL_SPACING,
  VIEWER_PAGE_WIDTH,
} from '@/utils/builder/constants';
import { shiftSerializedPageRect } from '@/utils/builder/pageRect';

export interface PageSize {
  width: number;
  height: number;
}

export interface PageStructureOperation {
  pageIndex: number;
  pageSize: PageSize;
}

export interface MovePageOperation {
  fromIndex: number;
  toIndex: number;
  pageSizes: PageSize[];
}

export interface ReplacePageOperation {
  pageIndex: number;
  previousPageSize: PageSize;
  nextPageSize: PageSize;
}

export interface InsertPagesOperation {
  insertedAfterPageNumber: number;
  insertedPageSizes: PageSize[];
}

export const DEFAULT_BLANK_PAGE_SIZE: PageSize = {
  width: DEFAULT_PAGE_WIDTH,
  height: DEFAULT_PAGE_HEIGHT,
};

export const getRenderedPageHeight = (width: number, height: number) => {
  return Math.ceil(height * (VIEWER_PAGE_WIDTH / width));
};

export const getRenderedPageSpan = (pageSize: PageSize) => {
  return getRenderedPageHeight(pageSize.width, pageSize.height) + PAGE_VERTICAL_SPACING;
};

const cloneSettings = (settings: FieldPropertySettings | undefined) => {
  if (!settings) {
    return settings;
  }

  return {
    ...settings,
    ...(Array.isArray(settings.options) ? { options: [...settings.options] } : {}),
  };
};

const repositionComponent = (
  component: DroppedComponent,
  pageNumber: number,
  offsetY: number
): DroppedComponent => ({
  ...component,
  y: component.y + offsetY,
  pageNumber,
  pageRect: shiftSerializedPageRect(component.pageRect, offsetY),
});

const getNextComponentId = (components: DroppedComponent[]) => {
  return Math.max(0, ...components.map((component) => component.id)) + 1;
};

export const insertBlankPageComponents = (
  components: DroppedComponent[],
  insertedAfterPageNumber: number,
  blankPageSize: PageSize = DEFAULT_BLANK_PAGE_SIZE
) => {
  return insertPagesComponents(components, {
    insertedAfterPageNumber,
    insertedPageSizes: [blankPageSize],
  });
};

export const insertPagesComponents = (
  components: DroppedComponent[],
  operation: InsertPagesOperation
) => {
  const { insertedAfterPageNumber, insertedPageSizes } = operation;
  const pageCountDelta = insertedPageSizes.length;
  const offsetY = insertedPageSizes.reduce(
    (total, pageSize) => total + getRenderedPageSpan(pageSize),
    0
  );

  if (pageCountDelta === 0 || offsetY === 0) {
    return components;
  }

  return components.map((component) => {
    if (typeof component.pageNumber === 'number' && component.pageNumber > insertedAfterPageNumber) {
      return repositionComponent(component, component.pageNumber + pageCountDelta, offsetY);
    }

    return component;
  });
};

export const insertPagesWithComponents = (
  components: DroppedComponent[],
  operation: InsertPagesOperation,
  insertedComponents: DroppedComponent[] = []
) => {
  const shiftedComponents = insertPagesComponents(components, operation);

  if (!Array.isArray(insertedComponents) || insertedComponents.length === 0) {
    return shiftedComponents;
  }

  return [...shiftedComponents, ...insertedComponents];
};

export const deletePageComponents = (
  components: DroppedComponent[],
  operation: PageStructureOperation
) => {
  const deletedPageNumber = operation.pageIndex + 1;
  const offsetY = getRenderedPageSpan(operation.pageSize);

  return components
    .filter((component) => component.pageNumber !== deletedPageNumber)
    .map((component) => {
      if (typeof component.pageNumber === 'number' && component.pageNumber > deletedPageNumber) {
        return repositionComponent(component, component.pageNumber - 1, -offsetY);
      }

      return component;
    });
};

export const duplicatePageComponents = (
  components: DroppedComponent[],
  operation: PageStructureOperation
) => {
  const sourcePageNumber = operation.pageIndex + 1;
  const offsetY = getRenderedPageSpan(operation.pageSize);
  let nextId = getNextComponentId(components);

  return components.flatMap((component) => {
    if (component.pageNumber === sourcePageNumber) {
      const duplicatedId = nextId++;
      return [
        component,
        {
          ...repositionComponent(component, sourcePageNumber + 1, offsetY),
          id: duplicatedId,
          fieldId: String(duplicatedId),
          settings: cloneSettings(component.settings),
        },
      ];
    }

    if (typeof component.pageNumber === 'number' && component.pageNumber > sourcePageNumber) {
      return [repositionComponent(component, component.pageNumber + 1, offsetY)];
    }

    return [component];
  });
};

export const replacePageComponents = (
  components: DroppedComponent[],
  operation: ReplacePageOperation
) => {
  const replacedPageNumber = operation.pageIndex + 1;
  const spanDelta =
    getRenderedPageSpan(operation.nextPageSize) - getRenderedPageSpan(operation.previousPageSize);

  return components
    .filter((component) => component.pageNumber !== replacedPageNumber)
    .map((component) => {
      if (
        spanDelta !== 0 &&
        typeof component.pageNumber === 'number' &&
        component.pageNumber > replacedPageNumber
      ) {
        return repositionComponent(component, component.pageNumber, spanDelta);
      }

      return component;
    });
};

export const replacePageWithComponents = (
  components: DroppedComponent[],
  operation: ReplacePageOperation,
  replacementComponents: DroppedComponent[] = []
) => {
  const shiftedComponents = replacePageComponents(components, operation);

  if (!Array.isArray(replacementComponents) || replacementComponents.length === 0) {
    return shiftedComponents;
  }

  return [...shiftedComponents, ...replacementComponents];
};

const sumPageSpans = (pageSizes: PageSize[]) => {
  return pageSizes.reduce((total, pageSize) => total + getRenderedPageSpan(pageSize), 0);
};

export const movePageComponents = (
  components: DroppedComponent[],
  operation: MovePageOperation
) => {
  const { fromIndex, toIndex, pageSizes } = operation;

  if (fromIndex === toIndex) {
    return components;
  }

  const movedPageSize = pageSizes[fromIndex];
  if (!movedPageSize || !pageSizes[toIndex]) {
    return components;
  }

  const fromPageNumber = fromIndex + 1;
  const toPageNumber = toIndex + 1;
  const movedPageSpan = getRenderedPageSpan(movedPageSize);

  if (fromIndex < toIndex) {
    const crossedPagesSpan = sumPageSpans(pageSizes.slice(fromIndex + 1, toIndex + 1));

    return components.map((component) => {
      if (component.pageNumber === fromPageNumber) {
        return repositionComponent(component, toPageNumber, crossedPagesSpan);
      }

      if (
        typeof component.pageNumber === 'number' &&
        component.pageNumber > fromPageNumber &&
        component.pageNumber <= toPageNumber
      ) {
        return repositionComponent(component, component.pageNumber - 1, -movedPageSpan);
      }

      return component;
    });
  }

  const crossedPagesSpan = sumPageSpans(pageSizes.slice(toIndex, fromIndex));

  return components.map((component) => {
    if (component.pageNumber === fromPageNumber) {
      return repositionComponent(component, toPageNumber, -crossedPagesSpan);
    }

    if (
      typeof component.pageNumber === 'number' &&
      component.pageNumber >= toPageNumber &&
      component.pageNumber < fromPageNumber
    ) {
      return repositionComponent(component, component.pageNumber + 1, movedPageSpan);
    }

    return component;
  });
};
