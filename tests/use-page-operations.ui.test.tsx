// @vitest-environment jsdom

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DroppedComponent } from '../types/types';
import { usePageOperations } from '../hooks/builder/usePageOperations';
import {
  duplicatePageComponents,
  insertBlankPageComponents,
  insertPagesComponents,
  insertPagesWithComponents,
  replacePageComponents,
  type PageStructureOperation,
} from '../utils/builder/pageOperations';

const buildComponent = (overrides: Partial<DroppedComponent> = {}): DroppedComponent => ({
  id: 1,
  fieldId: '1',
  component: 'Text',
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  pageNumber: 1,
  pageRect: null,
  fieldOwner: 'recipients',
  required: true,
  data: '',
  ...overrides,
});

describe('usePageOperations', () => {
  it('updates fields and resets history after inserting a blank page', async () => {
    const droppedComponents = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 220 }),
    ];
    const setDroppedComponents = vi.fn();
    const resetHistory = vi.fn();
    const insertBlankPageAt = vi.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      usePageOperations({
        droppedComponents,
        setDroppedComponents: setDroppedComponents as unknown as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        resetHistory,
        insertBlankPageAt,
      })
    );

    await act(async () => {
      await result.current.handleInsertBlankPage(1);
    });

    const expected = insertBlankPageComponents(droppedComponents, 1);
    expect(insertBlankPageAt).toHaveBeenCalledWith(1);
    expect(setDroppedComponents).toHaveBeenCalledWith(expected);
    expect(resetHistory).toHaveBeenCalledWith(expected);
  });

  it('does not mutate field state when the blank page insertion fails', async () => {
    const setDroppedComponents = vi.fn();
    const resetHistory = vi.fn();
    const insertBlankPageAt = vi.fn().mockResolvedValue(false);

    const { result } = renderHook(() =>
      usePageOperations({
        droppedComponents: [buildComponent()],
        setDroppedComponents: setDroppedComponents as unknown as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        resetHistory,
        insertBlankPageAt,
      })
    );

    await act(async () => {
      await result.current.handleInsertBlankPage(1);
    });

    expect(setDroppedComponents).not.toHaveBeenCalled();
    expect(resetHistory).not.toHaveBeenCalled();
  });

  it('resets history after duplicating a page so undo cannot cross PDF structure changes', () => {
    const droppedComponents = [
      buildComponent({ id: 4, fieldId: '4', pageNumber: 1 }),
      buildComponent({ id: 5, fieldId: '5', pageNumber: 2, y: 220 }),
    ];
    const operation: PageStructureOperation = {
      pageIndex: 0,
      pageSize: { width: 612, height: 792 },
    };
    const setDroppedComponents = vi.fn();
    const resetHistory = vi.fn();

    const { result } = renderHook(() =>
      usePageOperations({
        droppedComponents,
        setDroppedComponents: setDroppedComponents as unknown as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        resetHistory,
        insertBlankPageAt: vi.fn().mockResolvedValue(true),
      })
    );

    act(() => {
      result.current.handlePageDuplicated(operation);
    });

    const expected = duplicatePageComponents(droppedComponents, operation);
    expect(setDroppedComponents).toHaveBeenCalledWith(expected);
    expect(resetHistory).toHaveBeenCalledWith(expected);
  });

  it('resets history after replacing a page and removes the replaced page fields', () => {
    const droppedComponents = [
      buildComponent({ id: 7, fieldId: '7', pageNumber: 1 }),
      buildComponent({ id: 8, fieldId: '8', pageNumber: 2, y: 240 }),
      buildComponent({ id: 9, fieldId: '9', pageNumber: 3, y: 480 }),
    ];
    const operation = {
      pageIndex: 1,
      previousPageSize: { width: 612, height: 300 },
      nextPageSize: { width: 612, height: 700 },
    };
    const setDroppedComponents = vi.fn();
    const resetHistory = vi.fn();

    const { result } = renderHook(() =>
      usePageOperations({
        droppedComponents,
        setDroppedComponents: setDroppedComponents as unknown as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        resetHistory,
        insertBlankPageAt: vi.fn().mockResolvedValue(true),
      })
    );

    act(() => {
      result.current.handlePageReplaced(operation);
    });

    const expected = replacePageComponents(droppedComponents, operation);
    expect(setDroppedComponents).toHaveBeenCalledWith(expected);
    expect(resetHistory).toHaveBeenCalledWith(expected);
  });

  it('resets history after appending a full PDF and reflows later page fields', () => {
    const droppedComponents = [
      buildComponent({ id: 10, fieldId: '10', pageNumber: 1 }),
      buildComponent({ id: 11, fieldId: '11', pageNumber: 2, y: 220 }),
    ];
    const operation = {
      insertedAfterPageNumber: 1,
      insertedPageSizes: [
        { width: 612, height: 300 },
        { width: 612, height: 500 },
      ],
    };
    const setDroppedComponents = vi.fn();
    const resetHistory = vi.fn();

    const { result } = renderHook(() =>
      usePageOperations({
        droppedComponents,
        setDroppedComponents: setDroppedComponents as unknown as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        resetHistory,
        insertBlankPageAt: vi.fn().mockResolvedValue(true),
      })
    );

    act(() => {
      result.current.handlePagesInserted(operation);
    });

    const expected = insertPagesComponents(droppedComponents, operation);
    expect(setDroppedComponents).toHaveBeenCalledWith(expected);
    expect(resetHistory).toHaveBeenCalledWith(expected);
  });

  it('commits inserted source fields together with appended pages', () => {
    const droppedComponents = [
      buildComponent({ id: 12, fieldId: '12', pageNumber: 1 }),
      buildComponent({ id: 13, fieldId: '13', pageNumber: 2, y: 220 }),
    ];
    const operation = {
      insertedAfterPageNumber: 1,
      insertedPageSizes: [
        { width: 612, height: 300 },
      ],
    };
    const importedComponents = [
      buildComponent({ id: 99, fieldId: '99', pageNumber: 2, y: 120 }),
    ];
    const setDroppedComponents = vi.fn();
    const resetHistory = vi.fn();

    const { result } = renderHook(() =>
      usePageOperations({
        droppedComponents,
        setDroppedComponents: setDroppedComponents as unknown as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        resetHistory,
        insertBlankPageAt: vi.fn().mockResolvedValue(true),
      })
    );

    act(() => {
      result.current.handlePagesInserted(operation, importedComponents);
    });

    const expected = insertPagesWithComponents(droppedComponents, operation, importedComponents);
    expect(setDroppedComponents).toHaveBeenCalledWith(expected);
    expect(resetHistory).toHaveBeenCalledWith(expected);
  });

  it('commits imported replacement fields together with the page replacement', () => {
    const droppedComponents = [
      buildComponent({ id: 14, fieldId: '14', pageNumber: 1 }),
      buildComponent({ id: 15, fieldId: '15', pageNumber: 2, y: 220 }),
      buildComponent({ id: 16, fieldId: '16', pageNumber: 3, y: 420 }),
    ];
    const operation = {
      pageIndex: 1,
      previousPageSize: { width: 612, height: 300 },
      nextPageSize: { width: 612, height: 500 },
    };
    const replacementComponents = [
      buildComponent({ id: 99, fieldId: '99', pageNumber: 2, y: 160 }),
    ];
    const setDroppedComponents = vi.fn();
    const resetHistory = vi.fn();

    const { result } = renderHook(() =>
      usePageOperations({
        droppedComponents,
        setDroppedComponents: setDroppedComponents as unknown as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        resetHistory,
        insertBlankPageAt: vi.fn().mockResolvedValue(true),
      })
    );

    act(() => {
      result.current.handlePageReplaced(operation, replacementComponents);
    });

    const expected = [
      ...replacePageComponents(droppedComponents, operation),
      ...replacementComponents,
    ];
    expect(setDroppedComponents).toHaveBeenCalledWith(expected);
    expect(resetHistory).toHaveBeenCalledWith(expected);
  });
});
