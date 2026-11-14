import { describe, expect, it } from 'vitest';
import {
  estimateAutoFieldDimensions,
  fitFieldWithinPageBounds,
  resolveAutoResizeDimensions,
} from '../utils/builder/fieldLayout';

describe('fieldLayout utilities', () => {
  it('keeps the field wrapper aligned with the canonical auto-size helper', () => {
    const field = {
      id: 1,
      component: 'Dropdown',
      x: 0,
      y: 0,
      width: 60,
      height: 24,
      settings: {
        allowResize: true,
        options: ['Short', 'A substantially longer option'],
      },
    };

    expect(estimateAutoFieldDimensions(field, null)).toEqual(
      resolveAutoResizeDimensions({
        component: field.component,
        width: field.width,
        height: field.height,
        value: null,
        settings: field.settings,
      })
    );
  });

  it('clamps x and y into the current page bounds', () => {
    const result = fitFieldWithinPageBounds(
      {
        x: 280,
        y: 180,
        width: 80,
        height: 40,
        pageRect: null,
      },
      {
        left: 20,
        top: 10,
        width: 200,
        height: 120,
        pageRect: null,
      }
    );

    expect(result).toMatchObject({
      x: 140,
      y: 90,
      width: 80,
      height: 40,
    });
  });

  it('moves the field left and up to preserve size before shrinking it', () => {
    const result = fitFieldWithinPageBounds(
      {
        x: 150,
        y: 95,
        width: 120,
        height: 60,
        pageRect: null,
      },
      {
        left: 0,
        top: 0,
        width: 220,
        height: 130,
        pageRect: null,
      }
    );

    expect(result).toMatchObject({
      x: 100,
      y: 70,
      width: 120,
      height: 60,
    });
  });
});
