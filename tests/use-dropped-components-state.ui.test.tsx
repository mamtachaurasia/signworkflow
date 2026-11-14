// @vitest-environment jsdom

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDroppedComponentsState } from '../hooks/builder/useDroppedComponentsState';
import { BuilderStoreProvider } from '../store/builderStore';
import type { DocumentField } from '../types/types';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BuilderStoreProvider>{children}</BuilderStoreProvider>
);

const signingField: DocumentField = {
  id: 'field-1',
  type: 'signature',
  x: 100,
  y: 120,
  width: 140,
  height: 48,
  pageNumber: 1,
  recipientId: 'recipient-1',
  required: true,
  value: '',
  fieldOwner: 'recipients',
};

describe('useDroppedComponentsState', () => {
  it('mirrors signing fields into the isolated builder store for preview rendering', async () => {
    const onFieldsChange = vi.fn();

    const { result } = renderHook(
      () =>
        useDroppedComponentsState({
          isSigningMode: true,
          initialFields: [signingField],
          onFieldsChange,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.internalDroppedComponents).toHaveLength(1);
    });

    expect(result.current.internalDroppedComponents[0].assignedRecipientId).toBe('recipient-1');
    expect(result.current.droppedComponents[0].assignedRecipientId).toBe('recipient-1');

    act(() => {
      result.current.setDroppedComponents((current) =>
        current.map((component) =>
          component.id === 1
            ? {
                ...component,
                data: 'signed',
              }
            : component,
        ),
      );
    });

    expect(onFieldsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'field-1',
          recipientId: 'recipient-1',
          value: 'signed',
        }),
      ]),
    );
  });

  it('keeps the builder-mode setter stable across field updates', async () => {
    const { result } = renderHook(
      () =>
        useDroppedComponentsState({
          isSigningMode: false,
          initialFields: null,
        }),
      { wrapper },
    );

    const initialSetter = result.current.setDroppedComponents;

    act(() => {
      result.current.setDroppedComponents([
        {
          id: 1,
          fieldId: 'field-1',
          component: 'Text',
          x: 12,
          y: 24,
          width: 120,
          height: 40,
          pageNumber: 1,
          fieldOwner: 'recipients',
          required: true,
          data: '',
          pageRect: null,
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.droppedComponents).toHaveLength(1);
    });

    expect(result.current.setDroppedComponents).toBe(initialSetter);
  });

  it('does not revert signing-mode edits when stale initial fields are re-sent before the local echo returns', async () => {
    const onFieldsChange = vi.fn();
    const initialSigningField: DocumentField = {
      ...signingField,
      value: '',
    };

    const { result, rerender } = renderHook(
      ({ initialFields }) =>
        useDroppedComponentsState({
          isSigningMode: true,
          initialFields,
          onFieldsChange,
        }),
      {
        initialProps: {
          initialFields: [initialSigningField],
        },
        wrapper,
      }
    );

    await waitFor(() => {
      expect(result.current.internalDroppedComponents).toHaveLength(1);
    });

    act(() => {
      result.current.setDroppedComponents((current) =>
        current.map((component) =>
          component.id === 1
            ? {
                ...component,
                data: 'typed in preview',
              }
            : component
        )
      );
    });

    expect(result.current.internalDroppedComponents[0].data).toBe('typed in preview');

    rerender({
      initialFields: [
        {
          ...initialSigningField,
          value: '',
        },
      ],
    });

    expect(result.current.internalDroppedComponents[0].data).toBe('typed in preview');

    rerender({
      initialFields: [
        {
          ...initialSigningField,
          value: 'typed in preview',
        },
      ],
    });

    await waitFor(() => {
      expect(result.current.internalDroppedComponents[0].data).toBe('typed in preview');
    });
  });

  it('applies consecutive signing-mode field edits against the latest store state', async () => {
    const onFieldsChange = vi.fn();
    const secondSigningField: DocumentField = {
      ...signingField,
      id: 'field-2',
      x: 220,
      recipientId: 'recipient-1',
      value: '',
    };

    const { result } = renderHook(
      () =>
        useDroppedComponentsState({
          isSigningMode: true,
          initialFields: [signingField, secondSigningField],
          onFieldsChange,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.internalDroppedComponents).toHaveLength(2);
    });

    act(() => {
      result.current.setDroppedComponents((current) =>
        current.map((component) =>
          component.fieldId === 'field-1'
            ? {
                ...component,
                data: 'alpha',
              }
            : component
        )
      );

      result.current.setDroppedComponents((current) =>
        current.map((component) =>
          component.fieldId === 'field-2'
            ? {
                ...component,
                data: 'beta',
              }
            : component
        )
      );
    });

    expect(result.current.internalDroppedComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: 'field-1', data: 'alpha' }),
        expect.objectContaining({ fieldId: 'field-2', data: 'beta' }),
      ])
    );
  });
});
