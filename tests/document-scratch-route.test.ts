import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type AuthContext = { userId?: string; orgId?: string | null; orgRole?: string } | null;
type TrialHandler = (
  req: NextRequest,
  context: unknown,
  authContext: AuthContext
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  applyRetentionToDocument: vi.fn(),
  authContext: { userId: 'user-1', orgId: null, orgRole: 'owner' } as AuthContext,
  connectDB: vi.fn(),
  copyObject: vi.fn(),
  createdDocuments: [] as Array<Record<string, unknown>>,
  deleteObject: vi.fn(),
  documentSave: vi.fn(),
  computeRetentionFields: vi.fn(),
  normalizeIp: vi.fn(),
  putObjectStream: vi.fn(),
  renderEditableTemplatePdf: vi.fn(),
  sha256Buffer: vi.fn(),
  writeAuditEvent: vi.fn(),
  DocumentModel: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({ writeAuditEvent: mocks.writeAuditEvent }));
vi.mock('@/lib/hash', () => ({ sha256Buffer: mocks.sha256Buffer }));
vi.mock('@/lib/retention', () => ({
  applyRetentionToDocument: mocks.applyRetentionToDocument,
  computeRetentionFields: mocks.computeRetentionFields,
}));
vi.mock('@/lib/s3', () => ({
  copyObject: mocks.copyObject,
  deleteObject: mocks.deleteObject,
  getRegion: vi.fn(() => 'ap-south-1'),
  getStorageBucketName: vi.fn(() => 'documents-test'),
  getStorageProvider: vi.fn(() => 's3'),
  putObjectStream: mocks.putObjectStream,
}));
vi.mock('@/lib/signing-utils', () => ({ normalizeIp: mocks.normalizeIp }));
vi.mock('@/lib/template-content-pdf', () => ({
  renderEditableTemplatePdf: mocks.renderEditableTemplatePdf,
}));
vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, mocks.authContext),
}));
vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: mocks.DocumentModel,
}));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));

import { POST } from '@/app/api/documents/scratch/route';

function request(body: Record<string, unknown> = {}) {
  return new NextRequest('https://example.com/api/documents/scratch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('scratch document route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authContext = { userId: 'user-1', orgId: null, orgRole: 'owner' };
    mocks.createdDocuments.length = 0;
    mocks.DocumentModel.mockImplementation(function MockDocument(
      this: Record<string, unknown>,
      values: Record<string, unknown>
    ) {
      Object.assign(this, values, {
        save: mocks.documentSave,
        toObject: () => ({ ...values }),
      });
      mocks.createdDocuments.push(this);
    });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.computeRetentionFields.mockResolvedValue({ status: 'unclassified' });
    mocks.copyObject.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.documentSave.mockResolvedValue(undefined);
    mocks.normalizeIp.mockReturnValue({ ip: '203.0.113.1', ipUnavailableReason: null });
    mocks.putObjectStream.mockResolvedValue(undefined);
    mocks.renderEditableTemplatePdf.mockResolvedValue(Buffer.from('blank document pdf'));
    mocks.sha256Buffer.mockResolvedValue('blank-document-hash');
    mocks.writeAuditEvent.mockResolvedValue(undefined);
  });

  it('creates an editable personal draft with original and prepared PDF versions', async () => {
    const response = await POST(request({ name: '  Consulting agreement  ' }), {});
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      success: true,
      documentId: expect.any(String),
      sessionId: expect.stringMatching(/^session_/),
      document: {
        _id: expect.any(String),
        name: 'Consulting agreement',
        currentVersion: 1,
        fieldsNeedReview: false,
        fileUrl: expect.stringContaining('/api/documents/'),
        editableContent: {
          version: 1,
          blocks: [expect.objectContaining({ type: 'paragraph' })],
          variables: [],
        },
      },
    });

    expect(mocks.createdDocuments).toHaveLength(1);
    expect(mocks.createdDocuments[0]).toMatchObject({
      userId: 'user-1',
      documentName: 'Consulting agreement',
      originalFileName: 'Consulting agreement.pdf',
      currentVersion: 1,
      status: 'draft',
      recipients: [],
      editableContent: payload.document.editableContent,
      templatePreparation: expect.objectContaining({ fieldsNeedReview: false }),
      versions: [
        expect.objectContaining({ version: 0, label: 'original', locked: true }),
        expect.objectContaining({ version: 1, label: 'prepared', locked: false, fields: [] }),
      ],
    });
    expect(mocks.createdDocuments[0]).not.toHaveProperty('orgId');
    expect(mocks.putObjectStream).toHaveBeenCalledTimes(1);
    expect(mocks.copyObject).toHaveBeenCalledTimes(1);
    expect(mocks.documentSave).toHaveBeenCalledTimes(1);
  });

  it('cleans up both stored objects when the draft cannot be persisted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.documentSave.mockRejectedValueOnce(new Error('database unavailable'));

    try {
      const response = await POST(request(), {});
      const payload = await response.json();

      expect(response.status).toBe(500);
      expect(payload.code).toBe('DOCUMENT_SCRATCH_CREATE_FAILED');
      expect(mocks.deleteObject).toHaveBeenCalledTimes(2);
      expect(mocks.deleteObject.mock.calls.map(([object]) => object.key)).toEqual([
        expect.stringMatching(/prepared_1\.pdf$/),
        expect.stringMatching(/original\.pdf$/),
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects a guest without writing or persisting a document', async () => {
    mocks.authContext = { userId: 'guest_unsafe', orgId: null };

    const response = await POST(request(), {});

    expect(response.status).toBe(401);
    expect(mocks.DocumentModel).not.toHaveBeenCalled();
    expect(mocks.putObjectStream).not.toHaveBeenCalled();
  });
});
