"use client";
import { useEffect, useRef } from 'react';
import { Doc, DocumentField, DroppedComponent, IDocument, Recipient } from '@/types/types';
import { dedupeFieldsById, mapFieldToDroppedComponent, normalizeComponentSettings } from '@/utils/builder/documentFields';
import { buildDraftKey } from '@/utils/builder/documentDraft';
import { clearInMemoryAccessToken, getInMemoryAccessToken } from '@/lib/accessTokenStore';
import { getDocumentBuilderAccessDeniedHref } from '@/lib/template-navigation';

interface UseDocumentLoaderArgs {
  propDocumentId: string | null;
  initialFields: DocumentField[] | null;
  initialRecipients: Recipient[] | null;
  initialFileUrl: string | null;
  initialDocumentName: string | null;
  isSigningMode: boolean;
  isTemplateEditor?: boolean;
  setRecipients: React.Dispatch<React.SetStateAction<Recipient[]>>;
  setSelectedFile: (value: File | string | Doc | null) => void;
  setDocumentName: React.Dispatch<React.SetStateAction<string>>;
  setDocumentId: React.Dispatch<React.SetStateAction<string | null>>;
  setDocumentStatus: React.Dispatch<React.SetStateAction<string | null>>;
  setDocumentShareAccess: React.Dispatch<React.SetStateAction<'can_view' | 'can_send' | 'can_edit' | null>>;
  setDocumentCreatedAt: React.Dispatch<React.SetStateAction<string | null>>;
  setDocumentUpdatedAt: React.Dispatch<React.SetStateAction<string | null>>;
  setDerivedFromDocumentId: React.Dispatch<React.SetStateAction<string | null>>;
  setDerivedFromVersion: React.Dispatch<React.SetStateAction<number | null>>;
  setSigningEvents: React.Dispatch<React.SetStateAction<NonNullable<IDocument['signingEvents']>>>;
  setTemplateFieldsNeedReview: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadedDocumentVersion: React.Dispatch<React.SetStateAction<number | null>>;
  setDroppedComponents: React.Dispatch<React.SetStateAction<DroppedComponent[]>>;
  resetHistory: (newState: DroppedComponent[]) => void;
  setElementId: React.Dispatch<React.SetStateAction<number>>;
  markSavedState: (state: { components: DroppedComponent[]; name: string; recipients: Recipient[] }) => void;
  shouldApplyRevalidatedState?: (snapshot: {
    documentId: string | null;
    currentVersion: number | null;
  }) => boolean;
}

const mergeDraftFieldWithServerField = (
  serverField: DroppedComponent,
  draftField: DroppedComponent
): DroppedComponent => {
  const mergedSettings = serverField.settings || draftField.settings
    ? {
      ...(serverField.settings || {}),
      ...(draftField.settings || {}),
    }
    : undefined;

  const draftInputType = String(draftField.settings?.inputType || '').toLowerCase();
  const draftValidationKind = String(draftField.settings?.validationKind || '').toLowerCase();
  const draftCarriesEmailSemantics = draftInputType === 'email' || draftValidationKind === 'email';

  const component =
    serverField.component === 'Email' &&
    draftField.component === 'Text' &&
    !draftCarriesEmailSemantics
      ? 'Email'
      : (draftField.component || serverField.component);

  const nextData = serverField.data && !draftField.data ? serverField.data : draftField.data;

  return {
    ...serverField,
    ...draftField,
    component,
    data: nextData,
    settings: normalizeComponentSettings(component, mergedSettings),
  };
};

const parseTimestamp = (value: unknown): number | null => {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : null;
};

interface UseTemplateEditorPropHydrationArgs {
  isTemplateEditor: boolean;
  resourceId: string | null;
  components: DroppedComponent[];
  recipients: Recipient[];
  nextElementId: number;
  initialName: string | null;
  currentName: string;
  setDroppedComponents: React.Dispatch<React.SetStateAction<DroppedComponent[]>>;
  setRecipients: React.Dispatch<React.SetStateAction<Recipient[]>>;
  resetHistory: (newState: DroppedComponent[]) => void;
  setElementId: React.Dispatch<React.SetStateAction<number>>;
  markSavedState: (state: { components: DroppedComponent[]; name: string; recipients: Recipient[] }) => void;
}

