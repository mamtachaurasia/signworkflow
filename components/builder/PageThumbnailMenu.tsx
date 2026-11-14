import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, ArrowUp, ArrowDown, Copy, Trash2, FileSymlink, Replace, ChevronRight, FolderOpen, Upload, LayoutTemplate } from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import { type MovePageOperation, type PageSize, type PageStructureOperation } from '@/utils/builder/pageOperations';
import { Button } from '@ui';
import { Input } from '@ui';

interface Props {
  onClose: () => void;
  triggerElement?: HTMLElement | null;
  pdfDoc: PDFDocument;
  pageIndex: number;
  onPdfUpdated: (updatedDoc: PDFDocument) => void;
  onPageMoved?: (operation: MovePageOperation) => void;
  onPageDeleted?: (operation: PageStructureOperation) => void;
  onPageDuplicated?: (operation: PageStructureOperation) => void;
  onReplacePageRequested?: (pageIndex: number, source: 'upload' | 'existing' | 'template', file?: File) => void;
}

const PageThumbnailMenu: React.FC<Props> = ({
  onClose,
  triggerElement,
  pdfDoc,
  pageIndex,
  onPdfUpdated,
  onPageMoved,
  onPageDeleted,
  onPageDuplicated,
  onReplacePageRequested,
}) => {
  const MENU_WIDTH = 288;
  const SUBMENU_WIDTH = 288;
  const VIEWPORT_PADDING = 8;
  const ref = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [moveTarget, setMoveTarget] = useState(() => String(pageIndex + 1));
  const [moveError, setMoveError] = useState<string | null>(null);
  const [showReplaceMenu, setShowReplaceMenu] = useState(false);
  const totalPages = pdfDoc.getPageCount();
  const menuStyle = useMemo<React.CSSProperties>(() => {
    if (!triggerElement || typeof window === 'undefined') return {};
    const rect = triggerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    let left = rect.right - MENU_WIDTH;
    left = Math.min(left, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING);
    left = Math.max(VIEWPORT_PADDING, left);
    return {
      position: "fixed",
      top: `${rect.bottom}px`,
      left: `${left}px`,
    };
  }, [triggerElement]);
  const submenuSide = useMemo<'left' | 'right'>(() => {
    if (!triggerElement || typeof window === 'undefined') return 'left';
    const rect = triggerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    let left = rect.right - MENU_WIDTH;
    left = Math.min(left, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING);
    left = Math.max(VIEWPORT_PADDING, left);
    const spaceLeft = left - VIEWPORT_PADDING;
    const spaceRight = viewportWidth - (left + MENU_WIDTH) - VIEWPORT_PADDING;
    if (spaceLeft < SUBMENU_WIDTH && spaceRight >= SUBMENU_WIDTH) return 'right';
    if (spaceLeft >= SUBMENU_WIDTH) return 'left';
    return spaceRight > spaceLeft ? 'right' : 'left';
  }, [triggerElement]);

  useLayoutEffect(() => {
    if (!triggerElement || !ref.current || typeof window === 'undefined') return;
    const rect = triggerElement.getBoundingClientRect();
    const menuEl = ref.current;
    const menuRect = menuEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right - menuRect.width;
    left = Math.min(left, viewportWidth - menuRect.width - VIEWPORT_PADDING);
    left = Math.max(VIEWPORT_PADDING, left);

    let top = rect.bottom;
    if (top + menuRect.height + VIEWPORT_PADDING > viewportHeight) {
      top = rect.top - menuRect.height;
    }
    top = Math.max(VIEWPORT_PADDING, Math.min(top, viewportHeight - menuRect.height - VIEWPORT_PADDING));

    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
  }, [triggerElement]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", onClose, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const getPageSizes = (): PageSize[] =>
    Array.from({ length: pdfDoc.getPageCount() }, (_, index) => pdfDoc.getPage(index).getSize());

  const getPageOperation = (): PageStructureOperation => ({
    pageIndex,
    pageSize: pdfDoc.getPage(pageIndex).getSize(),
  });

  const rotatePage = async () => {
    const page = pdfDoc.getPage(pageIndex);
    const rotation = page.getRotation().angle;
    page.setRotation(degrees((rotation + 90) % 360));
    await onPdfUpdated(pdfDoc);
    onClose();
  };

  const duplicatePage = async () => {
    const operation = getPageOperation();
    const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [pageIndex]);
    pdfDoc.insertPage(pageIndex + 1, copiedPage);
    onPageDuplicated?.(operation);
    await onPdfUpdated(pdfDoc);
    onClose();
  };

  const removePage = async () => {
    const operation = getPageOperation();
    pdfDoc.removePage(pageIndex);
    onPageDeleted?.(operation);
    await onPdfUpdated(pdfDoc);
    onClose();
  };

  const movePageToIndex = async (toIndex: number) => {
    if (toIndex < 0 || toIndex >= totalPages || toIndex === pageIndex) {
      return;
    }

    const operation: MovePageOperation = {
      fromIndex: pageIndex,
      toIndex,
      pageSizes: getPageSizes(),
    };
    const [page] = await pdfDoc.copyPages(pdfDoc, [pageIndex]);
    pdfDoc.removePage(pageIndex);
    pdfDoc.insertPage(toIndex, page);
    onPageMoved?.(operation);
    await onPdfUpdated(pdfDoc);
    onClose();
  };

  const movePageUp = async () => {
    if (pageIndex <= 0) return;
    await movePageToIndex(pageIndex - 1);
  };

  const movePageDown = async () => {
    if (pageIndex >= totalPages - 1) return;
    await movePageToIndex(pageIndex + 1);
  };

  const handleMovePageSubmit = async () => {
    const targetPage = Number.parseInt(moveTarget, 10);
    if (Number.isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
      setMoveError(`Page must be between 1 and ${totalPages}.`);
      return;
    }

    const targetIndex = targetPage - 1;
    if (targetIndex === pageIndex) {
      setMoveError(`Page ${targetPage} is already in that position.`);
      return;
    }

    setMoveError(null);
    await movePageToIndex(targetIndex);
  };

  const handleReplacePageSelection = (source: 'existing' | 'template') => {
    onReplacePageRequested?.(pageIndex, source);
    onClose();
  };

  const handleReplaceUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    onReplacePageRequested?.(pageIndex, 'upload', file);
    onClose();
  };

  const menuItemButtonCss = "flex w-full items-center gap-2 p-2 text-left hover:bg-gray-100";
  const destructiveMenuItemButtonCss = `${menuItemButtonCss} text-red-600`;
  const disabledMenuItemButtonCss = "flex w-full items-center gap-2 p-2 text-gray-400 cursor-not-allowed";

  const menu = (
    <div
      ref={ref}
      className="z-50 w-62 rounded border border-gray-300 bg-white shadow-md"
      style={menuStyle}
    >
      <ul className="p-1 text-sm divide-y-1 divide-gray-300">
        <li>
          <button type="button" className={menuItemButtonCss} onClick={() => void rotatePage()}>
            <RotateCcw size={16} /> Rotate Page
          </button>
        </li>
        <li>
          <button type="button" className={menuItemButtonCss} onClick={() => void movePageUp()}>
            <ArrowUp size={16} /> Move Page Up
          </button>
        </li>
        <li>
          <button type="button" className={menuItemButtonCss} onClick={() => void movePageDown()}>
            <ArrowDown size={16} /> Move Page Down
          </button>
        </li>
        <li className="relative">
          <div className={menuItemButtonCss}>
            <FileSymlink size={16} /> Move Page To...
            <div className="flex" onClick={(event) => event.stopPropagation()}>
              <Input
                id="move-page-target"
                aria-label="Move page to"
                type="number"
                min={1}
                max={totalPages}
                value={moveTarget}
                onChange={(event) => {
                  setMoveTarget(event.target.value);
                  if (moveError) {
                    setMoveError(null);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleMovePageSubmit();
                  }
                }}
                className="w-12! p-1! h-8 text-xs border-r-0 rounded-r-none rounded-l-sm border-brand-500"
              />          
            <Button size="sm"
              type="button"
              label="Go"
              className="px-2! py-1! text-xs rounded-l-none rounded-r-sm h-8"
              onClick={() => {
                void handleMovePageSubmit();
                }}
              />
            </div>
          </div>
          {moveError && (
            <div
              role="alert"
              className="absolute z-50 right-0 -bottom-7 min-w-56 rounded-md bg-red-500 p-2 text-center text-xs text-white shadow-lg"
            >
              <div className="absolute -top-1 right-16 h-2 w-2 rotate-45 bg-red-500" />
              {moveError}
            </div>
          )}
        </li>
        <li
          className="relative"
          onMouseEnter={() => {
            if (onReplacePageRequested) {
              setShowReplaceMenu(true);
            }
          }}
          onMouseLeave={() => setShowReplaceMenu(false)}
        >
          <button
            type="button"
            disabled={!onReplacePageRequested}
            aria-haspopup={onReplacePageRequested ? 'menu' : undefined}
            aria-expanded={onReplacePageRequested ? showReplaceMenu : undefined}
            className={`${onReplacePageRequested ? `${menuItemButtonCss} justify-between` : `${disabledMenuItemButtonCss} justify-between`}`}
            title={onReplacePageRequested ? 'Replace Page' : 'Replace Page is not available yet.'}
            onClick={() => {
              if (onReplacePageRequested) {
                setShowReplaceMenu(true);
              }
            }}
          >
            <span className="flex items-center gap-2">
              <Replace size={16} /> Replace Page
            </span>
            <ChevronRight size={16} />
          </button>
          {showReplaceMenu && onReplacePageRequested && (
            <div
              className={`absolute top-0 w-72 rounded border border-gray-300 bg-white shadow-md ${
                submenuSide === 'right' ? 'left-full ml-1' : 'right-full mr-1'
              }`}
            >
              <button
                type="button"
                className={menuItemButtonCss}
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload size={16} /> Upload New Document
              </button>
              <button
                type="button"
                className={`${menuItemButtonCss} border-t border-gray-300`}
                onClick={() => handleReplacePageSelection('existing')}
              >
                <FolderOpen size={16} /> Select from Existing Documents
              </button>
              <button
                type="button"
                className={`${menuItemButtonCss} border-t border-gray-300`}
                onClick={() => handleReplacePageSelection('template')}
              >
                <LayoutTemplate size={16} /> Select from Templates
              </button>
            </div>
          )}
        </li>
        <li>
          <button type="button" className={menuItemButtonCss} onClick={() => void duplicatePage()}>
            <Copy size={16} /> Duplicate Page
          </button>
        </li>
        <li>
          <button type="button" className={destructiveMenuItemButtonCss} onClick={() => void removePage()}>
            <Trash2 size={16} /> Remove Page
          </button>
        </li>
      </ul>
      <input
        ref={uploadInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="Upload replacement document"
        onChange={handleReplaceUploadChange}
      />
    </div>
  );

  return createPortal(menu, document.body);
};

export default PageThumbnailMenu;
