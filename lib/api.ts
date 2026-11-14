import { DocumentField, DroppedComponent, Recipient, UploadResult, DocumentFieldType } from "@/types/types";
import { getInMemoryAccessToken } from "@/lib/accessTokenStore";
import { serializePageRect } from "@/utils/builder/pageRect";
import { normalizeComponentSettings } from "@/utils/builder/documentFields";
import { getCookieValue } from "@/utils/cookies";

/* =====================================================
   FIELD TYPE MAPPING
===================================================== */
export const getFieldTypeFromComponentLabel = (label: string): string => {
    const mapping: Record<string, string> = {
        signature: "signature",
        image: "image",
        text: "text",
        date: "date",
        initials: "initials",
        "full name": "full_name",
        email: "text",
        checkbox: "checkbox",
        radio: "radio",
        dropdown: "dropdown",
        stamp: "stamp",
        "live photo": "live_photo"
    };

    return mapping[label?.toLowerCase()] ?? "text";
};

const defaultValueCapableComponents = new Set(['Text', 'Full Name', 'Email', 'Date', 'Dropdown', 'Radio']);

const resolvePersistedFieldSettings = (component: DroppedComponent): DocumentField['settings'] => {
    const normalized = normalizeComponentSettings(component.component, component.settings);
    const isRecipientDateField =
        component.component === 'Date' && (component.fieldOwner ?? 'recipients') === 'recipients';
    const currentValue =
        component.data === null || component.data === undefined
            ? ''
            : String(component.data);
    const configuredDefault = String(normalized?.defaultValue || '').trim();

    if (isRecipientDateField) {
        if (!normalized) return normalized;
        const rest = { ...normalized };
        delete rest.defaultValue;
        return Object.keys(rest).length > 0 ? rest : undefined;
    }

    if (
        defaultValueCapableComponents.has(component.component) &&
        currentValue.length > 0 &&
        configuredDefault.length === 0
    ) {
        return {
            ...(normalized || {}),
            defaultValue: currentValue,
        };
    }

    return normalized;
};

interface SerializeDroppedComponentToFieldOptions {
    currentPage: number;
    canvasRect?: DOMRect | null;
    pageRect?: DocumentField['pageRect'];
    zoom?: number;
}

interface UploadToServerOptions {
    fieldsReviewed?: boolean;
    reviewedVersion?: number | null;
}

export const serializeDroppedComponentToField = (
    component: DroppedComponent,
    {
        currentPage,
        canvasRect,
        pageRect,
        zoom,
    }: SerializeDroppedComponentToFieldOptions
): DocumentField => ({
    id: component.fieldId ?? component.id?.toString() ?? crypto.randomUUID(),
    repeatGroupId: component.repeatGroupId,
    repeatSourceId: component.repeatSourceId,
    type: getFieldTypeFromComponentLabel(component.component) as DocumentFieldType,
    x: component.x,
    y: component.y,
    width: component.width,
    height: component.height,
    pageNumber: component.pageNumber || currentPage,
    recipientId: component.assignedRecipientId,
    required: component.required !== false,
    value:
        component.data === null || component.data === undefined
            ? ""
            : String(component.data),
    placeholder: component.placeholder,
    settings: resolvePersistedFieldSettings(component),
    mimeType: component.mimeType,
    pageRect: serializePageRect(pageRect ?? component.pageRect, canvasRect, zoom),
    fieldOwner: component.fieldOwner,
});

/* =====================================================
   MAIN UPLOAD HANDLER
===================================================== */

