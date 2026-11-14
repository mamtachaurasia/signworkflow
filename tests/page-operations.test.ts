import { describe, expect, it } from 'vitest';
import type { DroppedComponent } from '../types/types';
import { PAGE_CONTENT_MARGIN_BOTTOM, PAGE_MARGIN, VIEWER_PAGE_WIDTH } from '../utils/builder/constants';
import {
  deletePageComponents,
  duplicatePageComponents,
  getRenderedPageSpan,
  insertBlankPageComponents,
  insertPagesComponents,
  insertPagesWithComponents,
  movePageComponents,
  replacePageComponents,
  replacePageWithComponents,
} from '../utils/builder/pageOperations';

const defaultPageSize = { width: 612, height: 792 };

const buildComponent = (overrides: Partial<DroppedComponent> = {}): DroppedComponent => ({
  id: 1,
  fieldId: '1',
  component: 'Text',
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  pageNumber: 1,
  pageRect: {
    y: 20,
    top: 20,
    bottom: 60,
    left: 10,
    right: 110,
    width: 100,
    height: 40,
  },
  fieldOwner: 'recipients',
  required: true,
  data: '',
  ...overrides,
});

describe('pageOperations utilities', () => {
  it('uses the full viewer page spacing when calculating rendered page span', () => {
    const expectedHeight = Math.ceil(defaultPageSize.height * (VIEWER_PAGE_WIDTH / defaultPageSize.width));
    expect(getRenderedPageSpan(defaultPageSize)).toBe(expectedHeight + PAGE_MARGIN + PAGE_CONTENT_MARGIN_BOTTOM);
  });

  it('inserts a blank page by shifting only later-page fields', () => {
    const shift = getRenderedPageSpan(defaultPageSize);
    const components = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1, y: 20 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 200 }),
      buildComponent({ id: 3, fieldId: '3', pageNumber: 3, y: 400 }),
    ];

    const result = insertBlankPageComponents(components, 1);

    expect(result[0]).toMatchObject({ pageNumber: 1, y: 20 });
    expect(result[1]).toMatchObject({ pageNumber: 3, y: 200 + shift });
    expect(result[2]).toMatchObject({ pageNumber: 4, y: 400 + shift });
    expect(result[1].pageRect).toMatchObject({ y: 20 + shift, top: 20 + shift, bottom: 60 + shift });
  });

  it('deletes a page by removing its fields and shifting later pages upward', () => {
    const shift = getRenderedPageSpan(defaultPageSize);
    const components = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1, y: 20 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 200 }),
      buildComponent({ id: 3, fieldId: '3', pageNumber: 3, y: 400 }),
    ];

    const result = deletePageComponents(components, {
      pageIndex: 1,
      pageSize: defaultPageSize,
    });

    expect(result).toHaveLength(2);
    expect(result.map((component) => component.id)).toEqual([1, 3]);
    expect(result[1]).toMatchObject({ pageNumber: 2, y: 400 - shift });
  });

  it('duplicates page fields and shifts later pages down without reusing ids', () => {
    const shift = getRenderedPageSpan(defaultPageSize);
    const components = [
      buildComponent({
        id: 10,
        fieldId: '10',
        pageNumber: 1,
        settings: { options: ['A', 'B'], defaultValue: 'Alpha' },
      }),
      buildComponent({ id: 11, fieldId: '11', pageNumber: 1, y: 120 }),
      buildComponent({ id: 12, fieldId: '12', pageNumber: 2, y: 240 }),
    ];

    const result = duplicatePageComponents(components, {
      pageIndex: 0,
      pageSize: defaultPageSize,
    });

    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({ id: 10, pageNumber: 1, y: 20 });
    expect(result[1]).toMatchObject({ id: 13, fieldId: '13', pageNumber: 2, y: 20 + shift });
    expect(result[2]).toMatchObject({ id: 11, pageNumber: 1, y: 120 });
    expect(result[3]).toMatchObject({ id: 14, fieldId: '14', pageNumber: 2, y: 120 + shift });
    expect(result[4]).toMatchObject({ id: 12, pageNumber: 3, y: 240 + shift });
    expect(result[1].settings).toEqual(components[0].settings);
    expect(result[1].settings).not.toBe(components[0].settings);
  });

  it('moves page fields using the original page sizes when pages have different heights', () => {
    const pageSizes = [
      { width: 612, height: 792 },
      { width: 612, height: 300 },
      { width: 612, height: 500 },
    ];
    const movedPageShift = getRenderedPageSpan(pageSizes[0]);
    const crossedPagesShift = getRenderedPageSpan(pageSizes[1]) + getRenderedPageSpan(pageSizes[2]);
    const components = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1, y: 20 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 200 }),
      buildComponent({ id: 3, fieldId: '3', pageNumber: 3, y: 400 }),
    ];

    const result = movePageComponents(components, {
      fromIndex: 0,
      toIndex: 2,
      pageSizes,
    });

    expect(result[0]).toMatchObject({ pageNumber: 3, y: 20 + crossedPagesShift });
    expect(result[1]).toMatchObject({ pageNumber: 1, y: 200 - movedPageShift });
    expect(result[2]).toMatchObject({ pageNumber: 2, y: 400 - movedPageShift });
  });

  it('moves page fields upward when sending a later page to an earlier position', () => {
    const pageSizes = [
      { width: 612, height: 200 },
      { width: 612, height: 400 },
      { width: 612, height: 600 },
    ];
    const movedPageShift = getRenderedPageSpan(pageSizes[2]);
    const crossedPagesShift = getRenderedPageSpan(pageSizes[0]) + getRenderedPageSpan(pageSizes[1]);
    const components = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1, y: 20 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 200 }),
      buildComponent({ id: 3, fieldId: '3', pageNumber: 3, y: 500 }),
    ];

    const result = movePageComponents(components, {
      fromIndex: 2,
      toIndex: 0,
      pageSizes,
    });

    expect(result[0]).toMatchObject({ pageNumber: 2, y: 20 + movedPageShift });
    expect(result[1]).toMatchObject({ pageNumber: 3, y: 200 + movedPageShift });
    expect(result[2]).toMatchObject({ pageNumber: 1, y: 500 - crossedPagesShift });
  });

  it('replaces a page by clearing its fields and reflowing later pages when the height changes', () => {
    const previousPageSize = { width: 612, height: 300 };
    const nextPageSize = { width: 612, height: 700 };
    const shiftDelta = getRenderedPageSpan(nextPageSize) - getRenderedPageSpan(previousPageSize);
    const components = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1, y: 20 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 220 }),
      buildComponent({ id: 3, fieldId: '3', pageNumber: 3, y: 420 }),
    ];

    const result = replacePageComponents(components, {
      pageIndex: 1,
      previousPageSize,
      nextPageSize,
    });

    expect(result).toHaveLength(2);
    expect(result.map((component) => component.id)).toEqual([1, 3]);
    expect(result[0]).toMatchObject({ pageNumber: 1, y: 20 });
    expect(result[1]).toMatchObject({ pageNumber: 3, y: 420 + shiftDelta });
    expect(result[1].pageRect).toMatchObject({
      y: 20 + shiftDelta,
      top: 20 + shiftDelta,
      bottom: 60 + shiftDelta,
    });
  });

  it('inserts a full PDF by shifting later pages by the total inserted span', () => {
    const insertedPageSizes = [
      { width: 612, height: 300 },
      { width: 612, height: 500 },
    ];
    const totalShift = insertedPageSizes.reduce(
      (sum, pageSize) => sum + getRenderedPageSpan(pageSize),
      0
    );
    const components = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1, y: 20 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 220 }),
      buildComponent({ id: 3, fieldId: '3', pageNumber: 3, y: 420 }),
    ];

    const result = insertPagesComponents(components, {
      insertedAfterPageNumber: 1,
      insertedPageSizes,
    });

    expect(result[0]).toMatchObject({ pageNumber: 1, y: 20 });
    expect(result[1]).toMatchObject({ pageNumber: 4, y: 220 + totalShift });
    expect(result[2]).toMatchObject({ pageNumber: 5, y: 420 + totalShift });
  });

  it('merges imported fields into the appended page result', () => {
    const components = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1, y: 20 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 220 }),
    ];
    const importedComponents = [
      buildComponent({ id: 40, fieldId: '40', pageNumber: 2, y: 120 }),
    ];

    const result = insertPagesWithComponents(components, {
      insertedAfterPageNumber: 1,
      insertedPageSizes: [{ width: 612, height: 300 }],
    }, importedComponents);

    expect(result).toHaveLength(3);
    expect(result.at(-1)).toMatchObject({ id: 40, pageNumber: 2, y: 120 });
  });

  it('merges imported fields into the replaced page result', () => {
    const components = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1, y: 20 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 220 }),
      buildComponent({ id: 3, fieldId: '3', pageNumber: 3, y: 420 }),
    ];
    const replacementComponents = [
      buildComponent({ id: 50, fieldId: '50', pageNumber: 2, y: 180 }),
    ];

    const result = replacePageWithComponents(components, {
      pageIndex: 1,
      previousPageSize: { width: 612, height: 300 },
      nextPageSize: { width: 612, height: 700 },
    }, replacementComponents);

    expect(result).toHaveLength(3);
    expect(result.map((component) => component.id)).toEqual([1, 3, 50]);
    expect(result.at(-1)).toMatchObject({ pageNumber: 2, y: 180 });
  });
});
