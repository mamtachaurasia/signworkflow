'use client';
import React, { useEffect, useMemo, useRef } from 'react';
import { DraggableData } from 'react-rnd';
import DroppedComponents from './DroppedComponents';
import PDFViewer from './PDFViewer';
import { Doc, DroppedComponent } from '@/types/types';
import { resolvePdfSource } from '@/utils/builder/pdfSource';
import { useBuilderStore } from '@/hooks/useBuilderStore';
import type { RichTextEditorHandle } from '@/components/editor/RichTextEditor';

interface EditorCanvasProps {
  imageRef: React.RefObject<HTMLInputElement | null>;
  onImgUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  containerHeight: number;
  zoom: number;
  documentRef: React.RefObject<HTMLDivElement | null>;
  mouseMoveOnDropArea: (e: React.MouseEvent<HTMLDivElement>) => void;
  mouseLeaveOnDropArea: (e: React.MouseEvent<HTMLDivElement>) => void;
  clickOnDropArea: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSelectField: (field: DroppedComponent) => void;
  onAssignRecipient: (fieldId: number, recipientId: string | null) => void;
  onDuplicateField: (field: DroppedComponent) => void;
  onDeleteField: (field: DroppedComponent) => void;
  updateField: (data: string | null, id: number) => void;
  handleDragStop: (e: MouseEvent | TouchEvent, item: DroppedComponent, data: DraggableData) => void;
  handleResizeStop: (
    e: MouseEvent | TouchEvent,
    item: DroppedComponent,
    ref: { style: { width: string; height: string } },
    pos: { x: number; y: number },
    delta?: { width: number; height: number }
  ) => void;
  textFieldRefs: React.MutableRefObject<Record<number, RichTextEditorHandle | null>>;
  onAddRecipients: () => void;
  isSigningMode: boolean;
  isReadOnly: boolean;
  isSigned?: boolean;
  onClickField: (event: React.MouseEvent<Element>, item: DroppedComponent, isEdit?: boolean) => void;
  currentRecipientId?: string;
  guidedFieldId?: string | null;
  guidedBadgeLabel?: 'Sign here' | 'Review';
  defaultDateFormat?: string;
  defaultWeekStart?: 'sunday' | 'monday';
  selectedFile: File | string | Doc | null;
  pages: number[];
  pageRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  generateThumbnails: (numPages: number) => void;
  toggleAddPageMenu: (event: React.MouseEvent, pageNumber?: number) => void;
  toggleMenu: (event: React.MouseEvent, pageIndex?: number) => void;
  signingToken?: string;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({
  imageRef,
  onImgUpload,
  containerHeight,
  zoom,
  documentRef,
  mouseMoveOnDropArea,
  mouseLeaveOnDropArea,
  clickOnDropArea,
  onSelectField,
  onAssignRecipient,
  onDuplicateField,
  onDeleteField,
  updateField,
  handleDragStop,
  handleResizeStop,
  textFieldRefs,
  onAddRecipients,
  isSigningMode,
  isReadOnly,
  isSigned,
  onClickField,
  currentRecipientId,
  guidedFieldId,
  guidedBadgeLabel,
  defaultDateFormat,
  defaultWeekStart,
  selectedFile,
  pages,
  pageRefs,
  generateThumbnails,
  toggleAddPageMenu,
  toggleMenu,
  signingToken,
}) => {
  const {
    draggingComponent,
    droppedComponents,
    error,
    recipients,
    selectedFieldId,
    setSelectedFieldId,
  } = useBuilderStore();
  const fileToRender = useMemo(() => resolvePdfSource(selectedFile as File | string | Doc | null), [selectedFile]);
  const lastGuidedScrollKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSigningMode || !guidedFieldId) {
      lastGuidedScrollKeyRef.current = null;
      return;
    }

    const targetField = droppedComponents.find(
      (component) => String(component.fieldId ?? component.id) === guidedFieldId
    );

    if (!targetField) {
      return;
    }

