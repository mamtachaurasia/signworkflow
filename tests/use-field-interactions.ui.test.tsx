// @vitest-environment jsdom

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFieldInteractions } from '../hooks/builder/useFieldInteractions';
import type { DroppedComponent, DroppingField, Recipient } from '../types/types';

vi.mock('@/lib/pdf', () => ({
  blobToURL: vi.fn().mockResolvedValue('data:image/png;base64,uploaded-image'),
}));

const recipients: Recipient[] = [
  {
    id: 'recipient-1',
    email: 'recipient@example.com',
    name: 'Recipient',
    role: 'signer',
    color: '#2563eb',
    order: 1,
    status: 'pending',
  },
];

const imageField: DroppedComponent = {
  id: 7,
  fieldId: 'field-7',
  component: 'Image',
  x: 40,
  y: 60,
  width: 120,
  height: 60,
  pageNumber: 1,
  fieldOwner: 'me',
  data: null,
  mimeType: undefined,
};

const paletteSelection: DroppingField = {
  component: 'Image',
  x: 0,
  y: 0,
  fieldOwner: 'me',
  data: null,
};

describe('useFieldInteractions', () => {
  it('uploads into the clicked image field even when the palette selection is still active', async () => {
    const saveState = vi.fn();
    const fileInput = document.createElement('input');
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined);

    const { result } = renderHook(() => {
      const [draggingComponent, setDraggingComponent] = React.useState<DroppingField | null>(paletteSelection);
      const [droppedComponents, setDroppedComponents] = React.useState<DroppedComponent[]>([imageField]);
      const [position, setPosition] = React.useState({ x: 0, y: 0 });
      const [selectedFieldId, setSelectedFieldId] = React.useState<number | null>(null);
      const [selectedFieldForDialog, setSelectedFieldForDialog] = React.useState<DroppedComponent | null>(null);
      const [canvasFields, setCanvasFields] = React.useState(false);
      const [photoDialog, setPhotoDialog] = React.useState(false);
      const [recipientsState, setRecipients] = React.useState<Recipient[]>(recipients);
      const imageRef = React.useRef<HTMLInputElement>(fileInput);

      const interactions = useFieldInteractions({
        isSigningMode: false,
        currentPage: 1,
        zoom: 1,
        user: null,
        defaults: {},
        recipients: recipientsState,
        setRecipients,
        draggingComponent,
        setDraggingComponent,
        setPosition,
        elementId: 10,
        setElementId: vi.fn() as unknown as React.Dispatch<React.SetStateAction<number>>,
        setDroppedComponents,
        droppedComponents,
        saveState,
        documentRef: { current: document.createElement('div') },
        pageRefs: { current: [] },
        setSelectedFieldId,
        setSelectedFieldForDialog,
        setCanvasFields,
        setPhotoDialog,
        imageRef,
      });

      return {
        ...interactions,
        droppedComponents,
        draggingComponent,
        position,
        selectedFieldId,
        selectedFieldForDialog,
        canvasFields,
        photoDialog,
      };
    });

    act(() => {
      result.current.clickField(
        { stopPropagation: vi.fn() } as unknown as React.MouseEvent<Element>,
        imageField
      );
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);

    const file = new File(['image-bytes'], 'upload.png', { type: 'image/png' });
    const uploadEvent = {
      target: {
        files: [file],
        value: 'upload.png',
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.onImgUpload(uploadEvent);
    });

    await waitFor(() => {
      expect(result.current.droppedComponents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: imageField.id,
            data: 'data:image/png;base64,uploaded-image',
            mimeType: 'image/png',
          }),
        ])
      );
    });

    expect(saveState).toHaveBeenCalled();
    expect(result.current.draggingComponent).toEqual(paletteSelection);
  });

  it('clears repeat identity when duplicating a repeated field', () => {
    const saveState = vi.fn();
    const repeatedField: DroppedComponent = {
      ...imageField,
      repeatGroupId: 'repeat-group-1',
      repeatSourceId: 'field-7',
    };

    const { result } = renderHook(() => {
      const [draggingComponent, setDraggingComponent] = React.useState<DroppingField | null>(null);
      const [droppedComponents, setDroppedComponents] = React.useState<DroppedComponent[]>([repeatedField]);
      const [position, setPosition] = React.useState({ x: 0, y: 0 });
      const [selectedFieldId, setSelectedFieldId] = React.useState<number | null>(null);
      const [selectedFieldForDialog, setSelectedFieldForDialog] = React.useState<DroppedComponent | null>(null);
      const [canvasFields, setCanvasFields] = React.useState(false);
      const [photoDialog, setPhotoDialog] = React.useState(false);
      const [recipientsState, setRecipients] = React.useState<Recipient[]>(recipients);
      const [elementId, setElementId] = React.useState(10);
      const imageRef = React.useRef<HTMLInputElement>(document.createElement('input'));

      const interactions = useFieldInteractions({
        isSigningMode: false,
        currentPage: 1,
        zoom: 1,
        user: null,
        defaults: {},
        recipients: recipientsState,
        setRecipients,
        draggingComponent,
        setDraggingComponent,
        setPosition,
        elementId,
        setElementId,
        setDroppedComponents,
        droppedComponents,
        saveState,
        documentRef: { current: document.createElement('div') },
        pageRefs: { current: [] },
        setSelectedFieldId,
        setSelectedFieldForDialog,
        setCanvasFields,
        setPhotoDialog,
        imageRef,
      });

      return {
        ...interactions,
        droppedComponents,
        position,
        selectedFieldId,
        selectedFieldForDialog,
        canvasFields,
        photoDialog,
      };
    });

    act(() => {
      result.current.handleDuplicateField(repeatedField);
    });

    expect(result.current.droppedComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 10,
          fieldId: '10',
          repeatGroupId: undefined,
          repeatSourceId: undefined,
        }),
      ])
    );
    expect(saveState).toHaveBeenCalled();
  });
});
