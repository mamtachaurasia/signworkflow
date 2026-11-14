import { describe, expect, it } from 'vitest';

import {
  buildRepeatedFieldsForPages,
  getRepeatCoveredPageNumbers,
} from '@/utils/builder/repeatFields';
import type { DroppedComponent } from '@/types/types';
import type { PageBounds } from '@/utils/builder/fieldLayout';

const pageBoundsByNumber: Record<number, PageBounds> = {
  1: { left: 10, top: 20, width: 500, height: 700, pageRect: null },
  2: { left: 10, top: 760, width: 500, height: 700, pageRect: null },
  3: { left: 10, top: 1500, width: 500, height: 700, pageRect: null },
};

const baseField: DroppedComponent = {
  id: 7,
  fieldId: '7',
  component: 'Text',
  x: 90,
  y: 140,
  width: 160,
  height: 48,
  pageNumber: 1,
  pageRect: null,
  fieldOwner: 'recipients',
  assignedRecipientId: 'recipient-1',
  required: true,
  data: '',
  placeholder: 'Enter text',
  settings: { label: 'Address' },
};

describe('buildRepeatedFieldsForPages', () => {
  it('copies the selected field to every other page at the same relative placement', () => {
    const result = buildRepeatedFieldsForPages({
      field: baseField,
      currentComponents: [baseField],
      pageCount: 3,
      nextIdStart: 8,
      targetPageNumbers: [1, 2, 3],
      repeatGroupId: 'repeat-group-1',
      resolvePageBounds: (pageNumber) => pageBoundsByNumber[pageNumber] ?? null,
    });

    expect(result.addedCount).toBe(2);
    expect(result.nextElementId).toBe(10);
    expect(result.components).toHaveLength(3);
    expect(result.components[0]).toEqual(
      expect.objectContaining({
        repeatGroupId: 'repeat-group-1',
        repeatSourceId: '7',
      })
    );
    expect(result.components.slice(1)).toEqual([
      expect.objectContaining({
        id: 8,
        fieldId: '8',
        repeatGroupId: 'repeat-group-1',
        repeatSourceId: '7',
        pageNumber: 2,
        x: 90,
        y: 880,
        assignedRecipientId: 'recipient-1',
        settings: { label: 'Address' },
      }),
      expect.objectContaining({
        id: 9,
        fieldId: '9',
        repeatGroupId: 'repeat-group-1',
        pageNumber: 3,
        x: 90,
        y: 1620,
      }),
    ]);
  });

  it('skips pages that already have the same repeated field', () => {
    const first = buildRepeatedFieldsForPages({
      field: baseField,
      currentComponents: [baseField],
      pageCount: 3,
      nextIdStart: 8,
      targetPageNumbers: [1, 2, 3],
      repeatGroupId: 'repeat-group-1',
      resolvePageBounds: (pageNumber) => pageBoundsByNumber[pageNumber] ?? null,
    });

    const second = buildRepeatedFieldsForPages({
      field: first.components[0],
      currentComponents: first.components,
      pageCount: 3,
      nextIdStart: first.nextElementId,
      targetPageNumbers: [1, 2, 3],
      repeatGroupId: 'repeat-group-1',
      resolvePageBounds: (pageNumber) => pageBoundsByNumber[pageNumber] ?? null,
    });

    expect(second.addedCount).toBe(0);
    expect(second.components).toHaveLength(3);
    expect(second.skippedExistingPageNumbers).toEqual([2, 3]);
  });

  it('copies only to selected missing pages', () => {
    const result = buildRepeatedFieldsForPages({
      field: baseField,
      currentComponents: [baseField],
      pageCount: 3,
      nextIdStart: 8,
      targetPageNumbers: [3],
      repeatGroupId: 'repeat-group-selected',
      resolvePageBounds: (pageNumber) => pageBoundsByNumber[pageNumber] ?? null,
    });

    expect(result.addedCount).toBe(1);
    expect(result.components).toHaveLength(2);
    expect(result.components[1]).toEqual(
      expect.objectContaining({
        id: 8,
        pageNumber: 3,
        repeatGroupId: 'repeat-group-selected',
      })
    );
    expect(result.coveredPageNumbers).toEqual([1, 3]);
  });

  it('reports covered pages for a repeated group', () => {
    const repeated = buildRepeatedFieldsForPages({
      field: baseField,
      currentComponents: [baseField],
      pageCount: 3,
      nextIdStart: 8,
      targetPageNumbers: [2],
      repeatGroupId: 'repeat-group-covered',
      resolvePageBounds: (pageNumber) => pageBoundsByNumber[pageNumber] ?? null,
    });

    expect(
      getRepeatCoveredPageNumbers({
        field: repeated.components[0],
        currentComponents: repeated.components,
        pageCount: 3,
        resolvePageBounds: (pageNumber) => pageBoundsByNumber[pageNumber] ?? null,
      })
    ).toEqual([1, 2]);
  });
});