interface UseDocumentBuilderPropHydrationArgs {
  isSigningMode: boolean;
  isTemplateEditor: boolean;
  resourceId: string | null;
  hasInitialSnapshot: boolean;
  components: DroppedComponent[];
  recipients: Recipient[];
  nextElementId: number;
  initialName: string | null;
  currentName: string;
  setDroppedComponents: React.Dispatch<React.SetStateAction<DroppedComponent[]>>;
  setRecipients: React.Dispatch<React.SetStateAction<Recipient[]>>;
  resetHistory: (newState: DroppedComponent[]) => void;
  setElementId: React.Dispatch<React.SetStateAction<number>>;
  markSavedState: (state: { components: DroppedComponent[]; name: string; recipients: Recipient[] }) => void;
}

interface UseBuilderResourceResetArgs {
  isTemplateEditor: boolean;
  resourceId: string | null;
  reset: () => void;
}

/**
 * Clears a reused Builder store once per resource. React Strict Effects runs
 * mount effects twice in development; guarding by resource prevents the second
 * reset from erasing fields that the hydration effect just installed.
 */
export const useBuilderResourceReset = ({
  isTemplateEditor,
  resourceId,
  reset,
}: UseBuilderResourceResetArgs) => {
  const resetResourceKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isTemplateEditor) return;
    const resourceKey = resourceId ? `document:${resourceId}` : 'document:new';
    if (resetResourceKeyRef.current === resourceKey) return;
    resetResourceKeyRef.current = resourceKey;
    reset();
  }, [isTemplateEditor, reset, resourceId]);
};

/**
 * Applies the template snapshot supplied by TemplateBuilderShell exactly once per
 * template resource. Same-resource prop churn must not overwrite local edits.
 */
export const useTemplateEditorPropHydration = ({
  isTemplateEditor,
  resourceId,
  components,
  recipients,
  nextElementId,
  initialName,
  currentName,
  setDroppedComponents,
  setRecipients,
  resetHistory,
  setElementId,
  markSavedState,
}: UseTemplateEditorPropHydrationArgs) => {
  const hydratedResourceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTemplateEditor || !resourceId) {
      hydratedResourceIdRef.current = null;
      return;
    }
    if (hydratedResourceIdRef.current === resourceId) return;

    setDroppedComponents(components);
    setRecipients(recipients);
    resetHistory(components);
    setElementId(nextElementId);

    const baselineName = (initialName ?? currentName).trim();
    if (baselineName) {
      markSavedState({
        components,
        name: baselineName,
        recipients,
      });
    }

    hydratedResourceIdRef.current = resourceId;
  }, [
    components,
    currentName,
    initialName,
    isTemplateEditor,
    markSavedState,
    nextElementId,
    recipients,
    resetHistory,
    resourceId,
    setDroppedComponents,
    setElementId,
    setRecipients,
  ]);
};

/**
 * Hydrates the agreement Builder from the server-rendered document snapshot.
 * The document page already fetched this data, so fields should be visible on
 * first paint instead of depending on a second client request. Client loading
 * still refreshes the snapshot and the once-per-resource guard prevents prop
 * churn from overwriting local edits.
 */
