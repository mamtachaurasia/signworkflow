"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, X, AlertCircle, CheckCircle2, ChevronRight, RotateCcwSquare, Pin, Wallet, Sparkles } from "lucide-react";

import DocumentEditor from "@/components/builder/DocumentEditor";
import { DocumentField, Recipient, SigningViewDocument } from "@/types/types";
import { notFound } from "next/navigation";
import Brand from "@/components/Brand";
import { Modal } from '@ui';
import LocationMap from "@/components/Map";
import { IDocumentRecipient } from "@/models/Document";
import { Button, Loader } from '@ui';
import PermissionHintPopover from "@/components/PermissionHintPopover";
import { dedupeFieldsById } from "@/utils/builder/documentFields";
import { isRecipientTurn } from "@/lib/signing-utils";
import { isFieldValueFilled, validateFieldValue } from "@/lib/field-rules";
import {
  ESIGN_DISCLOSURE_POINTS,
  ESIGN_DISCLOSURE_TITLE,
  hasAcceptedEsignDisclosure,
} from "@/lib/esign-disclosure";

interface SignPageClientProps {
  token?: string;
  previewMode?: boolean;
  previewDocument?: SigningViewDocument | null;
}

interface SignDocumentResponse {
  success: boolean;
  document: SigningViewDocument;
}

interface RecipientFieldMetrics {
  assignedCount: number;
  filledCount: number;
  pendingRequiredCount: number;
}

interface PreviewBootstrapState {
  doc: SigningViewDocument | null;
  error: string | null;
  currentRecipient: Recipient | null;
  currentRecipientId?: string;
  recipientMetrics: RecipientFieldMetrics;
  isSigned: boolean;
}

const EMPTY_METRICS: RecipientFieldMetrics = {
  assignedCount: 0,
  filledCount: 0,
  pendingRequiredCount: 0,
};

const DEFAULT_VALUE_ELIGIBLE_TYPES = new Set(['text', 'full_name', 'date', 'dropdown', 'radio']);

const getDocumentFieldId = (field: DocumentField): string => {
  const rawId = (field as { fieldId?: string }).fieldId ?? field.id;
  return String(rawId);
};

const hydrateDefaultFieldValues = (fields: DocumentField[]): DocumentField[] =>
  fields.map((field) => {
    if (!DEFAULT_VALUE_ELIGIBLE_TYPES.has(String(field.type || '').toLowerCase())) {
      return field;
    }
    const configuredDefault = String(field.settings?.defaultValue || '');
    if (!configuredDefault.trim()) {
      return field;
    }
    if (field.value === null || field.value === undefined) {
      return {
        ...field,
        value: configuredDefault,
      };
    }
    return field;
  });

const mergeIncomingPreviewFields = ({
  incomingFields,
  localFields,
  previousIncomingFields,
}: {
  incomingFields: DocumentField[];
  localFields: DocumentField[];
  previousIncomingFields: DocumentField[];
}): DocumentField[] => {
  if (localFields.length === 0 || previousIncomingFields.length === 0) {
    return incomingFields;
  }

  const localFieldById = new Map(
    localFields.map((field) => [getDocumentFieldId(field), field])
  );
  const previousIncomingFieldById = new Map(
    previousIncomingFields.map((field) => [getDocumentFieldId(field), field])
  );

  return incomingFields.map((field) => {
    const fieldId = getDocumentFieldId(field);
    const localField = localFieldById.get(fieldId);
    const previousIncomingField = previousIncomingFieldById.get(fieldId);

    if (!localField || !previousIncomingField) {
      return field;
    }

    if (localField.value === previousIncomingField.value) {
      return field;
    }

    return {
      ...field,
      value: localField.value,
    };
  });
};

const normalizeRecipientConsent = (
  consent?: IDocumentRecipient["consent"] | Recipient["consent"]
): IDocumentRecipient["consent"] | undefined => {
  if (!consent) return undefined;
  return {
    locationGranted: consent.locationGranted,
    grantedAt: consent.grantedAt,
    method:
      consent.method === "checkbox" || consent.method === "system_prompt"
        ? consent.method
        : "other",
    esignDisclosureAccepted: consent.esignDisclosureAccepted,
    esignDisclosureAcceptedAt: consent.esignDisclosureAcceptedAt,
    esignDisclosureVersion: consent.esignDisclosureVersion,
    esignDisclosureMethod:
      consent.esignDisclosureMethod === "checkbox" || consent.esignDisclosureMethod === "typed"
        ? consent.esignDisclosureMethod
        : "other",
  };
};

const derivePreviewRecipientState = (
  fields: DocumentField[],
  recipient: Recipient | null | undefined
) => {
  if (!recipient) {
    return {
      normalizedRecipient: null,
      metrics: EMPTY_METRICS,
      isSignedLike: false,
    };
  }

  const assigned = fields.filter((field) => field.recipientId === recipient.id);
  const pendingRequiredCount = assigned.filter(
    (field) =>
      field.required !== false &&
      !validateFieldValue({
        type: field.type,
        required: field.required,
        value: field.value,
        settings: field.settings,
      }).valid
  ).length;
  const filledCount = assigned.filter((field) =>
    isFieldValueFilled({
      type: field.type,
      required: field.required,
      value: field.value,
      settings: field.settings,
    })
  ).length;

  const normalizedRecipient = recipient;

  const isSignedLike =
    normalizedRecipient.status === "signed" || normalizedRecipient.status === "approved";

  return {
    normalizedRecipient,
    metrics: {
      assignedCount: assigned.length,
      filledCount,
      pendingRequiredCount,
    },
    isSignedLike,
  };
};

const buildPreviewBootstrapState = (
  previewDocument: SigningViewDocument | null
): PreviewBootstrapState => {
  if (!previewDocument) {
    return {
      doc: null,
      error: "Preview document is not available.",
      currentRecipient: null,
      currentRecipientId: undefined,
      recipientMetrics: EMPTY_METRICS,
      isSigned: false,
    };
  }

  if (previewDocument.deletedAt) {
    return {
      doc: null,
      error: "This document has been trashed and is no longer accessible.",
      currentRecipient: null,
      currentRecipientId: undefined,
      recipientMetrics: EMPTY_METRICS,
      isSigned: false,
    };
  }

  const previewFields = hydrateDefaultFieldValues(
    Array.isArray(previewDocument.fields) ? previewDocument.fields : []
  );
  const hydratedPreviewDocument = { ...previewDocument, fields: previewFields };
  const previewFieldCountByRecipient = new Map<string, number>();

  previewFields.forEach((field) => {
    if (!field.recipientId) return;
    previewFieldCountByRecipient.set(
      field.recipientId,
      (previewFieldCountByRecipient.get(field.recipientId) ?? 0) + 1
    );
  });

  const resolvedRecipientId =
    previewDocument.currentRecipientId ??
    previewDocument.currentRecipient?.id ??
    previewDocument.recipients.find((recipient) => {
      if (recipient.isCC || recipient.role === "viewer") return false;
      return (previewFieldCountByRecipient.get(recipient.id) ?? 0) > 0;
    })?.id ??
    previewDocument.recipients.find((recipient) => !recipient.isCC && recipient.role !== "viewer")?.id ??
    previewDocument.recipients.find(
      (recipient) => (previewFieldCountByRecipient.get(recipient.id) ?? 0) > 0
    )?.id ??
    previewDocument.recipients[0]?.id;

  const recipient =
    (resolvedRecipientId
      ? previewDocument.recipients.find((r) => r.id === resolvedRecipientId)
      : null) ?? previewDocument.currentRecipient ?? null;

  const { normalizedRecipient, metrics, isSignedLike } = derivePreviewRecipientState(
    previewFields,
    recipient
  );

  return {
    doc: hydratedPreviewDocument,
    error: null,
    currentRecipient: normalizedRecipient,
    currentRecipientId: recipient?.id,
    recipientMetrics: metrics,
    isSigned: isSignedLike,
  };
};

