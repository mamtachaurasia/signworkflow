'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import { DraggableData } from 'react-rnd';

import UploadZone from '@/components/UploadZone';
import EditorSidebar from './EditorSidebar';
import Footer from './Footer';
import EditorDialogs from './EditorDialogs';
import FieldPropertyPanel from './FieldPropertyPanel';
import { Doc, DocumentField, DroppedComponent, FieldOwner, Recipient } from '@/types/types';
import { resolvePdfSource } from '@/utils/builder/pdfSource';
import { useBuilderStore } from '@/hooks/useBuilderStore';
import { shouldKeepFieldPropertyPanelOpen } from '@/utils/builder/fieldPanelOutsideClick';
import { getRepeatCoveredPageNumbers } from '@/utils/builder/repeatFields';
import type { PageBounds } from '@/utils/builder/fieldLayout';
import type { RichTextEditorHandle } from '@/components/editor/RichTextEditor';

const PageThumbnails = dynamic(() => import('./PageThumbnails'), { ssr: false });
const EditorCanvas = dynamic(() => import('./EditorCanvas'), { ssr: false });

interface EditorWorkspaceProps {
  isSigningMode: boolean;
  isReadOnly: boolean;
  isPreviewMode: boolean;
  canEditPages?: boolean;
  templateWorkspace?: boolean;
  isTemplateEditor: boolean;
  isSigned?: boolean;
  selectedFile: File | string | Doc | null;
  signingToken?: string;
  currentRecipientId?: string;
  onSendComplete: (payload: { recipients: Recipient[]; signingMode: 'sequential' | 'parallel' }) => void;
  serializeFields: () => DocumentField[];
  mouseDownOnField: (component: string, event: React.MouseEvent<HTMLDivElement>, fieldOwner: FieldOwner) => void;
  handleAddRecipients: () => void;

  imageRef: React.RefObject<HTMLInputElement | null>;
  onImgUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  containerHeight: number;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  currentPage: number;
  pages: number[];

  documentRef: React.RefObject<HTMLDivElement | null>;
  pageRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  thumbRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  textFieldRefs: React.MutableRefObject<Record<number, RichTextEditorHandle | null>>;

  mouseMoveOnDropArea: (e: React.MouseEvent<HTMLDivElement>) => void;
  mouseLeaveOnDropArea: (e: React.MouseEvent<HTMLDivElement>) => void;
  clickOnDropArea: (e: React.MouseEvent<HTMLDivElement>) => void;

  onSelectField: (field: DroppedComponent) => void;
  onAssignRecipient: (fieldId: number, recipientId: string | null) => void;
  onDuplicateField: (field: DroppedComponent) => void;
  onDeleteField: (field: DroppedComponent) => void;
  onRepeatFieldOnPages: (field: DroppedComponent, pageNumbers: number[]) => void;
  updateField: (data: string | null, id: number) => void;
  handleDragStop: (e: MouseEvent | TouchEvent, item: DroppedComponent, data: DraggableData) => void;
  handleResizeStop: (
    e: MouseEvent | TouchEvent,
    item: DroppedComponent,
    ref: { style: { width: string; height: string } },
    pos: { x: number; y: number },
    delta?: { width: number; height: number }
  ) => void;
  onClickField: (event: React.MouseEvent<Element>, item: DroppedComponent) => void;
  guidedFieldId?: string | null;
  guidedBadgeLabel?: 'Sign here' | 'Review';
  defaultDateFormat?: string;
  defaultWeekStart?: 'sunday' | 'monday';

  handleThumbnailClick: (pageNum: number) => void;
  toggleAddPageMenu: (event: React.MouseEvent, pageNumber?: number) => void;
  toggleMenu: (event: React.MouseEvent, pageIndex?: number) => void;
  generateThumbnails: (numPages: number) => void;
  showAddPageMenu: boolean;
  insertAfterPageNumber: number | null;
  onUpdateField: (fieldId: number, patch: Partial<DroppedComponent>) => void;
  resolvePageBounds: (pageNumber: number) => PageBounds | null;
}

