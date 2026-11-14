'use client';
import React, { Fragment, RefObject, useMemo, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { Plus, Ellipsis, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@ui';

interface PageThumbnailsProps {
  selectedFile: string | File | null;
  pages: number[];
  currentPage: number;
  thumbRefs: RefObject<(HTMLDivElement | null)[]>;
  handleThumbnailClick: (pageNum: number) => void;
  toggleAddPageMenu: (event: React.MouseEvent, pageNum?: number) => void;
  toggleMenu: (event: React.MouseEvent, pageIndex?: number) => void;
  showAddPageMenu: boolean;
  insertAfterPageNumber: number | null;
  isSigningMode: boolean;
  canEditPages?: boolean;
}

interface AddPageButtonProps {
  onClick: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  forceVisible?: boolean;
}

const AddPageButton: React.FC<AddPageButtonProps> = ({ onClick, forceVisible = false }) => {
  const hrClass = forceVisible
    ? 'block border-brand-500! '
    : 'hidden group-hover:block group-hover:border-brand-500';
  const buttonClass = forceVisible
    ? 'flex bg-brand-500! text-white! border-0!'
    : 'hidden group-hover:flex hover:bg-brand-500 hover:text-white';

  return (
    <div className="group relative flex h-8 cursor-pointer items-center justify-center">
      <hr className={`w-full border-gray-300 transition-colors ${hrClass}`} />
      <Button size="sm"
        icon={<Plus size={14} strokeWidth={3} />}
        inverted
        className={`absolute p-0! h-5! w-5! rounded-full! hover:border-0 ${buttonClass}`}
        onClick={onClick}
      />
    </div>
  );
};

const PageThumbnails: React.FC<PageThumbnailsProps> = ({
  selectedFile,
  pages,
  currentPage,
  thumbRefs,
  handleThumbnailClick,
  toggleAddPageMenu,
  toggleMenu,
  showAddPageMenu,
  insertAfterPageNumber,
  isSigningMode,
  canEditPages = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loadedPageCount, setLoadedPageCount] = useState(0);
  const isEditing = !isSigningMode && canEditPages;

  const asideClass = useMemo(() => {
    if (isSigningMode) {
      const sizeClass = isCollapsed ? 'w-12 h-10 max-h-10' : 'w-40 max-h-9/12';
      return `${sizeClass} fixed right-3 top-24 z-40 bg-white/95 border border-gray-200 rounded-lg shadow-lg flex flex-col overflow-hidden`;
    }
    return isCollapsed ? 'absolute w-12 right-2' : 'w-40 bg-white relative overflow-auto';
  }, [isSigningMode, isCollapsed]);

  const headerClass = `p-2 ${isCollapsed ? '' : 'bg-gray-50 flex items-center gap-2 border-b border-gray-300 text-xs font-semibold sticky top-0'} ${isSigningMode ? 'z-10' : 'z-50'}`;

  return (
    <aside className={asideClass}>
      <div className={headerClass}>
        <Button size="sm"
          icon={isCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
          inverted
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="p-0! h-7! w-7! text-brand-700 shadow-none"
        />
        {!isCollapsed ? 'Thumbnails' : ''}
      </div>
      <div className={isSigningMode ? `flex-1 overflow-y-auto ${isCollapsed ? 'hidden' : ''}` : ''}>
        {selectedFile ? (
          <Document
            file={selectedFile}
            className={`p-4 pt-0 ${isCollapsed ? 'hidden' : ''}`}
            onLoadSuccess={(pdf) => setLoadedPageCount(pdf.numPages)}
          >
            {isEditing && pages.length > 0 && (
              <AddPageButton
                onClick={(event) => event && toggleAddPageMenu(event, 0)}
                forceVisible={showAddPageMenu && insertAfterPageNumber === 0}
              />
            )}
            {pages.map((pageNum) => {
              if (pageNum > loadedPageCount) return null;
              return (
                <Fragment key={pageNum}>
                  <div
                    className={`relative group ${isSigningMode && 'mb-4'}`}
                    ref={(el) => {
                      if (thumbRefs.current) {
                        thumbRefs.current[pageNum - 1] = el;
                      }
                    }}
                  >
                    <Page
                      pageNumber={pageNum}
                      width={100}
                      loading={"Page Loading..."}
                      className={`flex justify-center p-2 border border-gray-300 cursor-pointer page-badge ${currentPage === pageNum ? 'active-page' : ''
                        }`}
                      onClick={() => handleThumbnailClick(pageNum)}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                    />
                    {isEditing &&
                      <div className="absolute right-2 top-2">
                        <div
                          className="relative"

                        >
                          <Button
                            className={`p-0! rounded  ${currentPage === pageNum ? 'block' : 'hidden'
                              } group-hover:block bg-gray-500 hover:bg-brand-500  hover:text-white`}
                            icon={<Ellipsis size={20} />}
                            size="xs"
                            onClick={(e) => toggleMenu(e, pageNum - 1)}
                            variant="brand"
                          />
                        </div>
                      </div>
                    }
                  </div>

                  {isEditing && (
                    <AddPageButton
                      onClick={(event) => event && toggleAddPageMenu(event, pageNum)}
                      forceVisible={showAddPageMenu && insertAfterPageNumber === pageNum}
                    />
                  )}
                </Fragment>
              );
            })}
          </Document>
        ) : null}
      </div>
    </aside>
  );
};

export default PageThumbnails;
