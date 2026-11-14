'use client';
import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import useContextStore from '@/hooks/useContextStore';
import { getCsrfHeaders } from '@/utils/cookies';
import {
  getUploadSourceType,
  shouldConvertToPdf,
  validatePdfUploadMetadata,
} from '@/lib/pdf-upload-validation';

const UPLOAD_ERROR_TOAST_ID = 'document-upload-error';

export type UploadProgressStatus = {
  title: string;
  detail: string;
};

const DEFAULT_UPLOAD_STATUS: UploadProgressStatus = {
  title: 'Preparing your document...',
  detail: 'Keep this tab open while we get the builder ready.',
};

function getUploadProgressStatus(file: File): UploadProgressStatus {
  const sourceType = getUploadSourceType(file.name);
  if (sourceType && shouldConvertToPdf(sourceType)) {
    return {
      title: 'Converting Word document to PDF...',
      detail: 'This can take a few seconds. Keep this tab open.',
    };
  }

  return {
    title: 'Uploading PDF...',
    detail: 'Preparing your document for the builder.',
  };
}

function getCloudUploadProgressStatus(file: File, sourceLabel: string): UploadProgressStatus {
  const sourceType = getUploadSourceType(file.name);
  if (sourceType && shouldConvertToPdf(sourceType)) {
    return {
      title: `Converting Word document from ${sourceLabel}...`,
      detail: 'This can take a few seconds. Keep this tab open.',
    };
  }

  return {
    title: `Uploading PDF from ${sourceLabel}...`,
    detail: 'Preparing your document for the builder.',
  };
}

export default function useDropZone() {
  const { setSelectedFile, setDocuments } = useContextStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadProgressStatus>(DEFAULT_UPLOAD_STATUS);

  const addDocument = useCallback(
    async (file: File) => {
      const validationError = validatePdfUploadMetadata(file);
      if (validationError) {
        toast.error(validationError, { id: UPLOAD_ERROR_TOAST_ID });
        return null;
      }

      // Immediately create document on server (Version 1) and start a session
      try {
        // set a temporary selected file while upload occurs
        setSelectedFile(file);

        // Build form data similar to upload flow
        const formData = new FormData();
        formData.append('file', file, file.name);
        formData.append('documentName', file.name);
        formData.append('isMetadataOnly', 'false');

        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: 'Failed to upload document' }));
          const message = errorData.message || 'Failed to upload document';

          if (res.status === 401) {
            router.push('/login');
            return null;
          }

          toast.error(message, { id: UPLOAD_ERROR_TOAST_ID });
          return null;
        }

        const result = await res.json();
        if (result && result.success) {
          // store current ids and set selected file url
          if (result.documentId) {
            localStorage.setItem('currentDocumentId', result.documentId);
          }
          if (result.sessionId) {
            localStorage.setItem('currentSessionId', result.sessionId);
          }
          if (result.fileUrl) {
            setSelectedFile(result.fileUrl);
          }

          // Add to local documents list for UI
          const displayName = result.documentName || file.name;
          setDocuments(prevDocs => [
            ...prevDocs,
            {
              id: result.documentId || `${Date.now()}-${file.name}`,
              name: displayName,
              createdAt: new Date(),
              status: 'draft',
              signers: [],
              file: result.fileUrl || file,
            },
          ]);

          return result;
        }
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create document on upload';
        console.error('Failed to create document on upload:', err);
        toast.error(message, { id: UPLOAD_ERROR_TOAST_ID });
        setIsLoading(false);
        return null;
      }
    },
    [setSelectedFile, setDocuments, router]
  );

  const uploadAndOpenBuilder = useCallback(
    async (file: File, status: UploadProgressStatus = getUploadProgressStatus(file)) => {
      setUploadStatus(status);
      setIsLoading(true);

      try {
        const res = await addDocument(file);
        const docId = res?.documentId;
        if (docId) router.push(`/builder/${docId}`);
      } finally {
        setIsLoading(false);
      }
    },
    [addDocument, router]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        void uploadAndOpenBuilder(file);
      }
    },
    [uploadAndOpenBuilder]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void uploadAndOpenBuilder(file);
      }
    },
    [uploadAndOpenBuilder]
  );

  const handleCloudFile = useCallback(
    (file: File, sourceLabel: string) => {
      void uploadAndOpenBuilder(file, getCloudUploadProgressStatus(file, sourceLabel));
    },
    [uploadAndOpenBuilder]
  );

  const handleSampleContract = useCallback(async () => {
    setUploadStatus({
      title: 'Creating sample contract...',
      detail: 'Adding ready-made signing fields and opening the builder.',
    });
    setIsLoading(true);

    try {
      const response = await fetch('/api/documents/sample', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success || !result.documentId) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(result.message || 'Unable to create a sample contract.');
      }

      const documentId = String(result.documentId);
      localStorage.setItem('currentDocumentId', documentId);
      if (result.sessionId) localStorage.setItem('currentSessionId', result.sessionId);
      setDocuments((current) => [
        {
          id: documentId,
          documentId,
          name: result.documentName || 'Sample Mutual NDA',
          createdAt: new Date(),
          updatedAt: new Date(),
          currentVersion: 1,
          status: 'draft',
          fileUrl: `/api/documents/${documentId}`,
          url: `/api/documents/${documentId}`,
        },
        ...current.filter((document) => document.id !== documentId),
      ]);
      router.push(`/builder/${encodeURIComponent(documentId)}`);
    } catch (error) {
      console.error('Failed to create sample contract:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to create a sample contract.');
    } finally {
      setIsLoading(false);
    }
  }, [router, setDocuments]);

  return { isLoading, uploadStatus, handleDrop, handleSampleContract, handleFileInput, handleCloudFile };
}
