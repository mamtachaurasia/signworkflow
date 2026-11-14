import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createDocxBytes } from './helpers/office-upload-fixtures';

type TrialHandler = (
  req: NextRequest,
  context: unknown,
  authContext: { userId: string; orgId: string; orgRole: string }
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  documentFindOne: vi.fn(),
  documentFindOneAndUpdate: vi.fn(),
  documentUpdateOne: vi.fn(),
  convertOfficeDocumentToPdf: vi.fn(),
  userFindById: vi.fn(),
}));

vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: {
    findOne: mocks.documentFindOne,
    findOneAndUpdate: mocks.documentFindOneAndUpdate,
    updateOne: mocks.documentUpdateOne,
  },
}));
vi.mock('@/models/Users', () => ({
  __esModule: true,
  default: { findById: mocks.userFindById },
}));
vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, {
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    }),
}));
vi.mock('@/lib/document-sharing', () => ({
  buildDocumentWriteFilter: vi.fn((args: { extra?: Record<string, unknown> }) => args.extra || {}),
}));
vi.mock('@/lib/document-guards', () => ({ hasAnySignedRecipient: vi.fn(() => false) }));
vi.mock('@/lib/document-conversion', () => ({
  convertOfficeDocumentToPdf: mocks.convertOfficeDocumentToPdf,
}));

import { POST } from '@/app/api/documents/upload/route';

const DOCUMENT_ID = '507f1f77bcf86cd799439011';

function documentRecord() {
  return {
    _id: DOCUMENT_ID,
    userId: 'user-1',
    orgId: 'org-1',
    status: 'draft',
    currentVersion: 2,
    currentSessionId: 'session-1',
    documentName: 'Prepared agreement.pdf',
    versions: [{
      version: 2,
      label: 'prepared',
      locked: false,
      fields: [{ id: 'signature-1' }],
      editHistory: [],
    }],
    recipients: [],
    templatePreparation: {
      completed: true,
      fieldsNeedReview: true,
    },
  };
}

function request(options: { fieldsReviewed?: boolean; reviewedVersion?: number } = {}) {
  const body = new FormData();
  body.set('documentId', DOCUMENT_ID);
  body.set('documentName', 'Prepared agreement.pdf');
  body.set('isMetadataOnly', 'true');
  body.set('fields', JSON.stringify([]));
  body.set('recipients', JSON.stringify([]));
  if (options.fieldsReviewed) body.set('fieldsReviewed', 'true');
  if (options.reviewedVersion !== undefined) {
    body.set('reviewedVersion', String(options.reviewedVersion));
  }
  return new NextRequest('https://example.com/api/documents/upload', {
    method: 'POST',
    body,
  });
}

function uploadRequest(fileName: string, bytes: Uint8Array, type: string) {
  const body = new FormData();
  body.set('file', new Blob([bytes], { type }), fileName);
  return new NextRequest('https://example.com/api/documents/upload', {
    method: 'POST',
    body,
  });
}

describe('document field-review save acknowledgment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentFindOne.mockResolvedValue(documentRecord());
    mocks.documentFindOneAndUpdate.mockResolvedValue({
      ...documentRecord(),
      templatePreparation: { completed: true, fieldsNeedReview: false },
    });
    mocks.convertOfficeDocumentToPdf.mockReset();
  });

  it('clears review in the same field update when the reviewed version is exact', async () => {
    const response = await POST(request({ fieldsReviewed: true, reviewedVersion: 2 }), {});
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fieldsNeedReview).toBe(false);
    expect(payload.version).toBe(2);
    const [, update] = mocks.documentFindOneAndUpdate.mock.calls[0];
    expect(update[0].$set['templatePreparation.fieldsNeedReview']).toBe(false);
  });

  it('rejects a stale reviewedVersion without persisting fields or clearing review', async () => {
    const response = await POST(request({ fieldsReviewed: true, reviewedVersion: 1 }), {});
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe('DOCUMENT_FIELD_REVIEW_VERSION_MISMATCH');
    expect(mocks.documentFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.documentUpdateOne).not.toHaveBeenCalled();
  });

  it('does not clear review for an ordinary metadata save without acknowledgment', async () => {
    mocks.documentFindOneAndUpdate.mockResolvedValue(documentRecord());

    const response = await POST(request(), {});
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fieldsNeedReview).toBe(true);
    const [, update] = mocks.documentFindOneAndUpdate.mock.calls[0];
    expect(update[0].$set).not.toHaveProperty('templatePreparation.fieldsNeedReview');
  });

  it('rejects a DOCX that only has a ZIP signature before attempting conversion', async () => {
    const response = await POST(
      uploadRequest(
        'malformed.docx',
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ),
      {}
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe('Only PDF, DOC, or DOCX files can be uploaded for signing.');
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared multipart request before parsing it', async () => {
    const response = await POST(new NextRequest('https://example.com/api/documents/upload', {
      method: 'POST',
      headers: { 'content-length': String(27 * 1024 * 1024) },
    }), {});
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.message).toBe('File too large. Maximum upload size is 25MB.');
  });

  it('does not expose Word-converter internals to the browser', async () => {
    mocks.convertOfficeDocumentToPdf.mockRejectedValue(
      new Error('LibreOffice failed while reading /private/tmp/customer-agreement.docx')
    );

    const response = await POST(
      uploadRequest(
        'customer-agreement.docx',
        createDocxBytes(),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ),
      {}
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      message: 'Unable to convert this Word document to PDF. Please try another file.',
      code: 'DOCUMENT_CONVERSION_FAILED',
    });
    expect(JSON.stringify(payload)).not.toContain('/private/tmp');
  });
});
