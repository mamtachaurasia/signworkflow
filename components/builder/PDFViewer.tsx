'use client';
import { Ellipsis, LoaderPinwheel, Plus } from 'lucide-react';
import React, { Fragment, useMemo } from 'react';
import { Document, Page, pdfjs } from "react-pdf";
import { initializePdfWorker } from '@/utils/pdfjsSetup';
import { Button } from '@ui';
import { VIEWER_PAGE_WIDTH, PAGE_CONTENT_MARGIN_BOTTOM, PAGE_MARGIN } from '@/utils/builder/constants';

// Initialize PDF worker once when component is imported
initializePdfWorker(pdfjs);

interface PDFViewerProps {
  selectedFile: File | string | null;
  pages: number[];
  zoom: number;
  pageRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  generateThumbnails: (numPages: number) => void;
  toggleAddPageMenu: (event: React.MouseEvent, pageNumber?: number) => void;
  toggleMenu: (e: React.MouseEvent, pageIndex?: number) => void;
  error?: string;
  signingToken?: string;
  isSigningMode?: boolean;
  isReadOnly?: boolean;
}

const PDFViewer: React.FC<PDFViewerProps> = ({
  selectedFile,
  pages,
  zoom,
  pageRefs,
  generateThumbnails,
  toggleAddPageMenu,
  toggleMenu,
  error,
  signingToken,
  isSigningMode,
  isReadOnly,
}) => {
const flexBoxcenter='absolute inset-0 flex items-center w-56 justify-center  text-center p-4 left-1/2 transform -translate-x-1/2'

  const fileKey = useMemo(() => {
    if (typeof selectedFile === 'string') {
      return selectedFile;
    }
    if (selectedFile instanceof File) {
      return `${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}`;
    }
    return 'no-file-key';
  }, [selectedFile]);

  const customHeaders = useMemo(() => {
    if (!isSigningMode) return {};

    const recipientId = typeof window !== 'undefined' 
      ? new URLSearchParams(window.location.search).get("recipient") 
      : '';

    return {
      'X-Signing-Token': signingToken || '',
      'X-Recipient-Id': recipientId || '',
    };
  }, [isSigningMode, signingToken]);

  const pdfOptions = useMemo(() => ({
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    httpHeaders: customHeaders,
  }), [customHeaders]);

  if (!selectedFile) {
    return null;
  }

  const isEditingDisabled = Boolean(isSigningMode || isReadOnly);

  return (
    <Document 
      key={fileKey}
      file={selectedFile} 
      onLoadSuccess={(data) => generateThumbnails(data.numPages)}
      options={pdfOptions}
      loading={<div className={`${flexBoxcenter}`}>
        <LoaderPinwheel className="animate-spin left-1/2 top-1/2 mr-2 text-brand-600 " size="30"  />
        Loading PDF...</div>} 
      error={<div className={`${flexBoxcenter} text-red-500`}>
            
                  {
                  error ? 
                        <>
                           Error: {error}
                          <p className="text-sm text-gray-600 mt-2">
                            Try uploading another PDF file
                          </p>
                          </>                
                        :
                      'Failed to load PDF'
                  }
          
             </div>
        }>
      {pages.map((pageNum) => (
        <Fragment key={pageNum}>
          <div
            className='flex justify-between w-full items-center p-1 page-brake'
            style={{ height: `${PAGE_MARGIN}px` }}
          >
            <small className={`${isEditingDisabled && 'm-auto'}`}>{pageNum} of {pages.length}</small>
            {!isEditingDisabled && (
            <>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(event) => toggleAddPageMenu(event as React.MouseEvent, pageNum)}
              className="h-6 w-6 rounded-sm p-0 text-[inherit] hover:bg-slate-200"
              aria-label={`Add a page after page ${pageNum}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <div className='relative' onClick={(e) => toggleMenu(e, pageNum - 1)}>
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-6 w-6 rounded-sm p-0 text-[inherit] hover:bg-slate-200"
                aria-label={`Page ${pageNum} actions`}
              >
                <Ellipsis className="h-3.5 w-3.5" />
              </Button>
            </div>
            </>
            )}
          </div>
          <div
            data-page={pageNum}
            ref={(el: HTMLDivElement | null) => {
                pageRefs.current[pageNum - 1] = el;
                }}
            className="relative pdf-page"
            style={{ marginBottom: `${PAGE_CONTENT_MARGIN_BOTTOM}px` }}
          >
            <Page pageNumber={pageNum} width={VIEWER_PAGE_WIDTH} scale={zoom} renderAnnotationLayer={false} renderTextLayer />
          </div>
        </Fragment>
      ))}
    </Document>
  );
};

export default PDFViewer;
