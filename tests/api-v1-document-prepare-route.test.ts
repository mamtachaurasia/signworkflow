import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getApiKeyContext: vi.fn(),
  getApiRateLimitResponse: vi.fn(),
  getTrialWriteAccessDeniedResponse: vi.fn(),
  documentFindOne: vi.fn(),
  documentUpdateOne: vi.fn(),
  copyObject: vi.fn(),
  deleteObject: vi.fn(),
  getObjectStream: vi.fn(),
  streamToBuffer: vi.fn(),
  pdfLoad: vi.fn(),
  pdfCreate: vi.fn(),
  writeAuditEvent: vi.fn(),
  connectDB: vi.fn(),
}));

vi.mock('@/lib/api-key', () => ({
  getApiKeyContext: mocks.getApiKeyContext,
  getApiRateLimitResponse: mocks.getApiRateLimitResponse,
}));
vi.mock('@/lib/trial-access', () => ({
  getTrialWriteAccessDeniedResponse: mocks.getTrialWriteAccessDeniedResponse,
}));
vi.mock('@/lib/s3', () => ({
  copyObject: mocks.copyObject,
  deleteObject: mocks.deleteObject,
  getObjectStream: mocks.getObjectStream,
  streamToBuffer: mocks.streamToBuffer,
  getRegion: vi.fn(() => 'us-east-1'),
  getStorageBucketName: vi.fn(() => 'documents'),
  normalizeStorageProvider: vi.fn(() => 's3'),
}));
vi.mock('pdf-lib', () => ({ PDFDocument: { load: mocks.pdfLoad, create: mocks.pdfCreate } }));
vi.mock('@/lib/audit', () => ({ writeAuditEvent: mocks.writeAuditEvent }));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/models/Document', () => ({
  default: { findOne: mocks.documentFindOne, updateOne: mocks.documentUpdateOne },
}));

import { PUT } from '@/app/api/v1/documents/[documentId]/prepare/route';

const DOCUMENT_ID = '507f1f77bcf86cd799439011';

