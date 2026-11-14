// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const destroyPdf = vi.fn().mockResolvedValue(undefined);
const renderPage = vi.fn(() => ({ promise: Promise.resolve() }));
const getViewport = vi.fn(({ scale }: { scale: number }) => ({
  width: 600 * scale,
  height: 800 * scale,
}));
const getDocument = vi.fn(() => ({
  promise: Promise.resolve({
    getPage: vi.fn().mockResolvedValue({ getViewport, render: renderPage }),
    destroy: destroyPdf,
  }),
}));

vi.mock('react-pdf', () => ({
  pdfjs: {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument,
  },
}));

vi.mock('next/image', () => ({
  default: (imageProps: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const props = { ...imageProps };
    delete props.unoptimized;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={props.alt ?? ''} {...props} />
    );
  },
}));

import PdfThumbnail, { clearPdfThumbnailCache } from '@/components/PdfThumbnails';

describe('PdfThumbnail session cache', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,dGh1bWJuYWls');
    clearPdfThumbnailCache();
    getDocument.mockClear();
    getViewport.mockClear();
    renderPage.mockClear();
    destroyPdf.mockClear();
  });

  afterEach(() => {
    clearPdfThumbnailCache();
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reuses the rendered thumbnail when the document row is remounted', async () => {
    const firstVisit = render(
      <PdfThumbnail fileUrl="/api/documents/doc-1" cacheKey="doc-1:v1" width={40} height={50} />
    );
    await screen.findByRole('img', { name: 'PDF thumbnail' });
    expect(getDocument).toHaveBeenCalledTimes(1);
    firstVisit.unmount();

    render(<PdfThumbnail fileUrl="/api/documents/doc-1" cacheKey="doc-1:v1" width={40} height={50} />);

    expect(screen.getByRole('img', { name: 'PDF thumbnail' })).toBeInTheDocument();
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it('keeps a recently reused thumbnail when the LRU cache reaches its limit', async () => {
    const view = render(
      <PdfThumbnail fileUrl="/api/documents/doc-0" cacheKey="doc-0:v1" width={40} height={50} />
    );
    await screen.findByRole('img', { name: 'PDF thumbnail' });

    for (let index = 1; index < 80; index += 1) {
      view.rerender(
        <PdfThumbnail
          fileUrl={`/api/documents/doc-${index}`}
          cacheKey={`doc-${index}:v1`}
          width={40}
          height={50}
        />
      );
      await screen.findByRole('img', { name: 'PDF thumbnail' });
    }
    expect(getDocument).toHaveBeenCalledTimes(80);

    view.rerender(
      <PdfThumbnail fileUrl="/api/documents/doc-0" cacheKey="doc-0:v1" width={40} height={50} />
    );
    expect(screen.getByRole('img', { name: 'PDF thumbnail' })).toBeInTheDocument();

    view.rerender(
      <PdfThumbnail fileUrl="/api/documents/doc-80" cacheKey="doc-80:v1" width={40} height={50} />
    );
    await screen.findByRole('img', { name: 'PDF thumbnail' });
    expect(getDocument).toHaveBeenCalledTimes(81);

    view.rerender(
      <PdfThumbnail fileUrl="/api/documents/doc-0" cacheKey="doc-0:v1" width={40} height={50} />
    );
    expect(screen.getByRole('img', { name: 'PDF thumbnail' })).toBeInTheDocument();
    expect(getDocument).toHaveBeenCalledTimes(81);
  });

  it('deduplicates simultaneous renders of the same document and size', async () => {
    render(
      <>
        <PdfThumbnail fileUrl="/api/documents/doc-2" cacheKey="doc-2:v1" width={40} height={50} />
        <PdfThumbnail fileUrl="/api/documents/doc-2" cacheKey="doc-2:v1" width={40} height={50} />
      </>
    );

    await waitFor(() => expect(screen.getAllByRole('img', { name: 'PDF thumbnail' })).toHaveLength(2));
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it('renders a new thumbnail when the document revision changes', async () => {
    let resolveUpdatedRender!: () => void;
    const updatedRender = new Promise<void>((resolve) => {
      resolveUpdatedRender = resolve;
    });
    renderPage
      .mockImplementationOnce(() => ({ promise: Promise.resolve() }))
      .mockImplementationOnce(() => ({ promise: updatedRender }));
    vi.mocked(HTMLCanvasElement.prototype.toDataURL)
      .mockReturnValueOnce('data:image/webp;base64,cmV2aXNpb24tb25l')
      .mockReturnValueOnce('data:image/webp;base64,cmV2aXNpb24tdHdv');

    const view = render(
      <PdfThumbnail fileUrl="/api/documents/doc-3" cacheKey="doc-3:v1" width={40} height={50} />
    );
    const initialThumbnail = await screen.findByRole('img', { name: 'PDF thumbnail' });
    expect(initialThumbnail).toHaveAttribute('src', 'data:image/webp;base64,cmV2aXNpb24tb25l');

    view.rerender(
      <PdfThumbnail fileUrl="/api/documents/doc-3" cacheKey="doc-3:v2" width={40} height={50} />
    );
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('img', { name: 'PDF thumbnail' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading document thumbnail' })).toBeInTheDocument();

    await act(async () => {
      resolveUpdatedRender();
      await updatedRender;
    });

    const updatedThumbnail = await screen.findByRole('img', { name: 'PDF thumbnail' });
    expect(updatedThumbnail).toHaveAttribute('src', 'data:image/webp;base64,cmV2aXNpb24tdHdv');
    expect(destroyPdf).toHaveBeenCalledTimes(2);
  });

  it('renders close to the requested pixel size instead of a fixed two-times PDF scale', async () => {
    render(<PdfThumbnail fileUrl="/api/documents/doc-4" width={40} height={50} />);
    await screen.findByRole('img', { name: 'PDF thumbnail' });

    const renderScale = getViewport.mock.calls.at(-1)?.[0]?.scale ?? 0;
    expect(renderScale).toBeGreaterThanOrEqual(0.1);
    expect(renderScale).toBeLessThan(0.25);
  });

  it('defers PDF work until an off-screen thumbnail approaches the viewport', async () => {
    let observerCallback: IntersectionObserverCallback | null = null;
    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
      readonly root = null;
      readonly rootMargin = '300px';
      readonly thresholds = [0];
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    render(<PdfThumbnail fileUrl="/api/documents/doc-offscreen" width={40} height={50} />);
    expect(getDocument).not.toHaveBeenCalled();

    await act(async () => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    await screen.findByRole('img', { name: 'PDF thumbnail' });
    expect(getDocument).toHaveBeenCalledTimes(1);
  });
});
