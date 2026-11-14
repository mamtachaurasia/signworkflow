import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  getAuthContext: vi.fn(),
  validateCsrfToken: vi.fn(),
  documentFindOne: vi.fn(),
  documentUpdateOne: vi.fn(),
  templateFindById: vi.fn(),
  renderEditableTemplatePdf: vi.fn(),
  sha256Buffer: vi.fn(),
  putObjectStream: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/auth-context', () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock('@/lib/auth', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/hash', () => ({ sha256Buffer: mocks.sha256Buffer }));
vi.mock('@/lib/template-content-pdf', () => ({
  renderEditableTemplatePdf: mocks.renderEditableTemplatePdf,
}));
vi.mock('@/lib/s3', () => ({
  deleteObject: mocks.deleteObject,
  getRegion: vi.fn(() => 'ap-south-1'),
  getStorageBucketName: vi.fn(() => 'documents-test'),
  getStorageProvider: vi.fn(() => 's3'),
  putObjectStream: mocks.putObjectStream,
}));
vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: {
    findOne: mocks.documentFindOne,
    updateOne: mocks.documentUpdateOne,
  },
}));
vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: { findById: mocks.templateFindById },
}));

import { POST } from '@/app/api/documents/[documentId]/prepare-template/route';

const DOCUMENT_ID = '507f1f77bcf86cd799439011';
const TEMPLATE_ID = '507f191e810c19729de860ea';
const FIELD = {
  id: 'signature-1',
  type: 'signature',
  x: 10,
  y: 20,
  width: 120,
  height: 40,
  pageNumber: 1,
  recipientId: 'signer-role',
  required: true,
  pageRect: { width: 612, height: 792 },
};

function documentRecord() {
  return {
    _id: DOCUMENT_ID,
    userId: 'user-1',
    orgId: 'org-1',
    templateId: TEMPLATE_ID,
    documentName: 'Prepared agreement',
    status: 'draft',
    currentVersion: 1,
    versions: [{ version: 1, label: 'prepared', fields: [FIELD] }],
    recipients: [{ id: 'signer-role', name: 'Signer', email: '', role: 'signer' }],
    templatePreparation: {
      completed: true,
      variableValues: { company: 'Old Co' },
      fieldsNeedReview: false,
    },
  };
}

function templateRecord() {
  return {
    _id: TEMPLATE_ID,
    userId: 'user-1',
    name: 'Editable NDA',
    editableContent: {
      version: 1,
      blocks: [{ id: 'body', type: 'paragraph', content: '{{company}}' }],
      variables: [{ key: 'company', label: 'Company', defaultValue: 'Old Co', required: true }],
    },
    fields: [FIELD],
    defaultSigners: [{ id: 'signer-role', name: 'Signer', email: '', role: 'signer', order: 1 }],
  };
}

function request(fields?: unknown) {
  return new NextRequest(`https://example.com/api/documents/${DOCUMENT_ID}/prepare-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test' },
    body: JSON.stringify({
      variableValues: { company: 'New Co' },
      excludedVariableKeys: [],
      ...(fields === undefined ? {} : { fields }),
    }),
  });
}

const context = { params: Promise.resolve({ documentId: DOCUMENT_ID }) };

describe('editable template document preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthContext.mockResolvedValue({ userId: 'user-1', orgId: 'org-1' });
    mocks.validateCsrfToken.mockReturnValue(true);
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.documentFindOne.mockResolvedValue(documentRecord());
    mocks.templateFindById.mockResolvedValue(templateRecord());
    mocks.renderEditableTemplatePdf.mockResolvedValue(Buffer.from('prepared-pdf'));
    mocks.sha256Buffer.mockResolvedValue('prepared-hash');
    mocks.putObjectStream.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.documentUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it('preserves sanitized current field geometry and persists a sticky review flag on variable reflow', async () => {
    mocks.documentFindOne.mockResolvedValue({
      ...documentRecord(),
      versions: [{
        version: 1,
        label: 'prepared',
        fields: [{
          ...FIELD,
          pageRect: { ...FIELD.pageRect, unexpected: 'discard me' },
        }],
      }],
    });

    const response = await POST(request(), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fieldsNeedReview).toBe(true);
    expect(payload.fields).toEqual([
      expect.objectContaining({
        ...FIELD,
        pageRect: expect.objectContaining({ width: 612, height: 792 }),
      }),
    ]);
    expect(payload.fields[0].pageRect).not.toHaveProperty('unexpected');

    const [, update] = mocks.documentUpdateOne.mock.calls[0];
    expect(update.$push.versions.fields).toEqual([
      expect.objectContaining({
        ...FIELD,
        pageRect: expect.objectContaining({ width: 612, height: 792 }),
      }),
    ]);
    expect(update.$push.versions.fields[0].pageRect).not.toHaveProperty('unexpected');
    expect(update.$set.templatePreparation.fieldsNeedReview).toBe(true);
    expect(update.$set.currentVersion).toBe(2);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it('returns a conflict and removes the uploaded PDF when currentVersion changed', async () => {
    mocks.documentUpdateOne.mockResolvedValue({ matchedCount: 0 });

    const response = await POST(request(), context);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe('DOCUMENT_PREPARATION_CONFLICT');
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'documents-test',
      provider: 's3',
      key: expect.stringContaining(`documents/user-1/${DOCUMENT_ID}/template-prepared-2-`),
    }));
  });

  it('uses the live Builder field snapshot supplied with the explicit apply action', async () => {
    const movedField = {
      ...FIELD,
      x: 222,
      y: 333,
      pageRect: { width: 612, height: 792, left: 0, discard: 'not persisted' },
    };

    const response = await POST(request([movedField]), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fields).toEqual([
      expect.objectContaining({
        id: FIELD.id,
        x: 222,
        y: 333,
        pageRect: expect.objectContaining({ width: 612, height: 792, left: 0 }),
      }),
    ]);
    expect(payload.fields[0].pageRect).not.toHaveProperty('discard');
    const [, update] = mocks.documentUpdateOne.mock.calls[0];
    expect(update.$push.versions.fields).toEqual([
      expect.objectContaining({ id: FIELD.id, x: 222, y: 333 }),
    ]);
  });

  it('rejects a malformed submitted field snapshot before rendering a new PDF', async () => {
    const response = await POST(request({ invalid: true }), context);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe('Field configuration must be a list.');
    expect(mocks.renderEditableTemplatePdf).not.toHaveBeenCalled();
    expect(mocks.documentUpdateOne).not.toHaveBeenCalled();
  });

  it('removes the uploaded PDF when persistence fails after upload', async () => {
    mocks.sha256Buffer.mockRejectedValue(new Error('hash failed'));

    await expect(POST(request(), context)).rejects.toThrow('hash failed');
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
  });
});
