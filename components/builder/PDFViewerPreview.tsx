'use client';

import React, { Fragment, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { LoaderPinwheel } from 'lucide-react';
import { initializePdfWorker } from '@/utils/pdfjsSetup';

// Initialize PDF worker once when component is imported
initializePdfWorker(pdfjs);

export interface PDFViewerPreviewProps {
  file: string | File;
  onLoadSuccess?: (data: { numPages: number }) => void;
  loading?: React.ReactNode;
  error?: React.ReactNode;
  pages?: number[];
  renderPages?: boolean;
  customHeaders?: Record<string, string>;
  scale?: number;
  renderPageOverlay?: (pageNumber: number) => React.ReactNode;
}

const flexBoxCenter = 'absolute inset-0 flex items-center w-56 justify-center text-center p-4 left-1/2 transform -translate-x-1/2';
const DEFAULT_HEADERS: Record<string, string> = {};

const PDFViewerPreview: React.FC<PDFViewerPreviewProps> = ({
  file,
  onLoadSuccess,
  loading,
  error,
  pages = [],
  renderPages = true,
  customHeaders = DEFAULT_HEADERS,
  scale = 1,
  renderPageOverlay,
}) => {
  const pdfOptions = useMemo(
    () => ({
      cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
      httpHeaders: customHeaders,
    }),
    [customHeaders]
  );

  const defaultLoading = (
    <div className={flexBoxCenter}>
      <LoaderPinwheel className="animate-spin mr-2 text-brand-600" size="30" />
      Loading PDF...
    </div>
  );

  const defaultError = (
    <div className={`${flexBoxCenter} text-red-500`}>
      {error || 'Failed to load PDF'}
    </div>
  );

  return (
    <Document
      file={file}
      onLoadSuccess={onLoadSuccess}
      options={pdfOptions}
      loading={loading || defaultLoading}
      error={defaultError}
    >
      {renderPages &&
        pages.length > 0 &&
        pages.map((pageNum) => (
          <Fragment key={pageNum}>
            <div className="relative mx-auto mb-4 w-fit pdf-page">
              <Page
                pageNumber={pageNum}
                width={890}
                scale={scale}
                renderAnnotationLayer={false}
                renderTextLayer
              />
              {renderPageOverlay?.(pageNum)}
            </div>
          </Fragment>
        ))}
    </Document>
  );
};

export default PDFViewerPreview;
