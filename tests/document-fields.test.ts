import { describe, expect, it } from 'vitest';

import { dedupeFieldsById, mapFieldToDroppedComponent, normalizeComponentSettings } from '@/utils/builder/documentFields';
import type { DocumentField } from '@/types/types';

describe('document-fields helpers', () => {
  it('normalizes email settings for persistence', () => {
    const normalized = normalizeComponentSettings('Email', {});
    expect(normalized?.inputType).toBe('email');
    expect(normalized?.multiline).toBe(false);
  });

  it('maps text field with email inputType back to Email component', () => {
    const field: DocumentField = {
      id: 'field-1',
      type: 'text',
      x: 10,
      y: 20,
      width: 200,
      height: 40,
      pageNumber: 1,
      required: true,
      settings: { inputType: 'email' },
      value: '',
    };

    const mapped = mapFieldToDroppedComponent(field, new Set<number>());
    expect(mapped.component).toBe('Email');
    expect(mapped.settings?.inputType).toBe('email');
  });

  it('hydrates default value only when incoming value is undefined', () => {
    const field: DocumentField = {
      id: 'field-default',
      type: 'text',
      x: 0,
      y: 0,
      width: 150,
      height: 40,
      pageNumber: 1,
      required: true,
      settings: { defaultValue: 'Prefilled' },
    };

    const mapped = mapFieldToDroppedComponent(field, new Set<number>());
    expect(mapped.data).toBe('Prefilled');
  });

  it('does not re-hydrate default value when incoming value is empty string', () => {
    const field: DocumentField = {
      id: 'field-default-empty',
      type: 'text',
      x: 0,
      y: 0,
      width: 150,
      height: 40,
      pageNumber: 1,
      required: true,
      value: '',
      settings: { defaultValue: 'Prefilled' },
    };

    const mapped = mapFieldToDroppedComponent(field, new Set<number>());
    expect(mapped.data).toBe('');
  });

  it('preserves richer settings when duplicate field IDs are deduped', () => {
    const existing: DocumentField = {
      id: 'field-1',
      type: 'text',
      x: 10,
      y: 20,
      width: 200,
      height: 40,
      pageNumber: 1,
      required: true,
      settings: { inputType: 'email' },
      value: '',
    };
    const duplicateWithoutSettings: DocumentField = {
      ...existing,
      settings: undefined,
    };

    const deduped = dedupeFieldsById([existing, duplicateWithoutSettings]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].settings?.inputType).toBe('email');
  });

  it('keeps default size when allowResize is not enabled', () => {
    const field: DocumentField = {
      id: 'field-no-resize',
      type: 'text',
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      pageNumber: 1,
      required: true,
      value: 'This is a long value that should not auto-expand by default',
      settings: {},
    };

    const mapped = mapFieldToDroppedComponent(field, new Set<number>());
    expect(mapped.width).toBe(40);
    expect(mapped.height).toBe(20);
  });

  it('keeps fixed size when field is read-only even if allowResize is enabled', () => {
    const field: DocumentField = {
      id: 'field-readonly-no-resize',
      type: 'text',
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      pageNumber: 1,
      required: true,
      value: 'Long content that would otherwise trigger resize',
      settings: {
        allowResize: true,
        readOnly: true,
      },
    };

    const mapped = mapFieldToDroppedComponent(field, new Set<number>());
    expect(mapped.width).toBe(40);
    expect(mapped.height).toBe(20);
  });

  it('auto-expands configured resizable fields through the shared sizing helper', () => {
    const field: DocumentField = {
      id: 'field-resize',
      type: 'text',
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      pageNumber: 1,
      required: true,
      value: 'This configured value should expand the field width',
      settings: { allowResize: true },
    };

    const mapped = mapFieldToDroppedComponent(field, new Set<number>());
    expect(mapped.width).toBeGreaterThan(40);
    expect(mapped.height).toBe(32);
  });

  it('strips time portion from default value for date fields', () => {
    const field: DocumentField = {
      id: 'date-with-time',
      type: 'date',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      pageNumber: 1,
      required: true,
      settings: { defaultValue: '2025-03-01T15:30:00Z' },
    };
    const mapped = mapFieldToDroppedComponent(field, new Set<number>());
    expect(mapped.settings?.defaultValue).toBe('2025-03-01');
    expect(mapped.data).toBe('2025-03-01');
  });
});