function request(fields: unknown[]) {
  return new NextRequest(`https://signworkflow.com/api/v1/documents/${DOCUMENT_ID}/prepare`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

function draftDocument() {
  return {
    _id: DOCUMENT_ID,
    orgId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439013',
    documentName: 'Supplier agreement',
    currentVersion: 0,
    status: 'draft',
    deletedAt: null,
    versions: [{
      version: 0,
      label: 'original',
      storage: { provider: 's3', bucket: 'documents', key: 'original.pdf', region: 'us-east-1' },
      hash: 'hash',
      hashAlgo: 'SHA-256',
      size: 1234,
      mimeType: 'application/pdf',
    }],
    markModified: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    updatedAt: new Date(),
  };
}

describe('public document preparation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiKeyContext.mockResolvedValue({
      keyId: 'key-1',
      orgId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439013',
      scopes: ['documents:write'],
      rateLimit: { allowed: true },
    });
    mocks.getApiRateLimitResponse.mockReturnValue(null);
    mocks.getTrialWriteAccessDeniedResponse.mockResolvedValue(null);
    mocks.copyObject.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.getObjectStream.mockResolvedValue({});
    mocks.streamToBuffer.mockResolvedValue(Buffer.from('pdf'));
    mocks.pdfLoad.mockResolvedValue({ getPageCount: () => 1 });
    mocks.pdfCreate.mockResolvedValue({
      embedPng: vi.fn().mockResolvedValue(undefined),
      embedJpg: vi.fn().mockResolvedValue(undefined),
    });
    mocks.documentUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.writeAuditEvent.mockResolvedValue(undefined);
    mocks.connectDB.mockResolvedValue(undefined);
  });

  it('copies the source PDF and saves a prepared field version', async () => {
    const document = draftDocument();
    mocks.documentFindOne.mockResolvedValue(document);

    const res = await PUT(request([{
      id: 'signature-1',
      type: 'signature',
      x: 72,
      y: 620,
      width: 180,
      height: 54,
      pageNumber: 1,
      recipientId: 'signer-1',
      fieldOwner: 'recipients',
      required: true,
    }]), { params: Promise.resolve({ documentId: DOCUMENT_ID }) });

    expect(res.status).toBe(200);
    expect(mocks.copyObject).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: 'original.pdf',
      destinationKey: expect.stringContaining('/prepared_1.pdf'),
    }));
    expect(document.currentVersion).toBe(1);
    expect(document.versions).toHaveLength(2);
    expect(document.versions[1]).toEqual(expect.objectContaining({
      label: 'prepared',
      fields: [expect.objectContaining({ id: 'signature-1', recipientId: 'signer-1' })],
    }));
    expect(mocks.documentUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: DOCUMENT_ID,
        status: { $in: ['draft', 'saved'] },
        currentVersion: 0,
        updatedAt: expect.any(Date),
        $or: expect.arrayContaining([
          { sendDispatch: { $exists: false } },
          { 'sendDispatch.status': 'failed' },
        ]),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ currentVersion: 1, versions: document.versions }),
      })
    );
    expect(document.save).not.toHaveBeenCalled();
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'document_prepared',
      documentId: DOCUMENT_ID,
    }));
  });

  it('requires recipient IDs on recipient-owned fields before touching storage', async () => {
    const res = await PUT(request([{
      id: 'signature-1',
      type: 'signature',
      x: 10,
      y: 10,
      width: 100,
      height: 40,
      fieldOwner: 'recipients',
    }]), { params: Promise.resolve({ documentId: DOCUMENT_ID }) });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'recipient_id_required' });
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
    expect(mocks.copyObject).not.toHaveBeenCalled();
  });

  it('rejects fields that reference pages outside the stored PDF', async () => {
    const document = draftDocument();
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.pdfLoad.mockResolvedValue({ getPageCount: () => 1 });

    const res = await PUT(request([{
      id: 'signature-page-99',
      type: 'signature',
      x: 72,
      y: 620,
      width: 180,
      height: 54,
      pageNumber: 99,
      recipientId: 'signer-1',
      fieldOwner: 'recipients',
      required: true,
    }]), { params: Promise.resolve({ documentId: DOCUMENT_ID }) });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'page_number_out_of_range',
      fieldId: 'signature-page-99',
      pageNumber: 99,
      pageCount: 1,
    });
    expect(mocks.getObjectStream).toHaveBeenCalledWith({
      bucket: 'documents',
      key: 'original.pdf',
      region: 'us-east-1',
      provider: 's3',
    });
    expect(mocks.copyObject).not.toHaveBeenCalled();
    expect(document.save).not.toHaveBeenCalled();
  });

  it('rejects remote URLs in image-based field values before loading a document', async () => {
    const res = await PUT(request([{
      id: 'owner-image',
      type: 'image',
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      pageNumber: 1,
      fieldOwner: 'me',
      required: true,
      value: 'http://169.254.169.254/latest/meta-data',
    }]), { params: Promise.resolve({ documentId: DOCUMENT_ID }) });

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toBe('invalid_request');
    expect(payload.details.fieldErrors.fields).toContain(
      'Remote URLs are not allowed for image-based field values.'
    );
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
    expect(mocks.getObjectStream).not.toHaveBeenCalled();
  });

  it('rejects malformed media data before loading a document', async () => {
    mocks.pdfCreate.mockResolvedValue({
      embedPng: vi.fn().mockRejectedValue(new Error('invalid png')),
      embedJpg: vi.fn().mockResolvedValue(undefined),
    });

    const res = await PUT(request([{
      id: 'owner-image',
      type: 'image',
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      pageNumber: 1,
      fieldOwner: 'me',
      required: true,
      value: 'data:image/png;base64,aW52YWxpZA==',
    }]), { params: Promise.resolve({ documentId: DOCUMENT_ID }) });

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toBe('invalid_request');
    expect(JSON.stringify(payload.details)).toContain('must contain a decodable PNG or JPEG image');
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
    expect(mocks.getObjectStream).not.toHaveBeenCalled();
  });

  it('does not overwrite a document after the send operation claims it', async () => {
    const document = draftDocument();
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.documentUpdateOne.mockResolvedValue({ modifiedCount: 0 });

    const res = await PUT(request([{
      id: 'signature-1',
      type: 'signature',
      x: 72,
      y: 620,
      width: 180,
      height: 54,
      pageNumber: 1,
      recipientId: 'signer-1',
      fieldOwner: 'recipients',
      required: true,
    }]), { params: Promise.resolve({ documentId: DOCUMENT_ID }) });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'preparation_conflict' });
    expect(mocks.documentUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $in: ['draft', 'saved'] },
        currentVersion: 0,
        updatedAt: document.updatedAt,
        $or: expect.arrayContaining([{ sendDispatch: { $exists: false } }]),
      }),
      expect.anything()
    );
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.objectContaining({
      key: expect.stringContaining('/prepared_1.pdf'),
    }));
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
    expect(document.save).not.toHaveBeenCalled();
  });
});