const SignPageClient: React.FC<SignPageClientProps> = ({ token, previewMode = false, previewDocument = null }) => {
  const previewBootstrap = useMemo(
    () => (previewMode ? buildPreviewBootstrapState(previewDocument) : null),
    [previewDocument, previewMode]
  );
  const [doc, setDoc] = useState<SigningViewDocument | null>(() => previewBootstrap?.doc ?? null);
  const [loading, setLoading] = useState(!previewMode);
  const [error, setError] = useState<string | null>(() => previewBootstrap?.error ?? null);
  const [isSigned, setIsSigned] = useState(() => previewBootstrap?.isSigned ?? false);
  const [currentRecipient, setCurrentRecipient] = useState<Recipient | null>(
    () => previewBootstrap?.currentRecipient ?? null
  );
  const [currentRecipientId, setCurrentRecipientId] = useState<string | undefined>(
    () => previewBootstrap?.currentRecipientId
  );
  const [recipientMetrics, setRecipientMetrics] = useState<RecipientFieldMetrics>(
    () => previewBootstrap?.recipientMetrics ?? EMPTY_METRICS
  );
  const [guidedMode, setGuidedMode] = useState<"idle" | "active" | "complete">("idle");
  const [guidedFieldId, setGuidedFieldId] = useState<string | null>(null);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [aiAssistantRequestKey, setAIAssistantRequestKey] = useState(0);
  const [manualReview, setManualReview] = useState(false);
  const [reviewedFieldIds, setReviewedFieldIds] = useState<Set<string>>(new Set());
  const [skippedOptionalFieldIds, setSkippedOptionalFieldIds] = useState<Set<string>>(new Set());
  const lastFieldsRef = useRef<string>('');
  const latestFieldsRef = useRef<DocumentField[]>([]);
  const lastPreviewPropFieldsRef = useRef<DocumentField[]>([]);
  const lastPreviewDocumentIdRef = useRef<string | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const guidedFocusTargetRef = useRef<string | null>(null);

  const [captureData, setCaptureData] = useState<Partial<IDocumentRecipient>>({});
  const [isGpsModalOpen, setIsGpsModalOpen] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isGpsConfirmed, setIsGpsConfirmed] = useState(false);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [isAcceptingConsent, setIsAcceptingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [disclosureChecked, setDisclosureChecked] = useState(false);

  const gpsErrorSr = "Location permission denied";
  const previewGuidanceSnapshotKey = useMemo(() => {
    if (!previewMode || !previewDocument) return null;
    const recipientKey =
      previewDocument.currentRecipientId ?? previewDocument.currentRecipient?.id ?? "";
    const fieldKey = (previewDocument.fields ?? [])
      .map((field) => [
        field.id,
        field.recipientId ?? "",
        field.pageNumber ?? 0,
        field.x,
        field.y,
        field.required === false ? 0 : 1,
        field.value ?? "",
      ].join(":"))
      .join("|");

    return `${recipientKey}::${fieldKey}`;
  }, [previewDocument, previewMode]);

  const getFieldId = useCallback((field: DocumentField) => getDocumentFieldId(field), []);

  const isFieldFilled = useCallback((field: DocumentField) => {
    return isFieldValueFilled({
      type: field.type,
      required: field.required,
      value: field.value,
      settings: field.settings,
    });
  }, []);

  const isFieldValid = useCallback((field: DocumentField) => {
    return validateFieldValue({
      type: field.type,
      required: field.required,
      value: field.value,
      settings: field.settings,
    }).valid;
  }, []);

  const normalizedFields = useMemo(
    () => dedupeFieldsById(doc?.fields || []),
    [doc?.fields]
  );

  const orderedRequiredFields = useMemo(() => {
    if (!doc || !currentRecipientId) return [];
    return normalizedFields
      .filter((field) => field.recipientId === currentRecipientId)
      .filter((field) => field.required !== false)
      .sort((a, b) => {
        const pageA = a.pageNumber ?? 0;
        const pageB = b.pageNumber ?? 0;
        if (pageA !== pageB) return pageA - pageB;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });
  }, [doc, currentRecipientId, normalizedFields]);

  const assignedRecipientFields = useMemo(() => {
    if (!doc || !currentRecipientId) return [];
    return normalizedFields.filter((field) => field.recipientId === currentRecipientId);
  }, [doc, currentRecipientId, normalizedFields]);

  const orderedGuidanceFields = useMemo(() => {
    return [...assignedRecipientFields].sort((a, b) => {
      const pageA = a.pageNumber ?? 0;
      const pageB = b.pageNumber ?? 0;
      if (pageA !== pageB) return pageA - pageB;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
  }, [assignedRecipientFields]);

  const pendingRequiredFields = useMemo(
    () => orderedRequiredFields.filter((field) => !isFieldValid(field)),
    [orderedRequiredFields, isFieldValid]
  );

  const pendingActiveGuidanceFields = useMemo(
    () =>
      orderedGuidanceFields.filter((field) => {
        const filled = isFieldFilled(field);
        const valid = isFieldValid(field);

        if (field.required === false && !filled && valid) {
          return !skippedOptionalFieldIds.has(getFieldId(field));
        }

        return !filled || !valid;
      }),
    [getFieldId, isFieldFilled, isFieldValid, orderedGuidanceFields, skippedOptionalFieldIds]
  );

  const invalidAssignedFields = useMemo(
    () => assignedRecipientFields.filter((field) => !isFieldValid(field)),
    [assignedRecipientFields, isFieldValid]
  );

  const allRequiredFieldsFilled = pendingRequiredFields.length === 0;
  const hasInvalidAssignedFields = invalidAssignedFields.length > 0;
  const allAssignedFieldsValid = !hasInvalidAssignedFields;
  const isGuidedEligible = Boolean(currentRecipient && !currentRecipient.isCC && currentRecipient.role !== "viewer");
  const isApprover = currentRecipient?.role === "approver";
  const finishAction: Recipient["status"] = isApprover ? "approved" : "signed";
  const finishLabel = isApprover ? "Approve Document" : "Finish & Sign";
  const requestLabel = isApprover ? "approval request" : "signature request";
  const completionLabel = isApprover ? "approved" : "signed";
  const derivedGuidedMode =
    isSigned || (pendingActiveGuidanceFields.length === 0 && allAssignedFieldsValid && !manualReview) ? "complete" : guidedMode;
  const guidedStatusLabel =
    derivedGuidedMode === "idle"
      ? "Ready"
      : derivedGuidedMode === "active"
        ? "In progress"
        : "Complete";
  const guidedStatusColor =
    derivedGuidedMode === "complete"
      ? "text-emerald-600"
      : derivedGuidedMode === "active"
        ? "text-brand-600"
        : "text-gray-600";
  const isActionComplete =
    isSigned || currentRecipient?.status === "signed" || currentRecipient?.status === "approved";
  const isRejected = currentRecipient?.status === "rejected";
  const isSequential = doc?.signingMode === "sequential";
  const isTurnAllowed = !isSequential || (currentRecipient ? isRecipientTurn(currentRecipient, doc?.recipients ?? []) : false);
  const reviewTotal = orderedGuidanceFields.length;
  const reviewCount = Math.min(reviewedFieldIds.size, reviewTotal);
  const reviewComplete = manualReview ? reviewTotal === 0 || reviewCount >= reviewTotal : false;
  const canAdvance = manualReview
    ? orderedGuidanceFields.length > 0
    : pendingActiveGuidanceFields.length > 0;
  const hasAssignedFields = recipientMetrics.assignedCount > 0;
  const canFinish = isApprover ? true : allRequiredFieldsFilled && allAssignedFieldsValid;
  const showFinish =
    !isActionComplete &&
    !isRejected &&
    (isApprover || hasAssignedFields) &&
    isTurnAllowed &&
    canFinish &&
    (!manualReview || reviewComplete || isApprover);
  const showNext =
    !isActionComplete &&
    !isRejected &&
    isTurnAllowed &&
    reviewTotal > 0 &&
    (pendingActiveGuidanceFields.length > 0 || manualReview) &&
    canAdvance;
  const showReview =
    !isActionComplete &&
    !isRejected &&
    isTurnAllowed &&
    reviewTotal > 0 &&
    pendingActiveGuidanceFields.length === 0 &&
    !manualReview;
  const showReject = isGuidedEligible && !isActionComplete && !isRejected && isTurnAllowed;
  const hasEsignConsent = hasAcceptedEsignDisclosure(
    normalizeRecipientConsent(captureData.consent) ?? currentRecipient?.consent
  );

  const guidedDone = Math.max(0, reviewTotal - pendingActiveGuidanceFields.length);
  const progressPercent = reviewTotal > 0 ? Math.round((guidedDone / reviewTotal) * 100) : 0;

  const documentStatusLabel = doc?.status ? doc.status.replace(/_/g, " ") : "";
  const recipientColor = currentRecipient?.color ?? "#E5E7EB";
  const paymentRequestLabel = useMemo(() => {
    if (!doc?.paymentRequest?.enabled || !doc.paymentRequest.amount) return null;
    return `${doc.paymentRequest.currency || 'INR'} ${Number(doc.paymentRequest.amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [doc?.paymentRequest]);

  const focusFieldById = useCallback((
    fieldId: string,
    options?: { focusInput?: boolean }
  ) => {
    if (typeof document === "undefined") return;
    guidedFocusTargetRef.current = fieldId;
    setGuidedFieldId(fieldId);
    const shouldFocusInput = options?.focusInput !== false;
    const safeId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(fieldId)
        : fieldId.replace(/["\\]/g, "\\$&");
    const focusAttempt = (attempt: number) => {
      if (guidedFocusTargetRef.current !== fieldId) {
        return;
      }

      const element = document.querySelector(`[data-field-id="${safeId}"]`) as HTMLElement | null;
      if (!element) {
        if (attempt < 40) {
          window.setTimeout(() => focusAttempt(attempt + 1), 50);
        }
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });

      const focusTarget =
        element.matches("textarea, input")
          ? element
          : (element.querySelector("textarea, input") as HTMLElement | null);

      if (shouldFocusInput && focusTarget && typeof focusTarget.focus === "function") {
        focusTarget.focus();
        if (
          "select" in focusTarget &&
          typeof (focusTarget as HTMLInputElement).select === "function"
        ) {
          (focusTarget as HTMLInputElement).select();
        }
        return;
      }
    };

    focusAttempt(0);
  }, []);

  const startGuidedSigning = useCallback((forceReview = false) => {
    if (!currentRecipient || currentRecipient.role === "viewer" || currentRecipient.isCC) return;
    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    const targetField = forceReview
      ? orderedGuidanceFields[0]
      : pendingActiveGuidanceFields[0] ?? orderedGuidanceFields[0];
    if (!targetField) {
      setGuidedMode("complete");
      setGuidedFieldId(null);
      setManualReview(false);
      return;
    }
    if (pendingActiveGuidanceFields.length === 0 && !forceReview) {
      setGuidedMode("complete");
      setGuidedFieldId(null);
      setManualReview(false);
      return;
    }
    setManualReview(forceReview);
    if (forceReview) {
      setReviewedFieldIds(new Set());
    }
    setGuidedMode("active");
    focusFieldById(getFieldId(targetField), { focusInput: false });
  }, [
    currentRecipient,
    focusFieldById,
    getFieldId,
    orderedGuidanceFields,
    pendingActiveGuidanceFields,
  ]);

  const focusNextGuidedField = useCallback(() => {
    if (guidedMode !== "active") {
      setGuidedMode("active");
    }

    if (manualReview) {
      if (orderedGuidanceFields.length === 0) {
        setGuidedMode("complete");
        setGuidedFieldId(null);
        return;
      }

      const currentIndex = guidedFieldId
        ? orderedGuidanceFields.findIndex((field) => getFieldId(field) === guidedFieldId)
        : -1;
      const nextIndex =
        currentIndex >= 0 && currentIndex < orderedGuidanceFields.length - 1
          ? currentIndex + 1
          : 0;
      focusFieldById(getFieldId(orderedGuidanceFields[nextIndex]), { focusInput: false });
      return;
    }

    const currentField = guidedFieldId
      ? orderedGuidanceFields.find((field) => getFieldId(field) === guidedFieldId)
      : null;
    const shouldSkipCurrentOptionalField = Boolean(
      currentField &&
      currentField.required === false &&
      !isFieldFilled(currentField) &&
      isFieldValid(currentField)
    );

    if (shouldSkipCurrentOptionalField && guidedFieldId) {
      setSkippedOptionalFieldIds((prev) => {
        if (prev.has(guidedFieldId)) return prev;
        const next = new Set(prev);
        next.add(guidedFieldId);
        return next;
      });
    }

    const nextPendingGuidanceFields = shouldSkipCurrentOptionalField && guidedFieldId
      ? pendingActiveGuidanceFields.filter((field) => getFieldId(field) !== guidedFieldId)
      : pendingActiveGuidanceFields;

    if (nextPendingGuidanceFields.length === 0) {
      setGuidedMode("complete");
      setGuidedFieldId(null);
      return;
    }

    const currentOrderedIndex = guidedFieldId
      ? orderedGuidanceFields.findIndex((field) => getFieldId(field) === guidedFieldId)
      : -1;
    const nextField =
      nextPendingGuidanceFields.find((field) => {
        const candidateIndex = orderedGuidanceFields.findIndex(
          (candidate) => getFieldId(candidate) === getFieldId(field)
        );
        return candidateIndex > currentOrderedIndex;
      }) ?? nextPendingGuidanceFields[0];

    focusFieldById(getFieldId(nextField), { focusInput: false });
  }, [
    focusFieldById,
    getFieldId,
    guidedMode,
    guidedFieldId,
    isFieldFilled,
    isFieldValid,
    manualReview,
    orderedGuidanceFields,
    pendingActiveGuidanceFields,
  ]);


  const getDeviceInfo = (): { type: 'mobile' | 'desktop' | 'tablet'; os: string; browser: string; userAgent: string } => {
    const userAgent = navigator.userAgent;
    let type: 'mobile' | 'desktop' | 'tablet' = 'desktop';

    if (/tablet|ipad|playbook|silk|(android(?!.*mobi))/i.test(userAgent)) {
      type = 'tablet';
    } else if (/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)) {
      type = 'mobile';
    }

    return {
      type,
      os: navigator.platform,
      browser: navigator.appCodeName,
      userAgent: navigator.userAgent,
    };
  };

  const deriveRecipientState = useCallback(
    (fields: DocumentField[], recipient: Recipient | null | undefined) => {
      if (!recipient) {
        return {
          normalizedRecipient: null,
          metrics: EMPTY_METRICS,
          isSignedLike: false,
        };
      }

      const assigned = fields.filter((field) => field.recipientId === recipient.id);
      const pendingRequiredCount = assigned.filter(
        (field) => field.required !== false && !isFieldValid(field)
      ).length;
      const filledCount = assigned.filter((field) => isFieldFilled(field)).length;

      // Server-persisted recipient status should remain authoritative after completion.
      const normalizedRecipient = recipient;

      const isSignedLike =
        normalizedRecipient.status === "signed" || normalizedRecipient.status === "approved";

      return {
        normalizedRecipient,
        metrics: {
          assignedCount: assigned.length,
          filledCount,
          pendingRequiredCount,
        },
        isSignedLike,
      };
    },
    [isFieldFilled, isFieldValid]
  );

  const openConsentDisclosure = useCallback(() => {
    setConsentError(null);
    setIsConsentModalOpen(true);
  }, []);

  const closeConsentDisclosure = useCallback(() => {
    setConsentError(null);
    setIsConsentModalOpen(false);
  }, []);

  const handleAcceptEsignConsent = useCallback(async () => {
    if (previewMode || !token || !currentRecipientId) return;
    if (!disclosureChecked) {
      setConsentError("Please accept the disclosure to continue.");
      return;
    }

    setIsAcceptingConsent(true);
    setConsentError(null);

    try {
      const device = getDeviceInfo();
      const response = await fetch("/api/sign-document/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          accepted: true,
          device,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to record disclosure consent.");
      }

      const normalizedConsent = normalizeRecipientConsent(result.consent);
      setCaptureData((prev) => ({
        ...prev,
        device,
        consent: normalizedConsent,
      }));
      setCurrentRecipient((prev) =>
        prev ? { ...prev, device, consent: normalizedConsent } : prev
      );
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              recipients: prev.recipients.map((recipient) =>
                recipient.id === currentRecipientId
                  ? { ...recipient, device, consent: normalizedConsent }
                  : recipient
              ),
            }
          : prev
      );
      setDisclosureChecked(false);
      setIsConsentModalOpen(false);
    } catch (error) {
      setConsentError(
        error instanceof Error ? error.message : "Unable to record disclosure consent."
      );
    } finally {
      setIsAcceptingConsent(false);
    }
  }, [currentRecipientId, disclosureChecked, previewMode, token]);

  const handleSignOrApprove = useCallback(async (action: Recipient["status"]) => {
    try {
      const recipientId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("recipient")
          : null;
      const resolvedRecipientId =
        recipientId || currentRecipientId || currentRecipient?.id || null;

      if (previewMode) {
        if (action === 'rejected') {
          setDoc(prevDoc => {
            if (!prevDoc) return null;
            const newRecipients = prevDoc.recipients.map(r => {
              if (r.id === resolvedRecipientId) {
                return { ...r, status: action };
              }
              return r;
            });
            return { ...prevDoc, recipients: newRecipients };
          });
          setCurrentRecipient(prev => prev ? { ...prev, status: action } : null);
          setIsSigned(false);
        }
        return;
      }

      if (!hasEsignConsent) {
        setConsentError("Please accept the disclosure before continuing.");
        openConsentDisclosure();
        return;
      }

      if (action === "signed") {
        const fields =
          latestFieldsRef.current.length > 0
            ? latestFieldsRef.current
            : doc?.fields ?? [];
        const recipientFields = resolvedRecipientId
          ? fields.filter((field) => field.recipientId === resolvedRecipientId)
          : [];
        const firstInvalidRecipientField = recipientFields.find(
          (field) =>
            !validateFieldValue({
              type: field.type,
              required: field.required,
              value: field.value,
              settings: field.settings,
            }).valid
        );
        if (firstInvalidRecipientField) {
          const reason = validateFieldValue({
            type: firstInvalidRecipientField.type,
            required: firstInvalidRecipientField.required,
            value: firstInvalidRecipientField.value,
            settings: firstInvalidRecipientField.settings,
          }).reason;
          throw new Error(reason || "Please complete all required fields before finishing.");
        }

        const normalizedFields = fields.map((field) => {
          const ownerPrefilled = field.fieldOwner === "me" || (!field.recipientId && field.fieldOwner !== "recipients");
          const currentRecipientField = resolvedRecipientId ? field.recipientId === resolvedRecipientId : false;
          if (!ownerPrefilled && !currentRecipientField) {
            return field;
          }
          return {
            ...field,
            value: field.value ?? '',
          };
        });
        const response = await fetch("/api/sign-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, fields: normalizedFields, recipientId: resolvedRecipientId, ...captureData }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "Failed to sign document");
        }

        setDoc(prevDoc => {
          if (!prevDoc) return null;
          const newRecipients = prevDoc.recipients.map(r => {
            if (r.id === resolvedRecipientId) {
              return { ...r, status: action };
            }
            return r;
          });
          return { ...prevDoc, recipients: newRecipients };
        });

        setIsSigned(true);
        setCurrentRecipient(prev => prev ? { ...prev, status: action } : null);
        return;
      }

      const response = await fetch("/api/signedDocument", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, recipientId: resolvedRecipientId, action, ...captureData }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `Failed to ${action} document`);
      }

      setDoc(prevDoc => {
        if (!prevDoc) return null;
        const newRecipients = prevDoc.recipients.map(r => {
          if (r.id === resolvedRecipientId) {
            return { ...r, status: action };
          }
          return r;
        });
        return { ...prevDoc, recipients: newRecipients };
      });

      if (action === 'approved' || action === 'rejected') {
        setIsSigned(action === 'approved');
        // Update current recipient status in local state
        setCurrentRecipient(prev => prev ? { ...prev, status: action } : null);
      }
    } catch (err) {
      console.error('Error in handleSignOrApprove:', err);
      alert(`Failed to ${action} document: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [previewMode, token, captureData, currentRecipientId, currentRecipient, doc, hasEsignConsent, openConsentDisclosure]);

  useEffect(() => {
    if (!previewMode) return;

    if (!previewDocument) {
      setError("Preview document is not available.");
      setLoading(false);
      return;
    }

    if (previewDocument.deletedAt) {
      setError("This document has been trashed and is no longer accessible.");
      setLoading(false);
      return;
    }

    setError(null);
    const incomingPreviewFields = hydrateDefaultFieldValues(
      Array.isArray(previewDocument.fields) ? previewDocument.fields : []
    );
    const shouldResetPreviewMergeState =
      lastPreviewDocumentIdRef.current !== previewDocument.id;
    const previewFields = mergeIncomingPreviewFields({
      incomingFields: incomingPreviewFields,
      localFields: shouldResetPreviewMergeState ? [] : latestFieldsRef.current,
      previousIncomingFields: shouldResetPreviewMergeState
        ? []
        : lastPreviewPropFieldsRef.current,
    });
    setDoc({ ...previewDocument, fields: previewFields });
    latestFieldsRef.current = previewFields;
    lastFieldsRef.current = JSON.stringify(previewFields);
    lastPreviewPropFieldsRef.current = incomingPreviewFields;
    lastPreviewDocumentIdRef.current = previewDocument.id;

    const previewFieldCountByRecipient = new Map<string, number>();
    previewFields.forEach((field) => {
      if (!field.recipientId) return;
      previewFieldCountByRecipient.set(
        field.recipientId,
        (previewFieldCountByRecipient.get(field.recipientId) ?? 0) + 1
      );
    });

    const resolvedRecipientId =
      previewDocument.currentRecipientId ??
      previewDocument.currentRecipient?.id ??
      previewDocument.recipients.find((recipient) => {
        if (recipient.isCC || recipient.role === "viewer") return false;
        return (previewFieldCountByRecipient.get(recipient.id) ?? 0) > 0;
      })?.id ??
      previewDocument.recipients.find((recipient) => !recipient.isCC && recipient.role !== "viewer")?.id ??
      previewDocument.recipients.find(
        (recipient) => (previewFieldCountByRecipient.get(recipient.id) ?? 0) > 0
      )?.id ??
      previewDocument.recipients[0]?.id;

    const recipient =
      (resolvedRecipientId
        ? previewDocument.recipients.find((r) => r.id === resolvedRecipientId)
        : null) ?? previewDocument.currentRecipient ?? null;

    if (recipient) {
      const { normalizedRecipient, metrics, isSignedLike } = deriveRecipientState(
        previewFields,
        recipient
      );
      setCurrentRecipientId(recipient.id);
      setCurrentRecipient(normalizedRecipient);
      setRecipientMetrics(metrics);
      setIsSigned(isSignedLike);
    } else {
      setCurrentRecipientId(undefined);
      setCurrentRecipient(null);
      setRecipientMetrics(EMPTY_METRICS);
      setIsSigned(false);
    }

    setCaptureData({});
    setIsGpsConfirmed(true);
    setIsGpsModalOpen(false);
    setGpsError(null);
    setLoading(false);
  }, [previewDocument, previewMode, deriveRecipientState]);

  useEffect(() => {
    if (previewMode) return;

    const fetchPdf = async () => {
      try {
        if (!token) throw new Error("Signing token not specified");
        setLoading(true);
        const recipientId = new URLSearchParams(window.location.search).get("recipient");
        const res = await fetch(`/api/sign-document?token=${encodeURIComponent(token)}&recipient=${recipientId}`, {
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Invalid or expired signing link.");

        const data: SignDocumentResponse = await res.json();
        if (!data.success || !data.document) notFound();

        if (data.document.deletedAt) {
          setError("This document has been trashed and is no longer accessible.");
          return;
        }

        const hydratedFields = hydrateDefaultFieldValues(
          Array.isArray(data.document?.fields) ? data.document.fields : []
        );
        setDoc({ ...data.document, fields: hydratedFields });
        latestFieldsRef.current = hydratedFields;

        const resolvedRecipientId =
          data.document.currentRecipientId ??
          recipientId ??
          data.document.currentRecipient?.id;

        const recipient =
          (resolvedRecipientId
            ? data.document.recipients.find(r => r.id === resolvedRecipientId)
            : null) ?? data.document.currentRecipient ?? null;

        if (recipient) {
          setCurrentRecipientId(recipient.id);
          setCaptureData({ device: getDeviceInfo() });

          const gpsCacheKey = `gps:${token}:${recipient.id}`;
          let cachedGps: Pick<IDocumentRecipient, 'location' | 'consent'> | null = null;
          if (typeof window !== "undefined") {
            try {
              const raw = window.sessionStorage.getItem(gpsCacheKey);
              cachedGps = raw ? JSON.parse(raw) : null;
            } catch {
              cachedGps = null;
            }
          }

          const hasCachedGps =
            !!cachedGps?.consent?.locationGranted && !!cachedGps?.location;
          const hasServerGps =
            !!recipient?.consent?.locationGranted && !!recipient?.location;

          if (hasCachedGps || hasServerGps) {
            const source = hasCachedGps ? cachedGps : recipient;
            const normalizedConsent = normalizeRecipientConsent(source?.consent);
            setCaptureData(prev => ({
              ...prev,
              location: source?.location,
              consent: normalizedConsent,
            }));
            setIsGpsConfirmed(true);
          } else if (recipient.captureGpsLocation && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setCaptureData(prev => ({
                  ...prev,
                  location: {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracyMeters: pos.coords.accuracy,
                    capturedAt: new Date(),
                  },
                  consent: {
                    locationGranted: true,
                    grantedAt: new Date(),
                    method: 'system_prompt',
                  },
                }));
                setIsGpsModalOpen(true);
              },
              () => setGpsError(gpsErrorSr)
            );
          }
          const { normalizedRecipient, metrics, isSignedLike } = deriveRecipientState(
            hydratedFields,
            recipient
          );

          setCurrentRecipient(normalizedRecipient);
          setRecipientMetrics(metrics);
          setIsSigned(isSignedLike);
        } else {
          setCurrentRecipient(null);
          setRecipientMetrics(EMPTY_METRICS);
          setIsSigned(false);
        }
      } catch (err: unknown) {
        console.error(err);
        const msg = err instanceof Error ? err.message : "Failed to fetch document";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchPdf();
  }, [previewMode, token, deriveRecipientState]);

  const handleGpsConfirm = () => {
    setIsGpsConfirmed(true);
    setIsGpsModalOpen(false);
    try {
      if (typeof window !== "undefined" && currentRecipientId) {
        const cacheKey = `gps:${token}:${currentRecipientId}`;
        const payload = {
          location: captureData.location,
          consent: captureData.consent,
        };
        window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
      }
    } catch {
      // Ignore storage errors
    }
  };

  const handleGpsCancel = () => {
    setIsGpsConfirmed(false);
    setIsGpsModalOpen(false);
    setGpsError("GPS confirmation is required to sign this document.");
  };

  const openSummaryAssistant = useCallback(() => {
    setAIAssistantRequestKey((key) => key + 1);
    setIsAIAssistantOpen(true);
  }, []);

  useEffect(() => {
    if (!doc || !currentRecipientId) {
      setRecipientMetrics(EMPTY_METRICS);
      if (currentRecipient) {
        setCurrentRecipient(null);
      }
      return;
    }

    const latestRecipient =
      doc.recipients.find((r) => r.id === currentRecipientId) ?? currentRecipient;

    const { normalizedRecipient, metrics } = deriveRecipientState(
      doc.fields,
      latestRecipient
    );

    setRecipientMetrics(metrics);

    if (normalizedRecipient) {
      if (
        !currentRecipient ||
        currentRecipient.id !== normalizedRecipient.id ||
        currentRecipient.status !== normalizedRecipient.status
      ) {
        setCurrentRecipient(normalizedRecipient);
      }
    } else {
      if (currentRecipient) {
        setCurrentRecipient(null);
      }
    }
  }, [doc, currentRecipientId, currentRecipient, deriveRecipientState]);

  useEffect(() => {
    if (previewMode) {
      return;
    }
    if (isSigned) {
      setGuidedMode("complete");
      setGuidedFieldId(null);
      setManualReview(false);
      return;
    }
    if (guidedMode === "active" && pendingActiveGuidanceFields.length === 0) {
      if (manualReview) {
        return;
      }
      setGuidedMode("complete");
      setGuidedFieldId(null);
    }
  }, [guidedMode, isSigned, manualReview, pendingActiveGuidanceFields.length, previewMode]);

  useEffect(() => {
    if (previewMode) {
      return;
    }
    if (
      derivedGuidedMode !== "active" ||
      !guidedFieldId ||
      !doc ||
      !currentRecipientId
    ) {
      return;
    }
    if (manualReview) return;

    const currentField = normalizedFields.find(
      (field) => getFieldId(field) === guidedFieldId
    );

    if (!currentField) return;
    if (currentField.recipientId !== currentRecipientId) return;
    if (!isFieldFilled(currentField)) return;
    if (pendingActiveGuidanceFields.length === 0) return;

    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }
    const timer = window.setTimeout(() => {
      focusNextGuidedField();
    }, 200);

    autoAdvanceTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (autoAdvanceTimerRef.current === timer) {
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [
    currentRecipientId,
    derivedGuidedMode,
    doc,
    focusNextGuidedField,
    getFieldId,
    guidedFieldId,
    isFieldFilled,
    manualReview,
    normalizedFields,
    pendingActiveGuidanceFields.length,
    previewMode,
  ]);

  useEffect(() => {
    setGuidedMode("idle");
    setGuidedFieldId(null);
    setManualReview(false);
    setReviewedFieldIds(new Set());
    setSkippedOptionalFieldIds(new Set());
  }, [currentRecipientId]);

  useEffect(() => {
    if (previewMode || !currentRecipient || isActionComplete || isRejected) {
      setIsConsentModalOpen(false);
      setConsentError(null);
      setDisclosureChecked(false);
      return;
    }

    const accepted = hasAcceptedEsignDisclosure(
      normalizeRecipientConsent(captureData.consent) ?? currentRecipient.consent
    );
    setIsConsentModalOpen(!accepted);
    if (accepted) {
      setConsentError(null);
      setDisclosureChecked(false);
    }
  }, [captureData.consent, currentRecipient, isActionComplete, isRejected, previewMode]);

  useEffect(() => {
    if (!previewMode || !previewGuidanceSnapshotKey) return;

    guidedFocusTargetRef.current = null;
    setGuidedMode("idle");
    setGuidedFieldId(null);
    setManualReview(false);
    setReviewedFieldIds(new Set());
    setSkippedOptionalFieldIds(new Set());
  }, [previewGuidanceSnapshotKey, previewMode]);

  useEffect(() => {
    if (!previewMode) return;
    if (!isGuidedEligible || isActionComplete || isRejected) {
      if (guidedFieldId !== null) {
        setGuidedFieldId(null);
      }
      return;
    }

    const previewGuidedFields = manualReview ? orderedGuidanceFields : pendingActiveGuidanceFields;
    const nextGuidedFieldId =
      previewGuidedFields.length > 0 ? getFieldId(previewGuidedFields[0]) : null;

    const hasActivePreviewTarget =
      guidedFieldId !== null &&
      previewGuidedFields.some((field) => getFieldId(field) === guidedFieldId);

    if (!hasActivePreviewTarget && nextGuidedFieldId) {
      focusFieldById(nextGuidedFieldId, { focusInput: false });
      return;
    }

    if (nextGuidedFieldId === null && guidedFieldId !== null) {
      setGuidedFieldId(null);
    }
  }, [
    focusFieldById,
    getFieldId,
    guidedFieldId,
    isActionComplete,
    isGuidedEligible,
    isRejected,
    manualReview,
    orderedGuidanceFields,
    pendingActiveGuidanceFields,
    previewMode,
  ]);

  useEffect(() => {
    if (!manualReview || !guidedFieldId) return;
    setReviewedFieldIds((prev) => {
      if (prev.has(guidedFieldId)) return prev;
      const next = new Set(prev);
      next.add(guidedFieldId);
      return next;
    });
  }, [guidedFieldId, manualReview]);

  useEffect(() => {
    if (!manualReview) return;
    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, [manualReview]);

  useEffect(() => {
    if (previewMode) return;
    if (!isGuidedEligible || isActionComplete || isRejected) return;
    if (derivedGuidedMode !== "idle") return;
    if (pendingActiveGuidanceFields.length === 0) return;

    startGuidedSigning();
  }, [
    derivedGuidedMode,
    isActionComplete,
    isGuidedEligible,
    isRejected,
    pendingActiveGuidanceFields.length,
    previewMode,
    startGuidedSigning,
  ]);

  // Keep sequential signers updated while they wait for earlier recipients to complete.
  const refreshDocument = useCallback(async () => {
    try {
      if (previewMode || !token) return;
      const recipientId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("recipient")
          : null;
      const res = await fetch(
        `/api/sign-document?token=${encodeURIComponent(token)}&recipient=${recipientId ?? ''}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;

      const data: SignDocumentResponse = await res.json();
      if (!data?.success || !data.document) return;
      if (data.document.deletedAt) {
        setError("This document has been trashed and is no longer accessible.");
        return;
      }
      const hydratedServerFields = hydrateDefaultFieldValues(
        Array.isArray(data.document.fields) ? data.document.fields : []
      );

      const nextFields =
        lastFieldsRef.current.length === 0
          ? hydratedServerFields
          : (latestFieldsRef.current.length > 0 ? latestFieldsRef.current : hydratedServerFields);
      setDoc(prev =>
        prev
          ? { ...prev, ...data.document, fields: nextFields }
          : { ...data.document, fields: nextFields }
      );

      const resolvedRecipientId =
        data.document.currentRecipientId ??
        recipientId ??
        data.document.currentRecipient?.id;
      const recipient =
        (resolvedRecipientId
          ? data.document.recipients.find(r => r.id === resolvedRecipientId)
          : null) ?? data.document.currentRecipient ?? null;

      const { normalizedRecipient, metrics, isSignedLike } = deriveRecipientState(
        nextFields,
        recipient
      );
      setCurrentRecipientId(resolvedRecipientId ?? undefined);
      setCurrentRecipient(normalizedRecipient);
      setRecipientMetrics(metrics);
      setIsSigned(isSignedLike);
    } catch (err) {
      console.error('Error refreshing document:', err);
    }
  }, [previewMode, token, deriveRecipientState]);

  useEffect(() => {
    if (!isSequential || isActionComplete || isRejected || isTurnAllowed) return;
    refreshDocument();
    const interval = window.setInterval(refreshDocument, 15000);
    return () => window.clearInterval(interval);
  }, [isSequential, isActionComplete, isRejected, isTurnAllowed, refreshDocument]);

  const renderCenteredMessage = (message: string, icon?: React.ReactNode) => (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 text-red-500">
      {icon}
      <p>{message}</p>
    </div>
  );

  if (loading) {
    return <Loader text="Loading document..." className="min-h-screen w-full" />
  }

  if (gpsError) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="text-red-500" />
        <p>{gpsError}</p>
        <PermissionHintPopover visible={gpsError === gpsErrorSr} />
        {!isGpsConfirmed && gpsError !== gpsErrorSr && (
          <Button size="sm"
            onClick={() => {
              setGpsError(null);
              setIsGpsConfirmed(false);
              setIsGpsModalOpen(true);
            }}
            label="Retry Location"
          />
        )}
      </div>
    );
  }
  if (error) return renderCenteredMessage(error);
  if (!previewMode && !token) return renderCenteredMessage("Invalid link");

  return (
    <>
      <header className="sticky top-0 z-20 flex md:items-center md:justify-between pl-10 pr-16 w-full bg-white border-b border-gray-200">
        <Brand />
        <div className="text-xs space-y-1.5">
          {currentRecipient && (
            <span className="flex items-center gap-2 font-medium  text-black">
              <span className="border-b" style={{ borderBottomColor: recipientColor }}>
                Hello, {currentRecipient.name || "Recipient"}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide" style={{ backgroundColor: `${recipientColor}33` }}>
                {currentRecipient.isCC ? "CC" : currentRecipient.role}
              </span>
            </span>
          )}
          <div className="text-xs text-gray-500 gap-1 flex flex-wrap">
            <span>
              You have {requestLabel} for
            </span>
            <span className="font-semibold text-gray-900 truncate" title={doc?.name || "Document"}>
              {doc?.name || "Document"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          {doc?.paymentRequest?.enabled &&
            (doc.paymentRequest.status === 'paid' ? (
              <span className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-medium text-emerald-800">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  Payment confirmed
                </span>
              </span>
            ) : doc.paymentRequest.paymentLinkUrl ? (
              <a
                href={doc.paymentRequest.paymentLinkUrl}
                target="_blank"
                rel="nofollow noreferrer"
                className="rounded-full bg-orange-100 px-4 py-2 text-xs font-medium text-orange-800 hover:bg-orange-200"
              >
                <span className="inline-flex items-center gap-2">
                  <Wallet size={14} />
                  {paymentRequestLabel ? `Pay ${paymentRequestLabel}` : 'Review payment request'}
                </span>
              </a>
            ) : null)}
          {documentStatusLabel && (
            <span
              className="rounded-full px-2 py-1 text-xs text-black"
              style={{ backgroundColor: `${recipientColor}50` }}
            >
              {documentStatusLabel}
            </span>
          )}
          {!previewMode && token && doc?.id && (
            <Button
              aria-label="Summarize document"
              icon={<Sparkles size={16} />}
              inverted
              title="Open AI summarization"
              label="Summarize"
              onClick={openSummaryAssistant}
              size="sm"
            />
          )}
          <a
            href={doc?.fileUrl}
            download
            className="bg-brand-600 text-white px-4 py-2 rounded-sm hover:bg-brand-700 flex items-center text-xs"
          >
            <Download size={16} className="mr-2" />
            Download
          </a>
        </div>
      </header>
     
        {/* GPS MODAL */}
        <Modal visible={isGpsModalOpen} onClose={handleGpsCancel} handleConfirm={handleGpsConfirm} title="Confirm your location">
          {captureData.location && (
            <LocationMap
              latitude={captureData.location.latitude}
              longitude={captureData.location.longitude}
            />
          )}
        </Modal>

        <Modal
          visible={isConsentModalOpen}
          onClose={closeConsentDisclosure}
          title={ESIGN_DISCLOSURE_TITLE}
          className="max-w-2xl"
        >
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              Before you continue, please review and accept the disclosure for using
              electronic records and signatures in this transaction.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              {ESIGN_DISCLOSURE_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={disclosureChecked}
                onChange={(event) => {
                  setDisclosureChecked(event.target.checked);
                  if (consentError) {
                    setConsentError(null);
                  }
                }}
              />
              <span>
                I consent to use electronic records and electronic signatures for this
                document.
              </span>
            </label>
            {consentError ? (
              <p className="text-sm text-rose-700">{consentError}</p>
            ) : null}
            <div className="flex justify-end gap-3">
              <Button
                size="sm"
                inverted
                onClick={closeConsentDisclosure}
                label="Review later"
              />
              <Button
                size="sm"
                onClick={handleAcceptEsignConsent}
                disabled={isAcceptingConsent}
                label={isAcceptingConsent ? "Saving..." : "Accept and continue"}
              />
            </div>
          </div>
        </Modal>

        {doc && (
          <div className="relative">

              <DocumentEditor
                documentId={doc.id}
                initialFileUrl={doc.fileUrl}
                initialResourceName={doc.name}
                initialFields={doc.fields}
                initialRecipients={doc.recipients}
                isSigningMode={true}
                isPreviewOnly={previewMode}
                isSigned={isSigned}
                signingToken={token}
                currentRecipientId={currentRecipientId}
                aiAssistantOpen={isAIAssistantOpen}
                onAIAssistantOpenChange={setIsAIAssistantOpen}
                aiAssistantRequestedTab="summary"
                aiAssistantRequestKey={aiAssistantRequestKey}
                guidedFieldId={guidedFieldId}
                guidedBadgeLabel={manualReview ? "Review" : "Sign here"}
                onFieldsChange={(fields: DocumentField[]) => {
                  // Prevent infinite loop by checking if fields actually changed
                  const fieldsStr = JSON.stringify(fields);
                  if (lastFieldsRef.current !== fieldsStr) {
                    lastFieldsRef.current = fieldsStr;
                    latestFieldsRef.current = fields;
                    setDoc(prev => prev ? { ...prev, fields } : null);
                  }
                }}
              />


            <div className="fixed bottom-4 left-1/2 z-40 w-7/12 -translate-x-1/2 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-xl backdrop-blur-sm">
              {doc.paymentRequest?.enabled &&
                (doc.paymentRequest.status === 'paid' ? (
                  <div className="mb-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <div>
                      <div className="font-semibold">Payment confirmed</div>
                      <div>This payment request has already been marked as paid.</div>
                      {doc.paymentRequest.description && (
                        <div className="text-emerald-700">{doc.paymentRequest.description}</div>
                      )}
                    </div>
                    <span className="rounded-full bg-emerald-600 px-3 py-2 font-medium text-white">
                      Paid
                    </span>
                  </div>
                ) : doc.paymentRequest.paymentLinkUrl ? (
                  <div className="mb-3 flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                    <div>
                      <div className="font-semibold">Payment request attached</div>
                      <div>{paymentRequestLabel || 'Open the payment link to review details.'}</div>
                      {doc.paymentRequest.description && (
                        <div className="text-orange-700">{doc.paymentRequest.description}</div>
                      )}
                    </div>
                    <a
                      href={doc.paymentRequest.paymentLinkUrl}
                      target="_blank"
                      rel="nofollow noreferrer"
                      className="rounded-full bg-orange-600 px-3 py-2 font-medium text-white hover:bg-orange-700"
                    >
                      Open payment link
                    </a>
                  </div>
                ) : null)}
              <div className="flex justify-between ">
                <div className="font-semibold text-sm text-gray-900 flex items-center gap-2 mb-1">
                  Your Progress
                  <small className={`rounded-full text-xs px-2 h-4 py-0 ${guidedStatusColor} bg-slate-100`}>
                    {guidedStatusLabel}
                  </small>
                  {recipientMetrics.assignedCount > 0 && (
                    <small
                      className="p-1 rounded-md font-normal text-xs"
                      style={{ backgroundColor: currentRecipient?.color + "50" }}
                    >
                      {recipientMetrics.filledCount}/{recipientMetrics.assignedCount}
                    </small>
                  )}
                </div>

                {!currentRecipient && <span className="text-xs">Recipient not found for this signing link.</span>}
                {currentRecipient && (
                  <div
                    key={currentRecipient.id}
                    className="flex items-center gap-2 rounded-full border px-2 py-1 text-xs relative"
                    style={{ borderColor: currentRecipient.color }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentRecipient.color }} />
                    <span className="font-medium text-gray-900 truncate">{currentRecipient.name} — </span>
                    {currentRecipient && (currentRecipient.isCC || currentRecipient.role === "viewer") && (
                      "You are a viewer for this document and will be notified upon completion."
                    )}

                    {currentRecipient && isGuidedEligible && pendingActiveGuidanceFields.length > 0 && (
                      `${pendingActiveGuidanceFields.length} of ${reviewTotal} field${pendingActiveGuidanceFields.length > 1 ? "s" : ""} remaining`
                    )}
                    {currentRecipient && isGuidedEligible && pendingActiveGuidanceFields.length === 0 && hasInvalidAssignedFields && (
                      `${invalidAssignedFields.length} field${invalidAssignedFields.length > 1 ? "s" : ""} need valid values`
                    )}
                    {currentRecipient && isGuidedEligible && pendingActiveGuidanceFields.length === 0 && !hasInvalidAssignedFields && (
                      isApprover
                        ? "All required fields are complete. You can approve this document."
                        : "All required fields are complete. You can finish signing."
                    )}
                    <div
                      className="h-full rounded-full transition-all absolute left-0"
                      style={{ width: `${progressPercent}%`, backgroundColor: currentRecipient.color + "20" }}
                    />
                  </div>
                )}

              </div>


              {isGuidedEligible && (
                <div className="mt-4 flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-between">

                    {!isTurnAllowed && !isActionComplete && !isRejected && (
                      <span className="text-amber-600">
                        Waiting for the previous signer to complete.
                      </span>
                    )}
                    {showNext && (
                      <Button size="sm"
                        title="Next"
                        onClick={focusNextGuidedField}
                        disabled={!canAdvance}
                      >
                        Next <ChevronRight size={16} />
                      </Button>
                    )}
                    {showReview && (
                      <Button size="sm"
                        label="Review"
                        inverted
                        onClick={() => startGuidedSigning(true)}
                        disabled={isSigned}
                        icon={<RotateCcwSquare size={16} />}
                      />
                    )}


                  <div className="flex min-h-6 flex-wrap items-center justify-center gap-2 text-center md:flex-1">
                    {!previewMode && !hasEsignConsent && !isActionComplete && !isRejected && (
                      <span className="inline-flex flex-wrap items-center justify-center gap-2 text-amber-700">
                        <span>Accept the electronic signature disclosure to continue.</span>
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          className="text-amber-700 hover:text-amber-800"
                          onClick={openConsentDisclosure}
                          label="Review disclosure"
                        />
                      </span>
                    )}
                    {isActionComplete && (
                      <span className="text-emerald-600">
                        ✓ You have {completionLabel} this document.
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-red-600">
                        You have rejected this document.
                      </span>
                    )}
                  </div>


                    {showReject && (
                      <Button size="sm"
                        onClick={() => handleSignOrApprove('rejected')}
                        className="bg-red-600 text-white hover:bg-red-700"
                        icon={<X size={12} />}
                        label="Reject"
                        title={!previewMode && !hasEsignConsent ? "Accept the disclosure before rejecting" : undefined}
                      />
                    )}
                    {showFinish && (
                      <Button size="sm"
                        label={finishLabel}
                        onClick={() => handleSignOrApprove(finishAction)}
                        disabled={previewMode || isSigned || !canFinish}
                        className="text-white hover:brightness-95"
                        style={
                          !isSigned && allRequiredFieldsFilled
                            ? { backgroundColor: recipientColor }
                            : undefined
                        }
                        icon={<Pin size={16} className="-rotate-45" />}
                        title={
                          previewMode
                            ? "Preview mode: finishing is disabled"
                            : !hasEsignConsent
                              ? "Accept the disclosure before finishing"
                            : manualReview && !reviewComplete
                              ? "Review all required fields before finishing"
                              : undefined
                        }
                      />
                    )}

                </div>
              )}
            </div>
          </div>
        )}
    </>
  );
};

export default SignPageClient;
