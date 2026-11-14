'use client';
import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Doc, DocumentField, DroppedComponent, Recipient } from '@/types/types';
import { serializeDroppedComponentToField } from '@/lib/api';

const SaveAsTemplateModal = dynamic(() => import('@/components/SaveAsTemplateModal'), { ssr: false });

interface SaveAsTemplateGateProps {
  showSaveAsTemplate: boolean;
  isLoggedIn: boolean;
  setShowSaveAsTemplate: React.Dispatch<React.SetStateAction<boolean>>;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
  documentId: string | null;
  documentName: string;
  selectedFile: string | File | Doc | null;
  droppedComponents: DroppedComponent[];
  recipients: Recipient[];
  pages: number[];
  documentRef: React.RefObject<HTMLDivElement | null>;
  pageRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  currentPage: number;
  zoom: number;
}

const SaveAsTemplateGate: React.FC<SaveAsTemplateGateProps> = ({
  showSaveAsTemplate,
  isLoggedIn,
  setShowSaveAsTemplate,
  setShowModal,
  documentId,
  documentName,
  selectedFile,
  droppedComponents,
  recipients,
  pages,
  documentRef,
  pageRefs,
  currentPage,
  zoom,
}) => {
  useEffect(() => {
    if (showSaveAsTemplate && !isLoggedIn) {
      setShowModal(true);
    }
  }, [showSaveAsTemplate, isLoggedIn, setShowModal]);

  const buildDocumentFields = (): DocumentField[] => {
    const canvasRect = documentRef.current?.getBoundingClientRect() ?? null;
    const pageRects = pageRefs.current.map((pageEl) => pageEl?.getBoundingClientRect() ?? null);

    return droppedComponents.map((component) =>
      serializeDroppedComponentToField(component, {
        currentPage,
        canvasRect,
        pageRect: pageRects[(component.pageNumber ?? currentPage) - 1] ?? component.pageRect,
        zoom,
      })
    );
  };

  const documentFileUrl =
    typeof selectedFile === 'string'
      ? selectedFile
      : selectedFile && typeof selectedFile === 'object' && 'fileUrl' in selectedFile
        ? (selectedFile.fileUrl as string | undefined) ?? ''
        : '';

  if (!showSaveAsTemplate || !isLoggedIn) return null;

  return (
    <SaveAsTemplateModal
      documentId={documentId}
      documentName={documentName || 'Untitled'}
      documentFileUrl={documentFileUrl}
      documentFieldCount={droppedComponents.length}
      getDocumentFields={buildDocumentFields}
      defaultSigners={recipients.map((recipient, index) => ({ id: recipient.id, name: recipient.name, email: recipient.email, role: recipient.role, order: recipient.order || index + 1 }))}
      documentPageCount={pages.length}
      documentFileSize={0}
      onClose={() => setShowSaveAsTemplate(false)}
    />
  );
};

export default SaveAsTemplateGate;