export const useDocumentBuilderPropHydration = ({
  isSigningMode,
  isTemplateEditor,
  resourceId,
  hasInitialSnapshot,
  components,
  recipients,
  nextElementId,
  initialName,
  currentName,
  setDroppedComponents,
  setRecipients,
  resetHistory,
  setElementId,
  markSavedState,
}: UseDocumentBuilderPropHydrationArgs) => {
  const hydratedResourceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isSigningMode || isTemplateEditor || !hasInitialSnapshot) {
      hydratedResourceIdRef.current = null;
      return;
    }
    const hydrationKey = resourceId ? `document:${resourceId}` : 'document:initial-snapshot';
    if (hydratedResourceIdRef.current === hydrationKey) return;

    setDroppedComponents(components);
    setRecipients(recipients);
    resetHistory(components);
    setElementId(nextElementId);

    const baselineName = (initialName ?? currentName).trim();
    if (baselineName) {
      markSavedState({
        components,
        name: baselineName,
        recipients,
      });
    }

    hydratedResourceIdRef.current = hydrationKey;
  }, [
    components,
    currentName,
    hasInitialSnapshot,
    initialName,
    isSigningMode,
    isTemplateEditor,
    markSavedState,
    nextElementId,
    recipients,
    resetHistory,
    resourceId,
    setDroppedComponents,
    setElementId,
    setRecipients,
  ]);
};

