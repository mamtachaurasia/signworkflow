// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadToServer } from '@/lib/api';

const DOCUMENT_ID = '507f1f77bcf86cd799439011';

function fetchResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe('uploadToServer field-review contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends the explicit acknowledgment with the exact reviewed version', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fetchResponse({ document: { recipients: [] } }))
      .mockResolvedValueOnce(fetchResponse({
        documentId: DOCUMENT_ID,
        documentName: 'Agreement.pdf',
        version: 5,
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadToServer(
      null,
      'Agreement.pdf',
      1,
      [],
      [],
      DOCUMENT_ID,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      'session-1',
      undefined,
      true,
      { fieldsReviewed: true, reviewedVersion: 4 }
    );

    const uploadRequest = fetchMock.mock.calls[1][1] as RequestInit;
    const body = uploadRequest.body as FormData;
    expect(body.get('fieldsReviewed')).toBe('true');
    expect(body.get('reviewedVersion')).toBe('4');
    expect(body.get('fields')).toBe('[]');
    expect(result?.version).toBe(5);
  });

  it('omits review acknowledgment from ordinary metadata saves', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fetchResponse({ document: { recipients: [] } }))
      .mockResolvedValueOnce(fetchResponse({ documentId: DOCUMENT_ID }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadToServer(
      null,
      'Agreement.pdf',
      1,
      [],
      [],
      DOCUMENT_ID,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      'session-1',
      undefined,
      true
    );

    const uploadRequest = fetchMock.mock.calls[1][1] as RequestInit;
    const body = uploadRequest.body as FormData;
    expect(body.has('fieldsReviewed')).toBe(false);
    expect(body.has('reviewedVersion')).toBe(false);
  });

  it('replaces title delimiters before sending the document name payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fetchResponse({ document: { recipients: [] } }))
      .mockResolvedValueOnce(fetchResponse({ documentId: DOCUMENT_ID }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadToServer(
      null,
      'Vendor | Services.pdf',
      1,
      [],
      [],
      DOCUMENT_ID,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      'session-1',
      undefined,
      true
    );

    const uploadRequest = fetchMock.mock.calls[1][1] as RequestInit;
    const body = uploadRequest.body as FormData;
    expect(body.get('documentName')).toBe('Vendor - Services.pdf');
  });
});
