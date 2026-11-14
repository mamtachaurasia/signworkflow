// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PageThumbnailMenu from '../components/builder/PageThumbnailMenu';

type PageSize = { width: number; height: number };

class FakePage {
  constructor(public size: PageSize) {}

  getSize() {
    return this.size;
  }

  getRotation() {
    return { angle: 0 };
  }

  setRotation = vi.fn();
}

const createPdfDoc = (sizes: PageSize[]) => {
  const pages = sizes.map((size) => new FakePage(size));

  return {
    getPageCount: () => pages.length,
    getPage: (index: number) => pages[index],
    copyPages: vi.fn(async (_doc: unknown, indexes: number[]) => indexes.map((index) => new FakePage(pages[index].getSize()))),
    removePage: vi.fn((index: number) => {
      pages.splice(index, 1);
    }),
    insertPage: vi.fn((index: number, page: FakePage) => {
      pages.splice(index, 0, page);
    }),
  };
};

describe('PageThumbnailMenu', () => {
  it('passes original page sizes to the move callback before the pdf order changes', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const pdfDoc = createPdfDoc([
      { width: 612, height: 792 },
      { width: 612, height: 300 },
    ]);
    const onPageMoved = vi.fn();
    const onPdfUpdated = vi.fn().mockResolvedValue(undefined);

    render(
      <PageThumbnailMenu
        onClose={vi.fn()}
        triggerElement={trigger}
        pdfDoc={pdfDoc as never}
        pageIndex={0}
        onPdfUpdated={onPdfUpdated}
        onPageMoved={onPageMoved}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Move Page Down'));
    });

    expect(onPageMoved).toHaveBeenCalledWith({
      fromIndex: 0,
      toIndex: 1,
      pageSizes: [
        { width: 612, height: 792 },
        { width: 612, height: 300 },
      ],
    });
    expect(pdfDoc.removePage).toHaveBeenCalledWith(0);
    expect(pdfDoc.insertPage).toHaveBeenCalled();
    expect(onPdfUpdated).toHaveBeenCalled();
  });

  it('moves a page to a specific destination from the menu form', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const pdfDoc = createPdfDoc([
      { width: 612, height: 792 },
      { width: 612, height: 300 },
      { width: 612, height: 500 },
    ]);
    const onPageMoved = vi.fn();
    const onPdfUpdated = vi.fn().mockResolvedValue(undefined);

    render(
      <PageThumbnailMenu
        onClose={vi.fn()}
        triggerElement={trigger}
        pdfDoc={pdfDoc as never}
        pageIndex={0}
        onPdfUpdated={onPdfUpdated}
        onPageMoved={onPageMoved}
      />
    );

    expect(screen.getByLabelText('Move page to')).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Move page to'), {
        target: { value: '3' },
      });
      fireEvent.click(screen.getByText('Go'));
    });

    expect(onPageMoved).toHaveBeenCalledWith({
      fromIndex: 0,
      toIndex: 2,
      pageSizes: [
        { width: 612, height: 792 },
        { width: 612, height: 300 },
        { width: 612, height: 500 },
      ],
    });
    expect(pdfDoc.removePage).toHaveBeenCalledWith(0);
    expect(pdfDoc.insertPage).toHaveBeenCalledWith(2, expect.any(FakePage));
    expect(onPdfUpdated).toHaveBeenCalled();
  });

  it('opens the replace submenu and forwards the uploaded replacement file', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const pdfDoc = createPdfDoc([
      { width: 612, height: 792 },
    ]);
    const onReplacePageRequested = vi.fn();
    const onClose = vi.fn();

    render(
      <PageThumbnailMenu
        onClose={onClose}
        triggerElement={trigger}
        pdfDoc={pdfDoc as never}
        pageIndex={0}
        onPdfUpdated={vi.fn().mockResolvedValue(undefined)}
        onReplacePageRequested={onReplacePageRequested}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace Page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload New Document' }));

    const replacementFile = new File(['%PDF-1.4'], 'replacement.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(screen.getByLabelText('Upload replacement document'), {
      target: { files: [replacementFile] },
    });

    expect(onReplacePageRequested).toHaveBeenCalledWith(0, 'upload', replacementFile);
    expect(onClose).toHaveBeenCalled();
  });

  it('opens the replace submenu and forwards existing-document selection', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const pdfDoc = createPdfDoc([
      { width: 612, height: 792 },
    ]);
    const onReplacePageRequested = vi.fn();

    render(
      <PageThumbnailMenu
        onClose={vi.fn()}
        triggerElement={trigger}
        pdfDoc={pdfDoc as never}
        pageIndex={0}
        onPdfUpdated={vi.fn().mockResolvedValue(undefined)}
        onReplacePageRequested={onReplacePageRequested}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace Page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select from Existing Documents' }));

    expect(onReplacePageRequested).toHaveBeenCalledWith(0, 'existing');
  });

  it('opens the replace submenu and forwards template selection', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const pdfDoc = createPdfDoc([
      { width: 612, height: 792 },
    ]);
    const onReplacePageRequested = vi.fn();

    render(
      <PageThumbnailMenu
        onClose={vi.fn()}
        triggerElement={trigger}
        pdfDoc={pdfDoc as never}
        pageIndex={0}
        onPdfUpdated={vi.fn().mockResolvedValue(undefined)}
        onReplacePageRequested={onReplacePageRequested}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace Page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select from Templates' }));

    expect(onReplacePageRequested).toHaveBeenCalledWith(0, 'template');
  });
});
