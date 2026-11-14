// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode, useCallback, useMemo, useRef, useState } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useBuilderResourceReset,
  useDocumentBuilderPropHydration,
  useDocumentLoader,
  useTemplateEditorPropHydration,
} from '@/hooks/builder/useDocumentLoader';
import DroppedComponents from '@/components/builder/DroppedComponents';
import { useBuilderStore } from '@/hooks/useBuilderStore';
import { BuilderStoreProvider } from '@/store/builderStore';
import { mapFieldToDroppedComponent } from '@/utils/builder/documentFields';
import type { Doc, DocumentField, DroppedComponent, Recipient } from '@/types/types';

const TEMPLATE_ID = '507f1f77bcf86cd799439011';
const SECOND_TEMPLATE_ID = '507f191e810c19729de860ea';

const role = (id: string): Recipient => ({
  id,
  name: `Role ${id}`,
  email: '',
  role: 'signer',
  color: '#2563eb',
  order: 1,
  status: 'pending',
});

const field = (id: number, fieldId: string): DroppedComponent => ({
  id,
  fieldId,
  component: 'Text',
  x: 10,
  y: 20,
  width: 120,
  height: 40,
  pageNumber: 1,
  assignedRecipientId: 'signer',
  required: true,
});

const createLoaderCallbacks = () => ({
  setRecipients: vi.fn(),
  setSelectedFile: vi.fn(),
  setDocumentName: vi.fn(),
  setDocumentId: vi.fn(),
  setDocumentStatus: vi.fn(),
  setDocumentShareAccess: vi.fn(),
  setDocumentCreatedAt: vi.fn(),
  setDocumentUpdatedAt: vi.fn(),
  setDerivedFromDocumentId: vi.fn(),
  setDerivedFromVersion: vi.fn(),
  setSigningEvents: vi.fn(),
  setTemplateFieldsNeedReview: vi.fn(),
  setLoadedDocumentVersion: vi.fn(),
  setDroppedComponents: vi.fn(),
  resetHistory: vi.fn(),
  setElementId: vi.fn(),
  markSavedState: vi.fn(),
});

