import { describe, expect, it } from 'vitest';

import { serializeDroppedComponentToField } from '@/lib/api';
import type { DroppedComponent } from '@/types/types';

describe('serializeDroppedComponentToField', () => {
  it('preserves template field metadata used by save-as-template and template save flows', () => {
    const field = serializeDroppedComponentToField(
      {
        id: 7,
        fieldId: 'field-7',
        repeatGroupId: 'repeat-group-7',
        repeatSourceId: 'field-7',
        component: 'Image',
        x: 32,
        y: 64,
        width: 120,
        height: 48,
        pageNumber: 2,
        assignedRecipientId: 'recipient-1',
        required: true,
        data: 'image-ref',
        placeholder: 'Upload image',
        settings: {
          label: 'Profile photo',
          allowResize: true,
        },
        mimeType: 'image/png',
        fieldOwner: 'recipients',
        pageRect: {
          top: 300,
          left: 20,
          right: 620,
          bottom: 1100,
          width: 600,
          height: 800,
          x: 20,
          y: 300,
        },
      } as DroppedComponent,
      {
        currentPage: 1,
      }
    );

    expect(field).toMatchObject({
      id: 'field-7',
      repeatGroupId: 'repeat-group-7',
      repeatSourceId: 'field-7',
      type: 'image',
      recipientId: 'recipient-1',
      mimeType: 'image/png',
      fieldOwner: 'recipients',
      placeholder: 'Upload image',
      value: 'image-ref',
      settings: {
        label: 'Profile photo',
        allowResize: true,
      },
    });
    expect(field.pageRect).toMatchObject({
      top: 300,
      left: 20,
      width: 600,
      height: 800,
    });
  });

  it('normalizes zoomed viewport page bounds into canvas coordinates', () => {
    const field = serializeDroppedComponentToField(
      {
        id: 8,
        component: 'Signature',
        x: 80,
        y: 140,
        width: 120,
        height: 48,
        pageNumber: 1,
        pageRect: {
          x: 150,
          y: 300,
          left: 150,
          top: 300,
          right: 1150,
          bottom: 1700,
          width: 1000,
          height: 1400,
        },
      } as DroppedComponent,
      {
        currentPage: 1,
        canvasRect: { left: 50, top: 100 } as DOMRect,
        zoom: 2,
      }
    );

    expect(field.pageRect).toEqual({
      x: 50,
      y: 100,
      left: 50,
      top: 100,
      right: 550,
      bottom: 800,
      width: 500,
      height: 700,
    });
  });
});
