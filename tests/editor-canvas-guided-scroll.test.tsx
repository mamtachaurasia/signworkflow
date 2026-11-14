// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EditorCanvas from '../components/builder/EditorCanvas';

const scrollToMock = vi.fn();
const storeState = {
  draggingComponent: null,
  droppedComponents: [
    {
      id: 1,
      fieldId: 'field-1',
      x: 100,
      y: 1400,
      width: 160,
      height: 60,
    },
  ],
  error: null,
  recipients: [],
  selectedFieldId: null,
  setSelectedFieldId: vi.fn(),
};

vi.mock('../components/builder/DroppedComponents', () => ({
  default: ({ droppedComponents }: { droppedComponents: Array<{ id: number; fieldId?: string }> }) => (
    <div>
      {droppedComponents.map((field) => (
        <div
          key={field.id}
          data-field-id={field.fieldId ?? String(field.id)}
        />
      ))}
    </div>
  ),
}));

vi.mock('../components/builder/PDFViewer', () => ({
  default: () => null,
}));

vi.mock('@/hooks/useBuilderStore', () => ({
  useBuilderStore: () => storeState,
}));

describe('EditorCanvas guided scroll', () => {
  beforeEach(() => {
    scrollToMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
    });
  });

  it('scrolls the canvas container to the guided field', async () => {
    const documentRef = React.createRef<HTMLDivElement>();
    const pageRefs = { current: [] as Array<HTMLDivElement | null> };

    const { container } = render(
      <div style={{ height: '800px' }}>
        <EditorCanvas
          imageRef={React.createRef<HTMLInputElement>()}
          onImgUpload={() => {}}
          containerHeight={2200}
          zoom={1}
          documentRef={documentRef}
          mouseMoveOnDropArea={() => {}}
          mouseLeaveOnDropArea={() => {}}
          clickOnDropArea={() => {}}
          onSelectField={() => {}}
          onAssignRecipient={() => {}}
          onDuplicateField={() => {}}
          onDeleteField={() => {}}
          updateField={() => {}}
          handleDragStop={() => {}}
          handleResizeStop={() => {}}
          textFieldRefs={{ current: {} }}
          onAddRecipients={() => {}}
          isSigningMode
          isReadOnly={false}
          isSigned={false}
          onClickField={() => {}}
          currentRecipientId="recipient-1"
          guidedFieldId="field-1"
          selectedFile={null}
          pages={[]}
          pageRefs={pageRefs}
          generateThumbnails={() => {}}
          toggleAddPageMenu={() => {}}
          toggleMenu={() => {}}
          signingToken="token-1"
        />
      </div>
    );

    const dropzone = container.querySelector('#dropzone') as HTMLDivElement | null;
    expect(dropzone).toBeTruthy();

    Object.defineProperty(dropzone, 'clientHeight', {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(dropzone, 'clientWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(dropzone, 'scrollHeight', {
      configurable: true,
      value: 2400,
    });
    Object.defineProperty(dropzone, 'scrollWidth', {
      configurable: true,
      value: 1000,
    });

    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 1130,
        left: 0,
        behavior: 'smooth',
      });
    });
  });
});