export const useDocumentLoader = ({
  propDocumentId,
  initialFields,
  initialRecipients,
  initialFileUrl,
  initialDocumentName,
  isSigningMode,
  isTemplateEditor = false,
  setRecipients,
  setSelectedFile,
  setDocumentName,
  setDocumentId,
  setDocumentStatus,
  setDocumentShareAccess,
  setDocumentCreatedAt,
  setDocumentUpdatedAt,
  setDerivedFromDocumentId,
  setDerivedFromVersion,
  setSigningEvents,
  setTemplateFieldsNeedReview,
  setLoadedDocumentVersion,
  setDroppedComponents,
  resetHistory,
  setElementId,
  markSavedState,
  shouldApplyRevalidatedState,
}: UseDocumentLoaderArgs) => {
  useEffect(() => {
    if (!isTemplateEditor && initialRecipients && Array.isArray(initialRecipients) && initialRecipients.length) {
      setRecipients(initialRecipients);
    }
    if (initialFileUrl) {
      setSelectedFile(initialFileUrl);
    }
    if (initialDocumentName) setDocumentName(initialDocumentName);
    if (propDocumentId) setDocumentId(propDocumentId);
  }, [
    propDocumentId,
    initialFileUrl,
    initialDocumentName,
    initialRecipients,
    isTemplateEditor,
    setSelectedFile,
    setDocumentName,
    setDocumentId,
    setRecipients,
  ]);

  useEffect(() => {
    if (isSigningMode || isTemplateEditor) {
      setTemplateFieldsNeedReview(false);
      setLoadedDocumentVersion(null);
      return;
    }

    setTemplateFieldsNeedReview(false);
    setLoadedDocumentVersion(null);

    const currentDocId = propDocumentId || (typeof window !== 'undefined' ? localStorage.getItem('currentDocumentId') : null);
    if (!currentDocId) return;
    const abortController = new AbortController();
    const loginRedirectPath =
      typeof window !== 'undefined'
        ? `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`
        : '/login';

    const loadDocument = async () => {
      try {
        if (!/^[a-f\d]{24}$/i.test(currentDocId)) {
          if (typeof window !== 'undefined') {
            window.location.replace('/404');
          }
          return;
        }

        const headers: Record<string, string> = {};
        const token = getInMemoryAccessToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const guestIdFromQuery =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('guestId')
            : null;
        const shareTokenFromQuery =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('shareToken')
            : null;
        const guestIdFromStorage =
          typeof window !== 'undefined'
            ? localStorage.getItem('guest_session_id')
            : null;
        const safeGuestIdFromQuery =
          typeof guestIdFromQuery === 'string' && guestIdFromQuery.startsWith('guest_')
            ? guestIdFromQuery
            : null;
        const safeGuestIdFromStorage =
          typeof guestIdFromStorage === 'string' && guestIdFromStorage.startsWith('guest_')
            ? guestIdFromStorage
            : null;

        const fetchDocument = async (guestId: string | null) => {
          const loadUrl = new URL('/api/documents/load', window.location.origin);
          loadUrl.searchParams.set('id', currentDocId);
          if (guestId) {
            loadUrl.searchParams.set('guestId', guestId);
          }
          if (shareTokenFromQuery) {
            loadUrl.searchParams.set('shareToken', shareTokenFromQuery);
          }
          return fetch(`${loadUrl.pathname}${loadUrl.search}`, {
            cache: 'no-store',
            credentials: 'include',
            headers,
            signal: abortController.signal,
          });
        };

        let response = await fetchDocument(null);
        let resolvedGuestId: string | null = null;

        if (!response.ok) {
          const fallbackGuestIds = [safeGuestIdFromQuery, safeGuestIdFromStorage].filter(
            (value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index
          );

          for (const guestId of fallbackGuestIds) {
            response = await fetchDocument(guestId);
            if (response.ok) {
              resolvedGuestId = guestId;
              break;
            }
          }
        }

        if (!response.ok) {
          if (response.status === 404) {
            if (typeof window !== 'undefined') {
              window.location.replace('/404');
            }
            return;
          }
          if (response.status === 401) {
            if (typeof window !== 'undefined') {
              clearInMemoryAccessToken();
              window.location.replace(loginRedirectPath);
            }
            return;
          }
          if (response.status === 403) {
            if (typeof window !== 'undefined') {
              window.location.replace(
                getDocumentBuilderAccessDeniedHref(new URLSearchParams(window.location.search))
              );
            }
            return;
          }
          throw new Error(`Failed to fetch document (${response.status})`);
        }

        if (resolvedGuestId && typeof window !== 'undefined') {
          localStorage.setItem('guest_session_id', resolvedGuestId);
        }

        const data = await response.json();
        const doc = data.document;
        const revalidationSnapshot = {
          documentId: typeof doc?.documentId === 'string' ? doc.documentId : currentDocId,
          currentVersion: typeof doc?.currentVersion === 'number' ? doc.currentVersion : null,
        };
        // Do this before changing any UI state. A variable-apply response can
        // advance the prepared version while this initial loader request is in
        // flight; that older snapshot must not restore its PDF, review flag,
        // recipients, or fields.
        const shouldApplySnapshot = shouldApplyRevalidatedState?.(revalidationSnapshot) !== false;

        if (shouldApplySnapshot) {
          setDocumentStatus(doc?.status ?? null);
          setDocumentShareAccess(
            doc?.shareAccess === 'can_view' || doc?.shareAccess === 'can_send' || doc?.shareAccess === 'can_edit'
              ? doc.shareAccess
              : null
          );
          setDocumentCreatedAt(typeof doc?.createdAt === 'string' ? doc.createdAt : null);
          setDocumentUpdatedAt(typeof doc?.updatedAt === 'string' ? doc.updatedAt : null);
          setDerivedFromDocumentId(doc?.derivedFromDocumentId ?? null);
          setDerivedFromVersion(
            typeof doc?.derivedFromVersion === 'number' ? doc.derivedFromVersion : null
          );
          setTemplateFieldsNeedReview(
            doc?.templatePreparation?.fieldsNeedReview === true
          );
          setLoadedDocumentVersion(revalidationSnapshot.currentVersion);
          setSigningEvents(Array.isArray(doc?.signingEvents) ? doc.signingEvents : []);
        }

        const usedIds = new Set<number>();
        const revalidatedSourceFields = dedupeFieldsById(
          Array.isArray(doc?.fields) ? doc.fields : []
        );
        const initialSourceFields = dedupeFieldsById(
          Array.isArray(initialFields) ? initialFields : []
        );
        // The SSR document snapshot comes from this same latest prepared
        // version. Do not let an empty/transient client revalidation erase
        // fields that were already supplied to the Builder page.
        const serverSourceFields =
          revalidatedSourceFields.length > 0 || initialSourceFields.length === 0
            ? revalidatedSourceFields
            : initialSourceFields;
        const serverFields: DroppedComponent[] = serverSourceFields.map((field: DocumentField) =>
          mapFieldToDroppedComponent(field, usedIds)
        );

        const draftStorageKey = buildDraftKey(currentDocId);
        const rawDraft = typeof window !== 'undefined'
          ? sessionStorage.getItem(draftStorageKey)
          : null;
        let shouldApplyDraft = false;
        let draftFields: DroppedComponent[] = [];

        if (rawDraft) {
          try {
            const parsedDraft = JSON.parse(rawDraft) as { fields?: DocumentField[]; updatedAt?: string };
            const draftUpdatedAt = parseTimestamp(parsedDraft?.updatedAt);
            const serverUpdatedAt = parseTimestamp(doc?.updatedAt);
            shouldApplyDraft =
              draftUpdatedAt !== null &&
              serverUpdatedAt !== null &&
              draftUpdatedAt > serverUpdatedAt;

            if (shouldApplyDraft) {
              draftFields = dedupeFieldsById(Array.isArray(parsedDraft?.fields) ? parsedDraft.fields : []).map(
                (field: DocumentField) => mapFieldToDroppedComponent(field, usedIds)
              );
            } else if (typeof window !== 'undefined') {
              sessionStorage.removeItem(draftStorageKey);
            }
          } catch {
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem(draftStorageKey);
            }
          }
        }

        const restoredFields = [...serverFields];
        if (shouldApplyDraft) {
          draftFields.forEach(draftField => {
            const index = restoredFields.findIndex(serverField => {
              if (draftField.fieldId && serverField.fieldId) {
                return serverField.fieldId === draftField.fieldId;
              }
              return serverField.id === draftField.id;
            });
            if (index !== -1) {
              const serverField = restoredFields[index];
              restoredFields[index] = mergeDraftFieldWithServerField(serverField, draftField);
            } else {
              restoredFields.push({
                ...draftField,
                settings: normalizeComponentSettings(draftField.component, draftField.settings),
              });
            }
          });
        }

        const nextDocumentName = doc?.documentName || doc?.originalFileName || '';
        const revalidatedRecipients = Array.isArray(doc?.recipients) ? doc.recipients : [];
        const initialSnapshotRecipients = Array.isArray(initialRecipients) ? initialRecipients : [];
        const resolvedRecipients =
          revalidatedRecipients.length > 0 || initialSnapshotRecipients.length === 0
            ? revalidatedRecipients
            : initialSnapshotRecipients;

        // A user can start editing the server-rendered snapshot while this GET
        // is in flight. Refresh metadata/file access, but never replace those
        // local fields or roles once the editor has become dirty.
        if (shouldApplySnapshot) {
          setDroppedComponents(restoredFields);
          setRecipients(resolvedRecipients);
          setDocumentName(nextDocumentName);
          const maxId = Math.max(0, ...restoredFields.map(c => c.id));
          setElementId(maxId + 1);
          resetHistory(restoredFields);

          markSavedState({
            components: restoredFields,
            name: nextDocumentName,
            recipients: resolvedRecipients,
          });
        }

        if (shouldApplySnapshot && doc?.documentId) {
          const fileParams = new URLSearchParams();
          if (resolvedGuestId) {
            fileParams.set('guestId', resolvedGuestId);
          }
          if (shareTokenFromQuery) {
            fileParams.set('shareToken', shareTokenFromQuery);
          }
          const fileUrl = `/api/documents/${encodeURIComponent(doc.documentId)}${
            fileParams.toString() ? `?${fileParams.toString()}` : ''
          }`;
          setSelectedFile(fileUrl);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Failed to load document:', err);
        setSelectedFile(null);
      }
    };

    void loadDocument();
    return () => abortController.abort();
  }, [
    propDocumentId,
    initialFields,
    initialRecipients,
    initialFileUrl,
    isSigningMode,
    isTemplateEditor,
    setSelectedFile,
    setDocumentStatus,
    setDocumentShareAccess,
    setDocumentCreatedAt,
    setDocumentUpdatedAt,
    setDerivedFromDocumentId,
    setDerivedFromVersion,
    setTemplateFieldsNeedReview,
    setLoadedDocumentVersion,
    setSigningEvents,
    setDroppedComponents,
    setRecipients,
    setDocumentName,
    resetHistory,
    setElementId,
    markSavedState,
    shouldApplyRevalidatedState,
  ]);
};
