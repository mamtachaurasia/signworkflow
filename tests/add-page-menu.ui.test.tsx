// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AddPageMenu from '../components/builder/AddPageMenu';

describe('AddPageMenu', () => {
  it('inserts a blank page from the menu', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const onInsertBlankPage = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <AddPageMenu
        onClose={onClose}
        triggerElement={trigger}
        insertAfterPageNumber={2}
        onInsertBlankPage={onInsertBlankPage}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Blank Page' }));

    expect(onInsertBlankPage).toHaveBeenCalledWith(2);
  });

  it('forwards uploaded PDFs for append', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const onAppendPdfRequested = vi.fn();

    render(
      <AddPageMenu
        onClose={vi.fn()}
        triggerElement={trigger}
        insertAfterPageNumber={3}
        onInsertBlankPage={vi.fn()}
        onAppendPdfRequested={onAppendPdfRequested}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Upload New Document' }));

    const file = new File(['%PDF-1.4'], 'append.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Upload document to append'), {
      target: { files: [file] },
    });

    expect(onAppendPdfRequested).toHaveBeenCalledWith(3, 'upload', file);
  });

  it('forwards template selection for append', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const onAppendPdfRequested = vi.fn();

    render(
      <AddPageMenu
        onClose={vi.fn()}
        triggerElement={trigger}
        insertAfterPageNumber={1}
        onInsertBlankPage={vi.fn()}
        onAppendPdfRequested={onAppendPdfRequested}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select from Templates' }));

    expect(onAppendPdfRequested).toHaveBeenCalledWith(1, 'template');
  });
});
