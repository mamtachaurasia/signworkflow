// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DroppedComponents from '../components/builder/DroppedComponents';
import type { DroppedComponent } from '../types/types';
import { shouldKeepFieldPropertyPanelOpen } from '../utils/builder/fieldPanelOutsideClick';

type DroppedComponentsProps = React.ComponentProps<typeof DroppedComponents>;

const dropdownField: DroppedComponent = {
  id: 41,
  fieldId: 'dropdown-41',
  component: 'Dropdown',
  x: 20,
  y: 30,
  width: 180,
  height: 42,
  pageNumber: 1,
  pageRect: null,
  fieldOwner: 'recipients',
  assignedRecipientId: 'recipient-1',
  required: true,
  data: '',
  placeholder: 'Choose a department',
  settings: {
    options: ['Legal', 'Finance'],
  },
};

function renderDropdown({
  isSigningMode = false,
  isReadOnly = false,
}: {
  isSigningMode?: boolean;
  isReadOnly?: boolean;
} = {}) {
  const setSelectedFieldId = vi.fn();
  const onSelectField = vi.fn();
  const updateField = vi.fn();
  const onClickField = vi.fn();

  const props: DroppedComponentsProps = {
    droppedComponents: [dropdownField],
    selectedFieldId: null,
    setSelectedFieldId,
    onSelectField,
    onAssignRecipient: vi.fn(),
    onDuplicateField: vi.fn(),
    onDeleteField: vi.fn(),
    updateField,
    handleDragStop: vi.fn(),
    handleResizeStop: vi.fn(),
    textFieldRefs: { current: {} },
    zoom: 1,
    recipients: [],
    onAddRecipients: vi.fn(),
    onClickField,
    isSigningMode,
    isReadOnly,
    isSigned: false,
    currentRecipientId: 'recipient-1',
    guidedFieldId: null,
  };

  const view = render(<DroppedComponents {...props} />);

  return {
    ...view,
    onClickField,
    onSelectField,
    setSelectedFieldId,
    updateField,
  };
}

function getBuilderSelectionOverlay(trigger: HTMLElement): HTMLElement {
  const overlay = trigger.parentElement?.querySelector<HTMLElement>(':scope > div.z-99');
  expect(overlay).not.toBeNull();
  return overlay as HTMLElement;
}

async function selectOption(trigger: HTMLElement, optionName: string) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });

  fireEvent.click(trigger);
  return screen.findByRole('option', { name: optionName });
}

describe('builder dropdown field interaction', () => {
  it('selects the field from its main area without opening its choices', () => {
    const { onSelectField, setSelectedFieldId, updateField } = renderDropdown();
    const trigger = screen.getByRole('combobox');
    const selectionOverlay = getBuilderSelectionOverlay(trigger);

    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent('Choose a department');

    fireEvent.click(selectionOverlay);

    expect(setSelectedFieldId).toHaveBeenCalledWith(dropdownField.id);
    expect(onSelectField).toHaveBeenCalledWith(dropdownField);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(updateField).not.toHaveBeenCalled();
  });

  it('keeps dropdown options available from the exposed builder trigger', async () => {
    const { updateField } = renderDropdown();
    const trigger = screen.getByRole('combobox');
    const option = await selectOption(trigger, 'Finance');

    expect(option.closest('[data-dropdown-portal="true"]')).not.toBeNull();
    fireEvent.click(option);

    expect(updateField).toHaveBeenCalledWith('Finance', dropdownField.id);
  });

  it('keeps the real dropdown interactive for the assigned signer', async () => {
    const { updateField } = renderDropdown({ isSigningMode: true });
    const trigger = screen.getByRole('combobox');

    expect(trigger).toBeEnabled();
    expect(trigger.parentElement?.querySelector(':scope > div.z-99')).toBeNull();

    const option = await selectOption(trigger, 'Finance');
    expect(option.closest('[data-dropdown-portal="true"]')).not.toBeNull();
    expect(shouldKeepFieldPropertyPanelOpen(option)).toBe(true);

    fireEvent.click(option);

    expect(updateField).toHaveBeenCalledWith('Finance', dropdownField.id);
  });

  it('keeps read-only signing dropdowns disabled', () => {
    const { setSelectedFieldId, updateField } = renderDropdown({
      isSigningMode: true,
      isReadOnly: true,
    });
    const trigger = screen.getByRole('combobox');
    const selectionOverlay = getBuilderSelectionOverlay(trigger);

    expect(trigger).toBeDisabled();
    fireEvent.click(selectionOverlay);
    expect(setSelectedFieldId).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(updateField).not.toHaveBeenCalled();
  });
});
