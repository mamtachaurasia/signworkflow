// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FieldPropertyPanel from '../components/builder/FieldPropertyPanel';
import type { DroppedComponent, Recipient } from '../types/types';
import { DATE_FORMAT_OPTIONS } from '../lib/date-formats';

type FieldPropertyPanelProps = React.ComponentProps<typeof FieldPropertyPanel>;

const defaultProps: Omit<FieldPropertyPanelProps, 'field'> = {
  recipients: [] as Recipient[],
  isReadOnly: false,
  onClose: () => {},
  onUpdateField: () => {},
  onAssignRecipient: () => {},
  onDuplicateField: () => {},
  onDeleteField: () => {},
};

function renderPanel(field: Partial<DroppedComponent> | null) {
  return render(<FieldPropertyPanel field={field as DroppedComponent} {...defaultProps} />);
}

describe('FieldPropertyPanel UI', () => {
  it('renders a dropdown for date format when editing a date field', () => {
    const dateField: Partial<DroppedComponent> = {
      id: 1,
      component: 'Date',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      pageNumber: 1,
      required: true,
      settings: { dateFormat: DATE_FORMAT_OPTIONS[0] },
    };
    const { container } = renderPanel(dateField);
    const selects = container.querySelectorAll('select');

    expect(selects.length).toBeGreaterThan(1);
    expect(Array.from(selects[1].options).some((option) => option.text === DATE_FORMAT_OPTIONS[0])).toBe(true);
    expect(selects[1].value).toBe(DATE_FORMAT_OPTIONS[0]);
  });

  it('defaults to ISO when no dateFormat is present', () => {
    const blankField: Partial<DroppedComponent> = {
      id: 5,
      component: 'Date',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      pageNumber: 1,
      required: true,
      settings: {},
    };
    const { container } = renderPanel(blankField);
    // the first select is validation rule, second is date format
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(1);
    expect(selects[1].value).toBe('DD/MM/YYYY (EU)');
  });

  it('renders the date-picker input for default value when editing a date field', () => {
    const isoField: Partial<DroppedComponent> = {
      id: 2,
      component: 'Date',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      pageNumber: 1,
      required: true,
      settings: { dateFormat: 'YYYY-MM-DD (ISO)' },
    };
    const { rerender, container } = renderPanel(isoField);
    expect(container.querySelector('input.rmdp-input')).not.toBeNull();

    const euField: Partial<DroppedComponent> = {
      ...isoField,
      id: 6,
      settings: { dateFormat: 'DD/MM/YYYY (EU)' },
    };
    rerender(<FieldPropertyPanel field={euField as DroppedComponent} {...defaultProps} />);
    expect(container.querySelector('input.rmdp-input')).not.toBeNull();

    const noFormatField: Partial<DroppedComponent> = {
      ...isoField,
      id: 3,
      settings: {},
    };
    rerender(<FieldPropertyPanel field={noFormatField as DroppedComponent} {...defaultProps} />);
    expect(container.querySelector('input.rmdp-input')).not.toBeNull();
  });

  it('normalizes odd default values when ISO format is set and updates when switching to EU', () => {
    const mockUpdate = vi.fn();
    const props = { ...defaultProps, onUpdateField: mockUpdate };
    const weirdField: Partial<DroppedComponent> = {
      id: 9,
      component: 'Date',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      pageNumber: 1,
      required: true,
      settings: { dateFormat: 'YYYY-MM-DD (ISO)', defaultValue: '12-10-07' },
    };
    const { rerender } = render(<FieldPropertyPanel field={weirdField as DroppedComponent} {...props} />);
    // first normalization to ISO
    expect(mockUpdate).toHaveBeenCalledWith(9, {
      settings: { defaultValue: '2007-12-10' },
    });

    // simulate switching format to EU
    const euField = { ...weirdField, settings: { dateFormat: 'DD/MM/YYYY (EU)', defaultValue: '2007-12-10' } };
    rerender(<FieldPropertyPanel field={euField as DroppedComponent} {...props} />);
    expect(mockUpdate).toHaveBeenCalledWith(9, {
      settings: { defaultValue: '10/12/2007' },
    });

    // now test clearing invalid value when switching to ISO
    const badField = { ...weirdField, settings: { dateFormat: 'YYYY-MM-DD (ISO)', defaultValue: '35-12-08' } };
    rerender(<FieldPropertyPanel field={badField as DroppedComponent} {...props} />);
    // last action when iso applied should clear the bogus value
    let lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1];
    expect(lastCall[1].settings.defaultValue).toBe('');

    // also ensure a valid EU-formatted value converts rather than disappears
    const euGood = { ...weirdField, settings: { dateFormat: 'YYYY-MM-DD (ISO)', defaultValue: '10/12/2007' } };
    rerender(<FieldPropertyPanel field={euGood as DroppedComponent} {...props} />);
    lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1];
    expect(lastCall[1].settings.defaultValue).toBe('2007-12-10');
  });

  it('always renders the date-picker even with a custom/unlisted format', () => {
    const customField: Partial<DroppedComponent> = {
      id: 4,
      component: 'Date',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      pageNumber: 1,
      required: true,
      settings: { dateFormat: 'MM/DD/YYYY (US)' },
    };
    const { container } = renderPanel(customField);
    const pickerInput = container.querySelector('input.rmdp-input');

    expect(pickerInput).not.toBeNull();
  });

  it('offers a repeat dialog for multi-page documents', () => {
    const repeatField = vi.fn();
    const field: Partial<DroppedComponent> = {
      id: 12,
      component: 'Text',
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      pageNumber: 1,
      required: true,
      settings: {},
    };

    render(
      <FieldPropertyPanel
        field={field as DroppedComponent}
        {...defaultProps}
        pageCount={3}
        repeatCoveredPageNumbers={[1]}
        onRepeatFieldOnPages={repeatField}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /repeat/i }));
    fireEvent.click(screen.getByRole('button', { name: /repeat on 2 pages/i }));

    expect(repeatField).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }), [2, 3]);
  });

  it('disables repeat when the selected field already covers every page', () => {
    const field: Partial<DroppedComponent> = {
      id: 13,
      component: 'Text',
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      pageNumber: 1,
      required: true,
      repeatGroupId: 'repeat-group-1',
      settings: {},
    };

    render(
      <FieldPropertyPanel
        field={field as DroppedComponent}
        {...defaultProps}
        pageCount={3}
        repeatCoveredPageNumbers={[1, 2, 3]}
        onRepeatFieldOnPages={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /already repeated/i })).toBeDisabled();
  });

  it('allows repeating on custom searched pages only', () => {
    const repeatField = vi.fn();
    const field: Partial<DroppedComponent> = {
      id: 14,
      component: 'Text',
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      pageNumber: 1,
      required: true,
      settings: {},
    };

    render(
      <FieldPropertyPanel
        field={field as DroppedComponent}
        {...defaultProps}
        pageCount={3}
        repeatCoveredPageNumbers={[1]}
        onRepeatFieldOnPages={repeatField}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /repeat/i }));
    expect(screen.getByRole('dialog')).toHaveClass('w-[calc(100vw-2rem)]');
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByRole('combobox', { name: /search pages/i }), {
      target: { value: '2' },
    });
    expect(screen.getByRole('listbox', { name: /repeat page options/i })).toHaveClass('overscroll-contain');
    fireEvent.click(screen.getByRole('option', { name: 'Page 2' }));
    fireEvent.click(screen.getByRole('button', { name: /repeat on 1 page/i }));

    expect(repeatField).toHaveBeenCalledWith(expect.objectContaining({ id: 14 }), [2]);
  });

  it('disables the page search while odd or even scope is selected and keeps custom available', () => {
    const field: Partial<DroppedComponent> = {
      id: 15,
      component: 'Text',
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      pageNumber: 1,
      required: true,
      settings: {},
    };

    render(
      <FieldPropertyPanel
        field={field as DroppedComponent}
        {...defaultProps}
        pageCount={4}
        repeatCoveredPageNumbers={[1]}
        onRepeatFieldOnPages={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /repeat/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Odd' }));
    expect(screen.getByRole('combobox', { name: /search pages/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Even' }));
    expect(screen.getByRole('combobox', { name: /search pages/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByRole('combobox', { name: /search pages/i })).toBeEnabled();
  });
});
