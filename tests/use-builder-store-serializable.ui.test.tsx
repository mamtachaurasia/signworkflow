// @vitest-environment jsdom

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBuilderStore } from '../hooks/useBuilderStore';
import { BuilderStoreProvider } from '../store/builderStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BuilderStoreProvider>{children}</BuilderStoreProvider>
);

describe('useBuilderStore serializable actions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes DOMRect pageRect values before dispatching dropped components', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useBuilderStore(), { wrapper });

    act(() => {
      result.current.setDroppedComponents([
        {
          id: 1,
          fieldId: 'field-1',
          component: 'Text',
          x: 24,
          y: 48,
          width: 120,
          height: 40,
          pageNumber: 1,
          fieldOwner: 'recipients',
          required: true,
          data: '',
          pageRect: new DOMRect(10, 20, 200, 300),
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.droppedComponents).toHaveLength(1);
    });

    expect(result.current.droppedComponents[0].pageRect).toMatchObject({
      x: 10,
      y: 20,
      width: 200,
      height: 300,
      top: 20,
      right: 210,
      bottom: 320,
      left: 10,
    });
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.some((arg) =>
          String(arg).toLowerCase().includes('non-serializable value'),
        ),
      ),
    ).toBe(false);
  });
});
