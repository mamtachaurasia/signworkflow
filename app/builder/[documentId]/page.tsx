import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import DocumentEditor from "@/components/builder/DocumentEditor";
import DocumentWriter from '@/components/documents/DocumentWriter';
import type { DocumentField, Recipient } from "@/types/types";

interface Props {
  params: Promise<{ documentId: string }>;
  searchParams?: Promise<{ guestId?: string | string[]; shareToken?: string | string[]; workspace?: string | string[] }>;
}

interface InitialDocumentData {
  fileUrl: string;
  documentName: string | null;
  fields: DocumentField[];
  recipients: Recipient[];
}

interface FetchDocumentResult {
  data: InitialDocumentData | null;
  status: number | null;
}

function isValidObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

async function fetchDocumentData(
  documentId: string,
  guestId?: string,
  shareToken?: string
): Promise<FetchDocumentResult> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) return { data: null, status: null };

  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
    const safeGuestId = typeof guestId === 'string' && guestId.startsWith('guest_')
      ? guestId
      : null;
    const query = new URLSearchParams({ id: documentId });
    if (safeGuestId) {
      query.set('guestId', safeGuestId);
    }
    if (shareToken) {
      query.set('shareToken', shareToken);
    }
    const url = `${baseUrl}/api/documents/load?${query.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return { data: null, status: res.status };
    }
    const data = await res.json();

    if (data.success && data.document) {
      const fileQuery = new URLSearchParams();
      if (safeGuestId) {
        fileQuery.set('guestId', safeGuestId);
      }
      if (shareToken) {
        fileQuery.set('shareToken', shareToken);
      }
      const fileUrl = `/api/documents/${encodeURIComponent(documentId)}${
        fileQuery.toString() ? `?${fileQuery.toString()}` : ''
      }`;

      return {
        data: {
          fileUrl,
          documentName: data.document.documentName || null,
          fields: data.document.fields || [],
          recipients: data.document.recipients || [],
        },
        status: res.status,
      };
    }

    return { data: null, status: res.status };
  } catch (err) {
    console.error("Error fetching document:", err);
    return { data: null, status: null };
  }
}

export default async function BuilderDoc({ params, searchParams }: Props) {
  const { documentId } = await params;
  if (!isValidObjectId(documentId)) {
    notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const guestIdParam = resolvedSearchParams?.guestId;
  const guestId = Array.isArray(guestIdParam) ? guestIdParam[0] : guestIdParam;
  const shareTokenParam = resolvedSearchParams?.shareToken;
  const shareToken = Array.isArray(shareTokenParam) ? shareTokenParam[0] : shareTokenParam;
  const workspaceParam = resolvedSearchParams?.workspace;
  const workspace = Array.isArray(workspaceParam) ? workspaceParam[0] : workspaceParam;

  if (workspace === 'content' && !guestId && !shareToken) {
    return <DocumentWriter documentId={documentId} />;
  }

  const { data: initialData, status } = await fetchDocumentData(documentId, guestId, shareToken);

  if (!initialData) {
    if (status === 404) {
      notFound();
    }
    // Fallback to client-side loading when SSR fetch cannot resolve auth/context.
    return <DocumentEditor documentId={documentId} />;
  }

  return (
    <DocumentEditor
      documentId={documentId}
      initialFileUrl={initialData.fileUrl}
      initialResourceName={initialData.documentName}
      initialFields={initialData.fields}
      initialRecipients={initialData.recipients}
    />
  );
}
