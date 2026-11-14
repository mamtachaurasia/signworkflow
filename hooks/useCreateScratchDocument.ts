'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import useContextStore from '@/hooks/useContextStore';
import { DASHBOARD_DOCUMENTS_REFRESH_EVENT } from '@/lib/dashboard-events';
import { getCsrfHeaders } from '@/utils/cookies';

type ScratchDocumentResponse = {
  success?: boolean;
  documentId?: string;
  sessionId?: string;
  message?: string;
  document?: {
    _id?: string;
    name?: string;
    currentVersion?: number;
    fileUrl?: string;
  };
};

/** Creates a recoverable authored draft and opens the writing workspace. */
export function useCreateScratchDocument() {
  const router = useRouter();
  const { setDocuments } = useContextStore();
  const creatingRef = useRef(false);
  const [isCreating, setIsCreating] = useState(false);

  const createScratchDocument = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setIsCreating(true);

    try {
      const response = await fetch('/api/documents/scratch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({})) as ScratchDocumentResponse;
      if (!response.ok || !body.success || !body.documentId) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(body.message || 'Unable to create a blank document. Please try again.');
      }

      const documentId = String(body.documentId);
      localStorage.setItem('currentDocumentId', documentId);
      if (body.sessionId) localStorage.setItem('currentSessionId', body.sessionId);

      setDocuments((current) => {
        const draft = {
          id: documentId,
          documentId,
          name: body.document?.name || 'Untitled document',
          createdAt: new Date(),
          updatedAt: new Date(),
          currentVersion: body.document?.currentVersion || 1,
          status: 'draft' as const,
          fileUrl: body.document?.fileUrl || `/api/documents/${documentId}?version=1`,
          url: body.document?.fileUrl || `/api/documents/${documentId}?version=1`,
          hasEditableContent: true,
        };
        return [draft, ...current.filter((document) => document.id !== documentId)];
      });
      window.dispatchEvent(new CustomEvent(DASHBOARD_DOCUMENTS_REFRESH_EVENT, {
        detail: { source: 'scratch-document' },
      }));
      router.push(`/builder/${encodeURIComponent(documentId)}?workspace=content`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create a blank document. Please try again.');
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  }, [router, setDocuments]);

  return { createScratchDocument, isCreating };
}

export default useCreateScratchDocument;
