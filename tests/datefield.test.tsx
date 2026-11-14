// @vitest-environment jsdom

import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DroppedComponents from '../components/builder/DroppedComponents';
import type { DroppedComponent, Recipient } from '../types/types';

type DroppedComponentsProps = React.ComponentProps<typeof DroppedComponents>;

function buildDateField(overrides: Partial<DroppedComponent> = {}): DroppedComponent {
  return {
    id: 1,
    fieldId: '1',
    component: 'Date',
    x: 0,
    y: 0,
    width: 120,
    height: 32,
    pageNumber: 1,
    pageRect: null,
    fieldOwner: 'recipients',
    required: true,
    data: overrides.data ?? null,
    settings: {
      dateFormat: 'YYYY-MM-DD (ISO)',
      ...(overrides.settings || {}),
    },
    ...overrides,
  };
}

const noop = () => {};
const textFieldRefs: DroppedComponentsProps['textFieldRefs'] = { current: {} };
const setSelectedFieldId: DroppedComponentsProps['setSelectedFieldId'] = () => undefined;
const onSelectField: DroppedComponentsProps['onSelectField'] = () => undefined;
const onAssignRecipient: DroppedComponentsProps['onAssignRecipient'] = () => undefined;
const onDuplicateField: DroppedComponentsProps['onDuplicateField'] = () => undefined;
const onDeleteField: DroppedComponentsProps['onDeleteField'] = () => undefined;
const updateField: DroppedComponentsProps['updateField'] = () => undefined;
const handleDragStop: DroppedComponentsProps['handleDragStop'] = () => undefined;
const handleResizeStop: DroppedComponentsProps['handleResizeStop'] = () => undefined;
const onClickField: DroppedComponentsProps['onClickField'] = () => undefined;

function renderDroppedComponents(field: DroppedComponent, recipients: Recipient[]) {
  return render(
    <DroppedComponents
      droppedComponents={[field]}
      selectedFieldId={field.id}
      setSelectedFieldId={setSelectedFieldId}
      onSelectField={onSelectField}
      onAssignRecipient={onAssignRecipient}
      onDuplicateField={onDuplicateField}
      onDeleteField={onDeleteField}
      updateField={updateField}
      handleDragStop={handleDragStop}
      handleResizeStop={handleResizeStop}
      textFieldRefs={textFieldRefs}
      zoom={1}
      recipients={recipients}
      onAddRecipients={noop}
      onClickField={onClickField}
      isSigningMode={false}
      isReadOnly={false}
      isSigned={false}
      currentRecipientId={undefined}
      guidedFieldId={null}
    />
  );
}

describe('builder Date field', () => {
  it('renders the actual date picker input for a Date field', () => {
    const field = buildDateField({ data: '2025-12-31' });
    const recipients: Recipient[] = [];

    const { container } = renderDroppedComponents(field, recipients);

    const input = container.querySelector('input.rmdp-input');
    expect(input).not.toBeNull();
  });

  it('uses defaultValue when no explicit data is present', () => {
    const field = buildDateField({
      data: null,
      settings: {
        dateFormat: 'YYYY-MM-DD (ISO)',
        defaultValue: '2025-12-31',
      },
    });

    const { container } = renderDroppedComponents(field, []);

    const input = container.querySelector('input.rmdp-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    // react-multi-date-picker echoes the underlying value string when using a simple format
    expect(input!.value).toBe('2025-12-31');
  });
});
