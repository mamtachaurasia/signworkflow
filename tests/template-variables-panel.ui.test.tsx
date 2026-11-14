// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  onStatusChange: vi.fn(),
  onValuesApplied: vi.fn(),
  getCurrentFields: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

import TemplateVariablesPanel from '@/components/builder/TemplateVariablesPanel';
import type { DocumentField } from '@/types/types';

const documentId = '507f1f77bcf86cd799439011';
const liveField: DocumentField = {
  id: 'live-signature',
  type: 'signature',
  x: 88,
  y: 344,
  width: 200,
  height: 48,
  pageNumber: 2,
  recipientId: 'client-signer',
  required: true,
  fieldOwner: 'recipients',
  pageRect: { width: 612, height: 792 },
};

function installFetchMock() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          complete: true,
          values: { company: 'New Co' },
          excludedVariableKeys: [],
          fields: [liveField],
          recipients: [],
          fieldsNeedReview: true,
          requiresFieldReview: true,
          preparedVersion: 2,
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({
        values: { company: 'Old Co' },
        excludedVariableKeys: [],
        template: {
          editableContent: {
            variables: [{ key: 'company', label: 'Company', defaultValue: '', required: true }],
          },
        },
      }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function installScratchDocumentFetchMock() {
  const scratchContent = {
    version: 1,
    blocks: [{
      id: 'body',
      type: 'paragraph',
      text: '{{seller_name}} agrees to sell the property.',
      html: '<p>{{seller_name}} agrees to sell the property.</p>',
      align: 'left',
    }],
    variables: [{ key: 'seller_name', label: 'Seller name', defaultValue: '', required: true }],
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/prepare-template')) {
      return { ok: false, status: 404, json: async () => ({ message: 'This document was not created from a template' }) };
    }
    if (init?.method === 'PUT') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          preparedVersion: 4,
          fields: [liveField],
          document: {
            currentVersion: 4,
            fieldsNeedReview: true,
            editableContent: {
              ...scratchContent,
              variables: [{ ...scratchContent.variables[0], defaultValue: 'Aarav Sharma' }],
            },
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ document: { currentVersion: 3, editableContent: scratchContent } }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TemplateVariablesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentFields.mockReturnValue([liveField]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('persists the live Builder fields and hands the regenerated snapshot back without reloading', async () => {
    const fetchMock = installFetchMock();
    render(
      <TemplateVariablesPanel
        documentId={documentId}
        open
        onOpenChange={vi.fn()}
        onStatusChange={mocks.onStatusChange}
        getCurrentFields={mocks.getCurrentFields}
        onValuesApplied={mocks.onValuesApplied}
      />
    );

    const companyInput = await screen.findByDisplayValue('Old Co');
    fireEvent.change(companyInput, { target: { value: 'New Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply values' }));

    await waitFor(() => expect(mocks.onValuesApplied).toHaveBeenCalledWith({
      fields: [liveField],
      recipients: [],
      fieldsNeedReview: true,
      preparedVersion: 2,
    }));

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual(expect.objectContaining({
      variableValues: { company: 'New Co' },
      fields: [liveField],
    }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Values applied. Existing signing fields were preserved; review their placement and save before sending.'
    );
  });

  it('loads and applies Smart-variable values from an authored scratch document', async () => {
    const fetchMock = installScratchDocumentFetchMock();
    render(
      <TemplateVariablesPanel
        documentId={documentId}
        open
        onOpenChange={vi.fn()}
        onStatusChange={mocks.onStatusChange}
        getCurrentFields={mocks.getCurrentFields}
        onValuesApplied={mocks.onValuesApplied}
      />
    );

    const sellerInput = await screen.findByLabelText(/Seller name/);
    expect(screen.queryByRole('button', { name: 'Remove Seller name' })).not.toBeInTheDocument();
    fireEvent.change(sellerInput, { target: { value: 'Aarav Sharma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply values' }));

    await waitFor(() => expect(mocks.onValuesApplied).toHaveBeenCalledWith({
      fields: [liveField],
      recipients: [],
      fieldsNeedReview: true,
      preparedVersion: 4,
    }));

    const contentPut = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith('/content') && init?.method === 'PUT'
    );
    expect(contentPut).toBeDefined();
    expect(JSON.parse(String(contentPut?.[1]?.body))).toEqual(expect.objectContaining({
      baseVersion: 3,
      fields: [liveField],
      editableContent: expect.objectContaining({
        variables: [expect.objectContaining({ key: 'seller_name', defaultValue: 'Aarav Sharma' })],
      }),
    }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Values applied. Review the signing field placement and save before sending.'
    );
  });
});