    const scrollKey = `${guidedFieldId}:${Math.round(containerHeight)}:${zoom}`;
    if (lastGuidedScrollKeyRef.current === scrollKey) {
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    const safeZoom = zoom > 0 ? zoom : 1;
    const safeFieldId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(guidedFieldId)
        : guidedFieldId.replace(/["\\]/g, '\\$&');

    const attemptScroll = (attempt: number) => {
      if (cancelled) {
        return;
      }

      const scrollContainer = documentRef.current?.parentElement;
      if (!scrollContainer) {
        if (attempt < 80) {
          retryTimer = window.setTimeout(() => attemptScroll(attempt + 1), 50);
        }
        return;
      }

      if (scrollContainer.clientHeight <= 0 || scrollContainer.scrollHeight <= 0) {
        if (attempt < 80) {
          retryTimer = window.setTimeout(() => attemptScroll(attempt + 1), 50);
        }
        return;
      }

      const targetElement = scrollContainer.querySelector(`[data-field-id="${safeFieldId}"]`) as HTMLElement | null;
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetRect = targetElement?.getBoundingClientRect();
      const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const maxLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);

      const nextTop = targetRect && targetRect.height > 0
        ? scrollContainer.scrollTop + (targetRect.top - containerRect.top) - (scrollContainer.clientHeight / 2) + (targetRect.height / 2)
        : (targetField.y * safeZoom) - (scrollContainer.clientHeight / 2) + ((targetField.height || 0) * safeZoom / 2);

      const nextLeft = targetRect && targetRect.width > 0
        ? scrollContainer.scrollLeft + (targetRect.left - containerRect.left) - (scrollContainer.clientWidth / 2) + (targetRect.width / 2)
        : (targetField.x * safeZoom) - (scrollContainer.clientWidth / 2) + ((targetField.width || 0) * safeZoom / 2);

      scrollContainer.scrollTo({
        top: Math.min(Math.max(nextTop, 0), maxTop),
        left: Math.min(Math.max(nextLeft, 0), maxLeft),
        behavior: 'smooth',
      });

      lastGuidedScrollKeyRef.current = scrollKey;
    };

    attemptScroll(0);

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [containerHeight, documentRef, droppedComponents, guidedFieldId, isSigningMode, zoom]);

  return (
    <>
      <input
        type="file"
        ref={imageRef}
        id="image"
        className="hidden"
        accept="image/png, image/jpeg, image/jpg"
        onChange={onImgUpload}
      />
      <div className={`flex relative overflow-auto flex-1 min-h-0 py-5 justify-center ${draggingComponent && 'cursor-fieldpicked'}`} id="dropzone">
        <div
          style={{ minHeight: `${containerHeight}px`, transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          onClick={clickOnDropArea}
          onMouseMove={mouseMoveOnDropArea}
          onMouseLeave={mouseLeaveOnDropArea}
          ref={documentRef}
        >
          <DroppedComponents
            droppedComponents={droppedComponents}
            selectedFieldId={selectedFieldId}
            setSelectedFieldId={setSelectedFieldId}
            onSelectField={onSelectField}
            onAssignRecipient={onAssignRecipient}
            onDuplicateField={onDuplicateField}
            onDeleteField={onDeleteField}
            updateField={updateField}
            handleDragStop={handleDragStop}
            handleResizeStop={handleResizeStop}
            textFieldRefs={textFieldRefs}
            zoom={zoom}
            recipients={recipients}
            onAddRecipients={onAddRecipients}
            isSigningMode={isSigningMode}
            isReadOnly={isReadOnly}
            isSigned={isSigned}
            onClickField={onClickField}
            currentRecipientId={currentRecipientId}
            guidedFieldId={guidedFieldId}
            guidedBadgeLabel={guidedBadgeLabel}
            defaultDateFormat={defaultDateFormat}
            defaultWeekStart={defaultWeekStart}
          />
          <PDFViewer
            selectedFile={fileToRender}
            pages={pages}
            zoom={1}
            pageRefs={pageRefs}
            generateThumbnails={generateThumbnails}
            toggleAddPageMenu={toggleAddPageMenu}
            toggleMenu={toggleMenu}
            error={error || ''}
            isSigningMode={isSigningMode}
            isReadOnly={isReadOnly}
            signingToken={signingToken}
          />
        </div>
      </div>
    </>
  );
};

export default EditorCanvas;