const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  isSigningMode,
  isReadOnly,
  isPreviewMode,
  serializeFields,
  canEditPages = true,
  templateWorkspace = false,
  isTemplateEditor,
  isSigned,
  selectedFile,
  signingToken,
  currentRecipientId,
  onSendComplete,
  mouseDownOnField,
  handleAddRecipients,
  imageRef,
  onImgUpload,
  containerHeight,
  zoom,
  setZoom,
  currentPage,
  pages,
  documentRef,
  pageRefs,
  thumbRefs,
  textFieldRefs,
  mouseMoveOnDropArea,
  mouseLeaveOnDropArea,
  clickOnDropArea,
  onSelectField,
  onAssignRecipient,
  onDuplicateField,
  onDeleteField,
  onRepeatFieldOnPages,
  updateField,
  handleDragStop,
  handleResizeStop,
  onClickField,
  guidedFieldId,
  guidedBadgeLabel,
  defaultDateFormat,
  defaultWeekStart,
  handleThumbnailClick,
  toggleAddPageMenu,
  toggleMenu,
  generateThumbnails,
  showAddPageMenu,
  insertAfterPageNumber,
  onUpdateField,
  resolvePageBounds,
}) => {
  const {
    draggingComponent,
    droppedComponents,
    recipients,
    selectedField,
    setSelectedFieldId,
    position,
  } = useBuilderStore();
  const showDragPreview = (() => {
    if (!draggingComponent) return false;
    const candidateId = (draggingComponent as unknown as { id?: unknown }).id;
    return typeof candidateId !== 'number';
  })();
  const showPropertyPanel = !isSigningMode && !isReadOnly && Boolean(selectedField);
  const thumbnailFile = React.useMemo(() => resolvePdfSource(selectedFile), [selectedFile]);
  const repeatCoveredPageNumbers = React.useMemo(() => {
    if (!selectedField) {
      return [];
    }

    return getRepeatCoveredPageNumbers({
      field: selectedField,
      currentComponents: droppedComponents,
      pageCount: pages.length,
      resolvePageBounds,
    });
  }, [droppedComponents, pages.length, resolvePageBounds, selectedField]);

  React.useEffect(() => {
    if (!showPropertyPanel) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (shouldKeepFieldPropertyPanelOpen(event.target)) return;
      setSelectedFieldId(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [setSelectedFieldId, showPropertyPanel]);

  return (
    <div className={`relative flex flex-1 min-h-0 overflow-hidden bg-gray-300 ${templateWorkspace ? 'min-h-128 lg:h-[calc(100vh-115px)]' : 'h-[calc(100vh-56px)]'}`}>
      {!isSigningMode && (
        <>
          <EditorSidebar
            isReadOnly={isReadOnly}
            mouseDownOnField={mouseDownOnField}
            selectedFile={selectedFile as File}
            onAddRecipients={handleAddRecipients}
          />
          {!selectedFile && (<UploadZone />)}
          {showDragPreview && (
            <div
              className="bg-brand-50 border border-brand-300 px-2 text-center text-[12px] fixed min-w-25 z-999999 left-1.75 top-9.5"
              style={{
                transform: `translate(${position.x + 50}px, ${position.y + 2}px)`,
              }}
            >
              {draggingComponent?.component}
            </div>
          )}
        </>
      )}

      <EditorCanvas
        imageRef={imageRef}
        onImgUpload={onImgUpload}
        containerHeight={containerHeight}
        zoom={zoom}
        documentRef={documentRef}
        mouseMoveOnDropArea={mouseMoveOnDropArea}
        mouseLeaveOnDropArea={mouseLeaveOnDropArea}
        clickOnDropArea={clickOnDropArea}
        onSelectField={onSelectField}
        onAssignRecipient={onAssignRecipient}
        onDuplicateField={onDuplicateField}
        onDeleteField={onDeleteField}
        updateField={updateField}
        handleDragStop={handleDragStop}
        handleResizeStop={handleResizeStop}
        textFieldRefs={textFieldRefs}
        onAddRecipients={handleAddRecipients}
        isSigningMode={isSigningMode}
        isReadOnly={isReadOnly}
        isSigned={isSigned}
        onClickField={onClickField}
        currentRecipientId={currentRecipientId}
        guidedFieldId={guidedFieldId}
        guidedBadgeLabel={guidedBadgeLabel}
        defaultDateFormat={defaultDateFormat}
        defaultWeekStart={defaultWeekStart}
        selectedFile={selectedFile}
        pages={pages}
        pageRefs={pageRefs}
        generateThumbnails={generateThumbnails}
        toggleAddPageMenu={toggleAddPageMenu}
        toggleMenu={toggleMenu}
        signingToken={signingToken}
      />

      <PageThumbnails
        selectedFile={thumbnailFile}
        pages={pages}
        currentPage={currentPage}
        thumbRefs={thumbRefs}
        handleThumbnailClick={handleThumbnailClick}
        toggleAddPageMenu={toggleAddPageMenu}
        toggleMenu={toggleMenu}
        showAddPageMenu={showAddPageMenu}
        insertAfterPageNumber={insertAfterPageNumber}
        isSigningMode={isPreviewMode}
        canEditPages={canEditPages}
      />

      {!isSigningMode && !isReadOnly && (
        <div
          className={`absolute right-0 top-0 z-50 h-full w-70 transform transition-transform duration-300 ease-out ${
            showPropertyPanel ? 'translate-x-0' : 'translate-x-full pointer-events-none'
          }`}
        >
          <FieldPropertyPanel
            key={selectedField?.id ?? 'panel'}
            field={selectedField}
            recipients={recipients}
            isReadOnly={isReadOnly}
            defaultDateFormat={defaultDateFormat}
            defaultWeekStart={defaultWeekStart}
            onClose={() => setSelectedFieldId(null)}
            onUpdateField={onUpdateField}
            onAssignRecipient={onAssignRecipient}
            onDuplicateField={onDuplicateField}
            onDeleteField={onDeleteField}
            onRepeatFieldOnPages={onRepeatFieldOnPages}
            pageCount={pages.length}
            repeatCoveredPageNumbers={repeatCoveredPageNumbers}
          />
        </div>
      )}

  <EditorDialogs
        isSigningMode={isSigningMode}
        isReadOnly={isReadOnly}
        isTemplateEditor={isTemplateEditor}
        serializeFields={serializeFields}
        onSendComplete={onSendComplete}
        updateField={updateField}
      />

      {!isSigningMode && !isReadOnly && (
        <Footer
          currentPage={currentPage}
          totalPages={pages.length}
          zoom={zoom}
          setZoom={setZoom}
          onPageChange={handleThumbnailClick}
        />
      )}
    </div>
  );
};

export default EditorWorkspace;