function TemplateHydrationHarness({
  resourceId,
  initialComponents,
  initialRecipients,
  resetHistory,
  markSavedState,
}: {
  resourceId: string;
  initialComponents: DroppedComponent[];
  initialRecipients: Recipient[];
  resetHistory: (components: DroppedComponent[]) => void;
  markSavedState: (state: {
    components: DroppedComponent[];
    name: string;
    recipients: Recipient[];
  }) => void;
}) {
  const [components, setComponents] = useState<DroppedComponent[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [nextElementId, setNextElementId] = useState(1);
  const applyLocalEdit = useCallback(() => {
    setComponents([field(99, 'local-edit')]);
  }, []);

  useTemplateEditorPropHydration({
    isTemplateEditor: true,
    resourceId,
    components: initialComponents,
    recipients: initialRecipients,
    nextElementId: Math.max(0, ...initialComponents.map((component) => component.id)) + 1,
    initialName: 'Saved Template',
    currentName: '',
    setDroppedComponents: setComponents,
    setRecipients,
    resetHistory,
    setElementId: setNextElementId,
    markSavedState,
  });

  return (
    <>
      <div data-testid="hydrated-fields">
        {components.map((component) => component.fieldId).join(',') || 'none'}
      </div>
      <div data-testid="hydrated-roles">
        {recipients.map((recipient) => recipient.id).join(',') || 'none'}
      </div>
      <div data-testid="next-element-id">{nextElementId}</div>
      <button type="button" onClick={applyLocalEdit}>Apply local edit</button>
    </>
  );
}

const agreementField: DocumentField = {
  id: 'agreement-signature',
  type: 'text',
  x: 70,
  y: 320,
  width: 120,
  height: 48,
  pageNumber: 1,
  recipientId: 'buyer-role',
  fieldOwner: 'recipients',
  required: true,
  pageRect: { x: 0, y: 32, width: 612, height: 792 },
};

const agreementRecipient: Recipient = {
  ...role('buyer-role'),
  name: 'Buyer',
};

function AgreementBuilderHydrationHarness() {
  const {
    droppedComponents,
    recipients,
    documentName,
    setDroppedComponents,
    setRecipients,
    setDocumentName,
    setDocumentId,
    setDocumentStatus,
    setDocumentShareAccess,
    setDocumentCreatedAt,
    setDocumentUpdatedAt,
    setDerivedFromDocumentId,
    setDerivedFromVersion,
    setSigningEvents,
    clearBuilderState,
  } = useBuilderStore();
  const [selectedFile, setSelectedFile] = useState<File | string | Doc | null>(null);
  const [, setFieldsNeedReview] = useState(false);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [nextElementId, setNextElementId] = useState(1);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const localEditRef = useRef(false);
  const initialFields = useMemo(() => [agreementField], []);
  const initialRecipients = useMemo(() => [agreementRecipient], []);
  const initialComponents = useMemo(() => {
    const usedIds = new Set<number>();
    return initialFields.map((item) => mapFieldToDroppedComponent(item, usedIds));
  }, [initialFields]);
  const resetHistory = useCallback((components: DroppedComponent[]) => {
    void components;
  }, []);
  const markSavedState = useCallback((state: {
    components: DroppedComponent[];
    name: string;
    recipients: Recipient[];
  }) => {
    void state;
  }, []);
  const shouldApplyRevalidatedState = useCallback(() => !localEditRef.current, []);

  useBuilderResourceReset({
    isTemplateEditor: false,
    resourceId: TEMPLATE_ID,
    reset: clearBuilderState,
  });

  useDocumentLoader({
    propDocumentId: TEMPLATE_ID,
    initialFields,
    initialRecipients,
    initialFileUrl: `/api/documents/${TEMPLATE_ID}`,
    initialDocumentName: 'Agreement from template',
    isSigningMode: false,
    isTemplateEditor: false,
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
    setTemplateFieldsNeedReview: setFieldsNeedReview,
    setLoadedDocumentVersion: setLoadedVersion,
    setDroppedComponents,
    resetHistory,
    setElementId: setNextElementId,
    markSavedState,
    shouldApplyRevalidatedState,
  });

  useDocumentBuilderPropHydration({
    isSigningMode: false,
    isTemplateEditor: false,
    resourceId: TEMPLATE_ID,
    hasInitialSnapshot: true,
    components: initialComponents,
    recipients: initialRecipients,
    nextElementId: 2,
    initialName: 'Agreement from template',
    currentName: documentName,
    setDroppedComponents,
    setRecipients,
    resetHistory,
    setElementId: setNextElementId,
    markSavedState,
  });

  return (
    <>
      <div data-testid="agreement-fields">
        {droppedComponents.map((item) => `${item.fieldId}:${item.assignedRecipientId}`).join(',') || 'none'}
      </div>
      <div data-testid="agreement-recipients">
        {recipients.map((item) => item.id).join(',') || 'none'}
      </div>
      <div data-testid="agreement-file">{typeof selectedFile === 'string' ? selectedFile : 'none'}</div>
      <div data-testid="agreement-next-id">{nextElementId}</div>
      <div data-testid="agreement-version">{loadedVersion ?? 'loading'}</div>
      <div data-testid="agreement-canvas">
        <DroppedComponents
          droppedComponents={droppedComponents}
          selectedFieldId={selectedFieldId}
          setSelectedFieldId={setSelectedFieldId}
          onSelectField={() => undefined}
          onAssignRecipient={() => undefined}
          onDuplicateField={() => undefined}
          onDeleteField={() => undefined}
          updateField={() => undefined}
          handleDragStop={() => undefined}
          handleResizeStop={() => undefined}
          textFieldRefs={{ current: {} }}
          zoom={1}
          recipients={recipients}
          onAddRecipients={() => undefined}
          onClickField={() => undefined}
          isSigningMode={false}
          isReadOnly={false}
          isSigned={false}
          currentRecipientId={undefined}
          guidedFieldId={null}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          localEditRef.current = true;
          setDroppedComponents([field(99, 'local-edit')]);
        }}
      >
        Edit agreement locally
      </button>
    </>
  );
}

