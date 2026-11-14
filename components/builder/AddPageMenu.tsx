'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FilePlus2, FolderOpen, LayoutTemplate, Upload } from 'lucide-react';

interface Props {
  onClose: () => void;
  triggerElement?: HTMLElement | null;
  insertAfterPageNumber: number;
  onInsertBlankPage: (pageNumber: number) => Promise<boolean | void> | boolean | void;
  onAppendPdfRequested?: (
    insertAfterPageNumber: number,
    source: 'upload' | 'existing' | 'template',
    file?: File
  ) => void;
}

const AddPageMenu: React.FC<Props> = ({
  onClose,
  triggerElement,
  insertAfterPageNumber,
  onInsertBlankPage,
  onAppendPdfRequested,
}) => {
  const MENU_WIDTH = 288;
  const VIEWPORT_PADDING = 8;
  const ref = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const menuStyle = useMemo<React.CSSProperties>(() => {
    if (!triggerElement || typeof window === 'undefined') return {};
    const rect = triggerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    let left = rect.right - MENU_WIDTH;
    left = Math.min(left, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING);
    left = Math.max(VIEWPORT_PADDING, left);
    return {
      position: 'fixed',
      top: `${rect.bottom}px`,
      left: `${left}px`,
    };
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

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', onClose, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const listItemCss = 'flex w-full cursor-pointer items-center gap-2 p-2 text-left hover:bg-gray-100';

  const handleBlankPage = async () => {
    await onInsertBlankPage(insertAfterPageNumber);
    onClose();
  };

  const handleAppendSourceSelection = (
    source: 'existing' | 'template'
  ) => {
    onAppendPdfRequested?.(insertAfterPageNumber, source);
    onClose();
  };

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    onAppendPdfRequested?.(insertAfterPageNumber, 'upload', file);
    onClose();
  };

  const menu = (
    <div
      ref={ref}
      className="z-50 w-72 rounded border border-gray-300 bg-white shadow-md"
      style={menuStyle}
    >
      <ul className="p-1 text-sm">
        <li>
          <button
            type="button"
            className={listItemCss}
            onClick={() => {
              void handleBlankPage();
            }}
          >
            <FilePlus2 size={16} /> Blank Page
          </button>
        </li>
        <li className="border-t border-gray-300">
          <button
            type="button"
            className={listItemCss}
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload size={16} /> Upload New Document
          </button>
        </li>
        <li>
          <button
            type="button"
            className={listItemCss}
            onClick={() => handleAppendSourceSelection('existing')}
          >
            <FolderOpen size={16} /> Select from Existing Documents
          </button>
        </li>
        <li>
          <button
            type="button"
            className={listItemCss}
            onClick={() => handleAppendSourceSelection('template')}
          >
            <LayoutTemplate size={16} /> Select from Templates
          </button>
        </li>
      </ul>
      <input
        ref={uploadInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="Upload document to append"
        onChange={handleUploadChange}
      />
    </div>
  );

  return createPortal(menu, document.body);
};

export default AddPageMenu;
