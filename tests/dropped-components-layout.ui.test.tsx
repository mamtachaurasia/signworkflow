// @vitest-environment jsdom

import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DroppedComponents from '../components/builder/DroppedComponents';
import type { DroppedComponent } from '../types/types';

type DroppedComponentsProps = React.ComponentProps<typeof DroppedComponents>;

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

function renderDroppedComponents(field: DroppedComponent) {
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
      recipients={[]}
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

describe('DroppedComponents layout regression', () => {
  it('does not force all fields to render at the old 150x50 minimum size', () => {
    const field: DroppedComponent = {
      id: 1,
      fieldId: 'field-1',
      component: 'Date',
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      pageNumber: 1,
      pageRect: null,
      fieldOwner: 'recipients',
      required: true,
      data: '2026-04-03',
      settings: { dateFormat: 'YYYY-MM-DD (ISO)' },
    };

    const { container } = renderDroppedComponents(field);
    const wrapper = container.querySelector('.react-draggable');

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).not.toContain('min-w-[150px]');
    expect(wrapper?.className).not.toContain('min-h-[50px]');
  });

  it('uses compact builder input styling instead of the full app input chrome', () => {
    const field: DroppedComponent = {
      id: 2,
      fieldId: 'field-2',
      component: 'Text',
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      pageNumber: 1,
      pageRect: null,
      fieldOwner: 'recipients',
      required: true,
      data: '',
      settings: { multiline: false },
      placeholder: 'Enter text',
    };

    const { container } = renderDroppedComponents(field);
    const input = container.querySelector('input[type="text"]');

    expect(input).not.toBeNull();
    expect(input?.className).toContain('!h-full');
    expect(input?.className).toContain('border-0');
  });
});
