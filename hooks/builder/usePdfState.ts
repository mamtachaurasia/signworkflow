"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { PDFDocument } from 'pdf-lib';
import { blobToURL, loadPdf } from '@/lib/pdf';
import { Doc } from '@/types/types';
import { DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT } from '@/utils/builder/constants';
import { type InsertPagesOperation, type ReplacePageOperation } from '@/utils/builder/pageOperations';
import { resolvePdfSource } from '@/utils/builder/pdfSource';

interface UsePdfStateArgs {
  selectedFile: File | string | Doc | null;
  setSelectedFile: (value: File | string | Doc | null) => void;
  onPageChange?: (page: number) => void;
  onNumPagesChange?: (numPages: number) => void;
  guestId?: string | null; // ← add this
}

export const usePdfState = ({
  selectedFile,
  setSelectedFile,
  onPageChange,
  onNumPagesChange,
  guestId, // ← add this
}: UsePdfStateArgs) => {
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
  const [menuTriggerElement, setMenuTriggerElement] = useState<HTMLElement | null>(null);
  const [showAddPageMenu, setShowAddPageMenu] = useState(false);
  const [insertAfterPageNumber, setInsertAfterPageNumber] = useState<number | null>(null);
  const [addPageMenuTriggerElement, setAddPageMenuTriggerElement] = useState<HTMLElement | null>(null);

  const documentRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);

  const pdfSource = useMemo(
    () => resolvePdfSource(selectedFile, guestId),
    [guestId, selectedFile]
  );

  useEffect(() => {
    const loadPdfForEditing = async () => {
      if (pdfSource) {
        try {
          const loaded = await loadPdf(pdfSource);
          setPdfDoc(loaded);
        } catch (err) {
          console.error("Error loading PDF for menu operations:", err);
        }
      } else {
        setPdfDoc(null);
      }
    };
    loadPdfForEditing();
  }, [pdfSource]);

  const generateThumbnails = useCallback((numPages: number) => {
    setPages(Array.from({ length: numPages }, (_, i) => i + 1));
  }, []);

  const handleThumbnailClick = useCallback((pageNum: number) => {
    setCurrentPage(pageNum);
    const page = pageRefs.current[pageNum - 1];
    page?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  }, []);

  const handlePdfUpdated = useCallback(async (updatedDoc: PDFDocument) => {
    try {
      const bytes = await updatedDoc.save();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = await blobToURL(blob);
      const pageCount = updatedDoc.getPageCount();

      setSelectedFile(url);
      setPdfDoc(updatedDoc);
      setPages(Array.from({ length: pageCount }, (_, index) => index + 1));
      setCurrentPage((previousPage) => Math.min(Math.max(previousPage, 1), pageCount));
    } catch (err) {
      console.error("handlePdfUpdated failed:", err);
    }
  }, [setSelectedFile]);

  const insertBlankPageAt = useCallback(async (index: number) => {
    if (!pdfDoc) {
      return false;
    }

    pdfDoc.insertPage(index, [DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT]);
    await handlePdfUpdated(pdfDoc);
    return true;
  }, [pdfDoc, handlePdfUpdated]);

  const appendPdfAt = useCallback(async (
    insertAfterPageNumber: number,
    sourcePdfDoc: PDFDocument,
    sourcePageIndexes?: number[]
  ): Promise<InsertPagesOperation | null> => {
    if (!pdfDoc) {
      return null;
    }

    const totalPages = pdfDoc.getPageCount();
    if (insertAfterPageNumber < 0 || insertAfterPageNumber > totalPages) {
      return null;
    }

    const sourcePageCount = sourcePdfDoc.getPageCount();
    if (sourcePageCount <= 0) {
      return null;
    }

    const normalizedSourcePageIndexes = Array.isArray(sourcePageIndexes) && sourcePageIndexes.length > 0
      ? Array.from(
          new Set(
            sourcePageIndexes.filter(
              (pageIndex) =>
                Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < sourcePageCount
            )
          )
        ).sort((left, right) => left - right)
      : Array.from({ length: sourcePageCount }, (_, index) => index);

    if (normalizedSourcePageIndexes.length === 0) {
      return null;
    }

    const copiedPages = await pdfDoc.copyPages(sourcePdfDoc, normalizedSourcePageIndexes);
    const insertedPageSizes = copiedPages.map((page) => page.getSize());

    copiedPages.forEach((page, index) => {
      pdfDoc.insertPage(insertAfterPageNumber + index, page);
    });

    await handlePdfUpdated(pdfDoc);

    return {
      insertedAfterPageNumber: insertAfterPageNumber,
      insertedPageSizes,
    };
  }, [pdfDoc, handlePdfUpdated]);

  const replacePageAt = useCallback(async (
    pageIndex: number,
    sourcePdfDoc: PDFDocument,
    sourcePageIndex: number
  ): Promise<ReplacePageOperation | null> => {
    if (!pdfDoc) {
      return null;
    }

    const totalPages = pdfDoc.getPageCount();
    if (pageIndex < 0 || pageIndex >= totalPages) {
      return null;
    }

    if (sourcePageIndex < 0 || sourcePageIndex >= sourcePdfDoc.getPageCount()) {
      return null;
    }

    const previousPageSize = pdfDoc.getPage(pageIndex).getSize();
    const [replacementPage] = await pdfDoc.copyPages(sourcePdfDoc, [sourcePageIndex]);
    const nextPageSize = replacementPage.getSize();

    pdfDoc.removePage(pageIndex);
    pdfDoc.insertPage(pageIndex, replacementPage);
    await handlePdfUpdated(pdfDoc);

    return {
      pageIndex,
      previousPageSize,
      nextPageSize,
    };
  }, [pdfDoc, handlePdfUpdated]);

  const toggleMenu = useCallback((event: MouseEvent, pageIndex?: number) => {
    setMenuTriggerElement(event.currentTarget as HTMLElement);
    if (typeof pageIndex === 'number') {
      setSelectedPageIndex(pageIndex);
    }
    setShowMenu(true);
  }, []);

  const toggleAddPageMenu = useCallback((event: MouseEvent, pageNumber?: number) => {
    setAddPageMenuTriggerElement(event.currentTarget as HTMLElement);
    if (typeof pageNumber === 'number') {
      setInsertAfterPageNumber(pageNumber);
    }
    setShowAddPageMenu(true);
  }, []);

  // Auto-highlighted thumbnails when scrolling
  useEffect(() => {
    if (!pages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible) {
          const pageNum = parseInt(
            visible.target.getAttribute('data-page') || '0',
            10
          );
          if (pageNum) {
            setCurrentPage(pageNum);
          }
        }
      },
      { root: null, threshold: [0.25, 0.5, 0.75] }
    );

    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    if (typeof onPageChange === 'function') {
      onPageChange(currentPage);
    }
    if (typeof onNumPagesChange === 'function') {
      onNumPagesChange(pages.length);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    const activeThumb = thumbRefs.current[currentPage - 1];
    if (activeThumb) {
      activeThumb.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentPage]);

  return {
    pdfDoc,
    setPdfDoc,
    pages,
    currentPage,
    setCurrentPage,
    zoom,
    setZoom,
    showMenu,
    setShowMenu,
    selectedPageIndex,
    setSelectedPageIndex,
    menuTriggerElement,
    setMenuTriggerElement,
    showAddPageMenu,
    setShowAddPageMenu,
    insertAfterPageNumber,
    setInsertAfterPageNumber,
    addPageMenuTriggerElement,
    setAddPageMenuTriggerElement,
    documentRef,
    pageRefs,
    thumbRefs,
    generateThumbnails,
    handleThumbnailClick,
    handlePdfUpdated,
    insertBlankPageAt,
    appendPdfAt,
    replacePageAt,
    toggleMenu,
    toggleAddPageMenu,
  };
};