describe('template field hydration ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the generic document loader out of template fields and roles', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const callbacks = createLoaderCallbacks();

    renderHook(() =>
      useDocumentLoader({
        propDocumentId: TEMPLATE_ID,
        initialFields: null,
        initialRecipients: [role('signer')],
        initialFileUrl: `/api/templates/${TEMPLATE_ID}`,
        initialDocumentName: 'Saved Template',
        isSigningMode: false,
        isTemplateEditor: true,
        ...callbacks,
      })
    );

    await waitFor(() => {
      expect(callbacks.setSelectedFile).toHaveBeenCalledWith(`/api/templates/${TEMPLATE_ID}`);
      expect(callbacks.setDocumentName).toHaveBeenCalledWith('Saved Template');
      expect(callbacks.setDocumentId).toHaveBeenCalledWith(TEMPLATE_ID);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(callbacks.setRecipients).not.toHaveBeenCalled();
    expect(callbacks.setDroppedComponents).not.toHaveBeenCalled();
    expect(callbacks.resetHistory).not.toHaveBeenCalled();
    expect(callbacks.setElementId).not.toHaveBeenCalled();
    expect(callbacks.markSavedState).not.toHaveBeenCalled();
  });

  it('hydrates the persisted field-review state and reviewed document version', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document: {
          documentId: TEMPLATE_ID,
          documentName: 'Prepared agreement',
          currentVersion: 4,
          status: 'draft',
          fields: [],
          recipients: [],
          templatePreparation: { fieldsNeedReview: true },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const callbacks = createLoaderCallbacks();

    renderHook(() =>
      useDocumentLoader({
        propDocumentId: TEMPLATE_ID,
        initialFields: null,
        initialRecipients: null,
        initialFileUrl: null,
        initialDocumentName: null,
        isSigningMode: false,
        isTemplateEditor: false,
        ...callbacks,
      })
    );

    await waitFor(() => {
      expect(callbacks.setTemplateFieldsNeedReview).toHaveBeenLastCalledWith(true);
      expect(callbacks.setLoadedDocumentVersion).toHaveBeenLastCalledWith(4);
    });
  });

  it('lets the Builder reject a stale field snapshot after variable preparation advances the version', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document: {
          documentId: TEMPLATE_ID,
          documentName: 'Prepared agreement',
          currentVersion: 1,
          status: 'draft',
          fields: [agreementField],
          recipients: [agreementRecipient],
          templatePreparation: { fieldsNeedReview: false },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const callbacks = createLoaderCallbacks();
    const shouldApplyRevalidatedState = vi.fn(({ currentVersion }: { currentVersion: number | null }) => currentVersion === null || currentVersion >= 2);

    renderHook(() =>
      useDocumentLoader({
        propDocumentId: TEMPLATE_ID,
        initialFields: null,
        initialRecipients: null,
        initialFileUrl: null,
        initialDocumentName: null,
        isSigningMode: false,
        isTemplateEditor: false,
        ...callbacks,
        shouldApplyRevalidatedState,
      })
    );

    await waitFor(() => {
      expect(shouldApplyRevalidatedState).toHaveBeenCalledWith({
        documentId: TEMPLATE_ID,
        currentVersion: 1,
      });
    });
    expect(callbacks.setDroppedComponents).not.toHaveBeenCalled();
    expect(callbacks.resetHistory).not.toHaveBeenCalled();
    expect(callbacks.setLoadedDocumentVersion).not.toHaveBeenCalledWith(1);
    expect(callbacks.setSelectedFile).not.toHaveBeenCalled();
  });

  it('shows SSR template fields in the agreement store immediately and keeps local edits during client revalidation', async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BuilderStoreProvider>
        <AgreementBuilderHydrationHarness />
      </BuilderStoreProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('agreement-fields')).toHaveTextContent(
        'agreement-signature:buyer-role'
      );
      expect(screen.getByTestId('agreement-recipients')).toHaveTextContent('buyer-role');
      expect(screen.getByTestId('agreement-next-id')).toHaveTextContent('2');
    });
    const renderedField = document.querySelector('[data-field-id="agreement-signature"]');
    expect(renderedField).toHaveAttribute('data-field-recipient-id', 'buyer-role');
    expect(renderedField).toHaveAttribute('data-field-page', '1');

    fireEvent.click(screen.getByRole('button', { name: 'Edit agreement locally' }));
    expect(screen.getByTestId('agreement-fields')).toHaveTextContent('local-edit:signer');

    await act(async () => {
      resolveFetch?.({
        ok: true,
        json: async () => ({
          document: {
            documentId: TEMPLATE_ID,
            documentName: 'Agreement from template',
            currentVersion: 1,
            status: 'draft',
            fields: [],
            recipients: [],
            templatePreparation: { fieldsNeedReview: false },
          },
        }),
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('agreement-fields')).toHaveTextContent('local-edit:signer');
    });
  });

  it('hydrates an initial builder snapshot even when it has no persisted resource id', async () => {
    const callbacks = createLoaderCallbacks();
    const components = [field(1, 'new-document-field')];
    const recipients = [role('signer')];

    const { rerender } = renderHook(() =>
      useDocumentBuilderPropHydration({
        isSigningMode: false,
        isTemplateEditor: false,
        resourceId: null,
        hasInitialSnapshot: true,
        components,
        recipients,
        nextElementId: 2,
        initialName: 'New agreement',
        currentName: '',
        setDroppedComponents: callbacks.setDroppedComponents,
        setRecipients: callbacks.setRecipients,
        resetHistory: callbacks.resetHistory,
        setElementId: callbacks.setElementId,
        markSavedState: callbacks.markSavedState,
      }),
    );

    await waitFor(() => {
      expect(callbacks.setDroppedComponents).toHaveBeenCalledWith(components);
      expect(callbacks.setRecipients).toHaveBeenCalledWith(recipients);
    });

    rerender();
    expect(callbacks.setDroppedComponents).toHaveBeenCalledTimes(1);
    expect(callbacks.resetHistory).toHaveBeenCalledTimes(1);
  });

  it('does not let an empty client revalidation clear server-rendered template fields or roles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document: {
          documentId: TEMPLATE_ID,
          documentName: 'Agreement from template',
          currentVersion: 1,
          status: 'draft',
          fields: [],
          recipients: [],
          templatePreparation: { fieldsNeedReview: false },
        },
      }),
    }));

    render(
      <BuilderStoreProvider>
        <AgreementBuilderHydrationHarness />
      </BuilderStoreProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('agreement-version')).toHaveTextContent('1');
      expect(screen.getByTestId('agreement-fields')).toHaveTextContent(
        'agreement-signature:buyer-role'
      );
      expect(screen.getByTestId('agreement-recipients')).toHaveTextContent('buyer-role');
    });
  });

  it('keeps hydrated agreement fields through React Strict Effects resource resets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    render(
      <StrictMode>
        <BuilderStoreProvider>
          <AgreementBuilderHydrationHarness />
        </BuilderStoreProvider>
      </StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('agreement-fields')).toHaveTextContent(
        'agreement-signature:buyer-role'
      );
      expect(screen.getByTestId('agreement-recipients')).toHaveTextContent('buyer-role');
    });
  });

  it('hydrates exact template props once, preserves local edits from stale same-template props, and resets for a new template', async () => {
    const firstFields = [field(7, 'persisted-field')];
    const firstRoles = [role('signer')];
    const resetHistory = vi.fn();
    const markSavedState = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <TemplateHydrationHarness
          resourceId={TEMPLATE_ID}
          initialComponents={firstFields}
          initialRecipients={firstRoles}
          resetHistory={resetHistory}
          markSavedState={markSavedState}
        />
      </StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hydrated-fields')).toHaveTextContent('persisted-field');
      expect(screen.getByTestId('hydrated-roles')).toHaveTextContent('signer');
      expect(screen.getByTestId('next-element-id')).toHaveTextContent('8');
    });
    expect(resetHistory).toHaveBeenCalledTimes(1);
    expect(markSavedState).toHaveBeenCalledTimes(1);
    expect(markSavedState).toHaveBeenCalledWith({
      components: firstFields,
      name: 'Saved Template',
      recipients: firstRoles,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply local edit' }));
    expect(screen.getByTestId('hydrated-fields')).toHaveTextContent('local-edit');

    rerender(
      <StrictMode>
        <TemplateHydrationHarness
          resourceId={TEMPLATE_ID}
          initialComponents={[]}
          initialRecipients={[]}
          resetHistory={resetHistory}
          markSavedState={markSavedState}
        />
      </StrictMode>
    );

    expect(screen.getByTestId('hydrated-fields')).toHaveTextContent('local-edit');
    expect(screen.getByTestId('hydrated-roles')).toHaveTextContent('signer');
    expect(resetHistory).toHaveBeenCalledTimes(1);

    rerender(
      <StrictMode>
        <TemplateHydrationHarness
          resourceId={SECOND_TEMPLATE_ID}
          initialComponents={[]}
          initialRecipients={[]}
          resetHistory={resetHistory}
          markSavedState={markSavedState}
        />
      </StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hydrated-fields')).toHaveTextContent('none');
      expect(screen.getByTestId('hydrated-roles')).toHaveTextContent('none');
      expect(screen.getByTestId('next-element-id')).toHaveTextContent('1');
    });
    expect(resetHistory).toHaveBeenCalledTimes(2);
  });

  it('keeps only actionable field-placement guidance in the template workspace', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/builder/DocumentEditor.tsx'),
      'utf8'
    );

    expect(source).not.toContain('Template roles and fields:');
    expect(source).toContain('Field placement needs review:');
    expect(source).toContain('Existing signing fields were preserved.');
  });
});
