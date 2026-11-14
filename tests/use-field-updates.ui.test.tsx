// @vitest-environment jsdom

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DroppedComponent } from '../types/types';
import { useFieldUpdates } from '../hooks/builder/useFieldUpdates';

const buildField = (overrides: Partial<DroppedComponent> = {}): DroppedComponent => ({
  id: 1,
  fieldId: '1',
  component: 'Text',
  x: 150,
  y: 85,
  width: 48,
  height: 24,
  pageNumber: 1,
  pageRect: null,
  fieldOwner: 'recipients',
  required: true,
  data: '',
  settings: {
    allowResize: true,
  },
  ...overrides,
});

const setRect = (element: HTMLElement, rect: DOMRect) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
};

describe('useFieldUpdates', () => {
  it('moves a field left when value growth would overflow the page width', () => {
    const canvas = document.createElement('div');
    const page = document.createElement('div');
    setRect(canvas, new DOMRect(0, 0, 200, 120));
    setRect(page, new DOMRect(0, 0, 200, 120));

    let currentComponents = [buildField()];
    const saveState = vi.fn();
    const setDroppedComponents = vi.fn((updater: React.SetStateAction<DroppedComponent[]>) => {
      currentComponents =
        typeof updater === 'function' ? updater(currentComponents) : updater;
    });

    const { result } = renderHook(() =>
      useFieldUpdates({
        isSigningMode: false,
        recipients: [],
        setDroppedComponents: setDroppedComponents as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        saveState,
        documentRef: { current: canvas },
        pageRefs: { current: [page] },
        zoom: 1,
      })
    );

    act(() => {
      result.current.updateField('This value is wide enough to force a resize near the page edge', 1);
    });

    expect(currentComponents[0].width).toBe(200);
    expect(currentComponents[0].x).toBe(0);
    expect(currentComponents[0].x + currentComponents[0].width).toBeLessThanOrEqual(200);
    expect(saveState).toHaveBeenCalledWith(currentComponents);
  });

  it('moves a field up when value growth would overflow the page height', () => {
    const canvas = document.createElement('div');
    const page = document.createElement('div');
    setRect(canvas, new DOMRect(0, 0, 220, 130));
    setRect(page, new DOMRect(0, 0, 220, 130));

    let currentComponents = [buildField({ x: 20, y: 92 })];
    const setDroppedComponents = vi.fn((updater: React.SetStateAction<DroppedComponent[]>) => {
      currentComponents =
        typeof updater === 'function' ? updater(currentComponents) : updater;
    });

    const { result } = renderHook(() =>
      useFieldUpdates({
        isSigningMode: false,
        recipients: [],
        setDroppedComponents: setDroppedComponents as React.Dispatch<React.SetStateAction<DroppedComponent[]>>,
        saveState: vi.fn(),
        documentRef: { current: canvas },
        pageRefs: { current: [page] },
        zoom: 1,
      })
    );

    act(() => {
      result.current.updateField(['line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6'].join('\n'), 1);
    });

    expect(currentComponents[0].y).toBeLessThan(92);
    expect(currentComponents[0].y + currentComponents[0].height).toBeLessThanOrEqual(130);
  });
});