export const uploadToServer = async (
    blob: Blob | null,
    documentName: string,
    currentPage: number,
    droppedComponents: DroppedComponent[],
    recipients: Recipient[],
    documentId: string | null,
    setDocumentId: (id: string) => void,
    setDocumentName: (name: string) => void,
    setSelectedFile: (name: string) => void,
    sessionId?: string | null,
    signingToken?: string,
    isMetadataOnly: boolean = true,
    options: UploadToServerOptions = {}
): Promise<UploadResult | null> => {

    /* =====================================================
       🔐 SIGNING MODE (RECIPIENT)
       NO FILE UPLOAD
       NO METADATA
    ===================================================== */
    if (signingToken) {
        const signingFields: DocumentField[] = droppedComponents.map((component) =>
            serializeDroppedComponentToField(component, {
                currentPage,
            })
        );
        const response = await fetch("/api/sign-document", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token: signingToken,
                fields: signingFields
            })
        });

        if (!response.ok) {
            throw new Error(`Signing failed (${response.status})`);
        }

        return await response.json();
    }

    /* =====================================================
       ✏️ EDITOR MODE (OWNER)
    ===================================================== */

    const formData = new FormData();

    const safeFileName = (documentName || "document")
        .replace(/\|/g, "-")
        .replace(/[<>:"/\\?*]+/g, "")
        .trim();

    const finalFileName = safeFileName.endsWith(".pdf")
        ? safeFileName
        : `${safeFileName}.pdf`;

    // Upload file only if creating or replacing a version
    if ((blob && !isMetadataOnly) || !documentId) {
        formData.append("file", blob as Blob, finalFileName);
    }

    formData.append("documentName", finalFileName);
    formData.append("isMetadataOnly", isMetadataOnly.toString());
    if (options.fieldsReviewed) {
        formData.append("fieldsReviewed", "true");
        if (typeof options.reviewedVersion === 'number' && Number.isInteger(options.reviewedVersion)) {
            formData.append("reviewedVersion", String(options.reviewedVersion));
        }
    }

    if (sessionId) {
        formData.append("sessionId", sessionId);
    }

    /* ===============================
       AUTH HEADERS
    =============================== */
    const headers: Record<string, string> = {};
    const token = getInMemoryAccessToken();

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    /* ===============================
       LOAD SERVER RECIPIENTS (existing docs only)
    =============================== */
    let serverRecipients: Recipient[] = [];
    if (documentId) {
        const loadResponse = await fetch(
            `/api/documents/load?id=${documentId}`,
            {
                headers,
                cache: "no-store",
                credentials: "include"
            }
        );

        if (!loadResponse.ok) {
            throw new Error(`Failed to load document (${loadResponse.status})`);
        }

        const loadData = await loadResponse.json();
        serverRecipients = loadData.document?.recipients ?? [];
    }

    /* ===============================
       MAP CLIENT FIELDS
    =============================== */
    const clientFields: DocumentField[] = droppedComponents.map((component) =>
        serializeDroppedComponentToField(component, {
            currentPage,
        })
    );

    /* ===============================
       MERGE RECIPIENTS
    =============================== */
    const mergedRecipients = serverRecipients.map(sr => {
        const cr = recipients.find(r => r.id === sr.id);
        return cr ? { ...sr, ...cr } : sr;
    });

    recipients.forEach(r => {
        if (!mergedRecipients.some(m => m.id === r.id)) {
            mergedRecipients.push(r);
        }
    });

    /* ===============================
       FORM DATA
    =============================== */
    // Persist exactly what is present in the editor so deletions are honored.
    formData.append("fields", JSON.stringify(clientFields));
    formData.append("recipients", JSON.stringify(mergedRecipients));

    if (documentId) {
        formData.append("documentId", documentId);
    }

    formData.append(
        "changeLog",
        isMetadataOnly
            ? "Field metadata updated"
            : documentId
                ? "New version created"
                : "Initial document creation"
    );

    /* ===============================
       SAVE
    =============================== */
    const response = await fetch("/api/documents/upload", {
        method: "POST",
        headers,
        body: formData,
        credentials: "include"
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const message = errorData?.message || errorData?.error || `Upload failed (${response.status})`;
        throw new Error(message);
    }

    const result = await response.json();

    if (result.documentId) {
        setDocumentId(result.documentId);
        localStorage.setItem("currentDocumentId", result.documentId);
    }

    if (result.documentName) {
        setDocumentName(result.documentName);
    }

    if (result.fileUrl) {
        setSelectedFile(result.fileUrl);
    }

    return result;
};

async function requestJson<TResponse = unknown>(
  method: "GET" | "POST" | "PATCH",
  url: string,
  data?: unknown
): Promise<TResponse> {
  const csrfToken = method === "GET" ? null : getCookieValue("csrf_token");
  const headers: Record<string, string> = {
    ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
  };
  const response = await fetch(`/api${url}`, {
    method,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    credentials: "include",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      (Array.isArray(payload?.errors) ? payload.errors.join(", ") : null) ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as TResponse;
}

export const api = {
  get: <TResponse = unknown>(url: string) => requestJson<TResponse>("GET", url),
  post: <TResponse = unknown>(url: string, data: unknown) => requestJson<TResponse>("POST", url, data),
  patch: <TResponse = unknown>(url: string, data: unknown) => requestJson<TResponse>("PATCH", url, data),
};
