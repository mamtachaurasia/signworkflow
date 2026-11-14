// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DroppedComponents from '../components/builder/DroppedComponents';
import type { DroppedComponent, Recipient } from '../types/types';

type DroppedComponentsProps = React.ComponentProps<typeof DroppedComponents>;

const noop = () => undefined;
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

function buildField(overrides: Partial<DroppedComponent> = {}): DroppedComponent {
  return {
    id: 1,
    fieldId: 'field-1',
    component: 'Text',
    x: 0,
    y: 0,
    width: 160,
    height: 48,
    pageNumber: 1,
    pageRect: null,
    fieldOwner: 'recipients',
    assignedRecipientId: 'recipient-1',
    required: true,
    data: 'Reviewed value',
    settings: {
      readOnly: true,
    },
    ...overrides,
  };
}

const recipients: Recipient[] = [
  {
    id: 'recipient-1',
    email: 'reviewer@example.com',
    name: 'Reviewer',
    role: 'signer',
    color: '#2563eb',
    order: 1,
    status: 'pending',
  },
];

function renderDroppedComponents(field: DroppedComponent, badgeLabel: 'Sign here' | 'Review') {
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
      isSigningMode
      isReadOnly={false}
      isSigned={false}
      currentRecipientId="recipient-1"
      guidedFieldId="field-1"
      guidedBadgeLabel={badgeLabel}
    />
  );
}

describe('guided signer badge', () => {
  it('shows Review while manual review mode is active', () => {
    renderDroppedComponents(buildField(), 'Review');

    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows Sign here during normal guided signing', () => {
    renderDroppedComponents(buildField({ settings: { readOnly: false }, data: '' }), 'Sign here');

    expect(screen.getByText('Sign here')).toBeInTheDocument();
  });

  it('shows Sign here for an optional guided field', () => {
    renderDroppedComponents(
      buildField({
        required: false,
        settings: { readOnly: false },
        data: '',
      }),
      'Sign here'
    );

    expect(screen.getByText('Sign here')).toBeInTheDocument();
  });
});
