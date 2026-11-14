import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type AuthContext = { userId?: string; orgId?: string | null; orgRole?: string } | null;
type TrialHandler = (
  req: NextRequest,
  context: unknown,
  authContext: AuthContext
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  authContext: { userId: 'user-1', orgId: null, orgRole: 'owner' } as AuthContext,
  buildDocumentWriteFilter: vi.fn((filter: unknown) => filter),
  connectDB: vi.fn(),
  deleteObject: vi.fn(),
  documentFindOne: vi.fn(),
  documentUpdateOne: vi.fn(),
  hasAnySignedRecipient: vi.fn(),
  putObjectStream: vi.fn(),
  renderEditableTemplatePdf: vi.fn(),
  sha256Buffer: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({ getAuthContext: vi.fn() }));
vi.mock('@/lib/document-guards', () => ({ hasAnySignedRecipient: mocks.hasAnySignedRecipient }));
vi.mock('@/lib/document-sharing', () => ({
  buildDocumentWriteFilter: mocks.buildDocumentWriteFilter,
  normalizeShareEmail: (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : null,
}));
vi.mock('@/lib/hash', () => ({ sha256Buffer: mocks.sha256Buffer }));
vi.mock('@/lib/s3', () => ({
  deleteObject: mocks.deleteObject,
  getRegion: vi.fn(() => 'ap-south-1'),
  getStorageBucketName: vi.fn(() => 'documents-test'),
  getStorageProvider: vi.fn(() => 's3'),
  putObjectStream: mocks.putObjectStream,
}));
vi.mock('@/lib/template-content-pdf', () => ({
  renderEditableTemplatePdf: mocks.renderEditableTemplatePdf,
}));
vi.mock('@/lib/template-persistence', () => ({
  sanitizeTemplateFields: (fields: unknown[]) => fields,
}));
vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, mocks.authContext),
}));
vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: {
    findOne: mocks.documentFindOne,
    updateOne: mocks.documentUpdateOne,
  },
}));
vi.mock('@/models/Users', () => ({
  __esModule: true,
  default: { findById: vi.fn() },
}));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));

import { PUT } from '@/app/api/documents/[documentId]/content/route';

const DOCUMENT_ID = '507f1f77bcf86cd799439012';

const initialContent = {
  version: 1,
  blocks: [{
    id: 'body',
    type: 'paragraph',
    text: 'Original agreement',
    html: '<p>Original agreement</p>',
    align: 'left',
  }],
  variables: [],
};

function request(editableContent: Record<string, unknown>, fields?: unknown[]) {
  return new NextRequest(`https://example.com/api/documents/${DOCUMENT_ID}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion: 1, editableContent, ...(fields ? { fields } : {}) }),
  });
}

function context() {
  return { params: Promise.resolve({ documentId: DOCUMENT_ID }) };
}

describe('scratch document content route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authContext = { userId: 'user-1', orgId: null, orgRole: 'owner' };
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.hasAnySignedRecipient.mockReturnValue(false);
    mocks.renderEditableTemplatePdf.mockResolvedValue(Buffer.from('updated scratch document'));
    mocks.sha256Buffer.mockResolvedValue('updated-document-hash');
    mocks.putObjectStream.mockResolvedValue(undefined);
    mocks.documentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.documentFindOne.mockResolvedValue({
      _id: DOCUMENT_ID,
      userId: 'user-1',
      documentName: 'Scratch agreement',
      status: 'draft',
      currentVersion: 1,
      editableContent: initialContent,
      templatePreparation: { completed: true, fieldsNeedReview: false },
      versions: [{ version: 1, label: 'prepared', locked: false, fields: [] }],
    });
  });

  it('marks a scratch document incomplete when a required Smart variable has no value', async () => {
    const response = await PUT(request({
      ...initialContent,
      blocks: [{
        id: 'body',
        type: 'paragraph',
        text: 'Agreement with {{client_name}}',
        html: '<p>Agreement with {{client_name}}</p>',
        align: 'left',
      }],
      variables: [{
        key: 'client_name',
        label: 'Client name',
        defaultValue: '',
        required: true,
      }],
    }), context());

    expect(response.status).toBe(200);
    const update = mocks.documentUpdateOne.mock.calls[0]?.[1];
    expect(update).toEqual(expect.objectContaining({
      $set: expect.objectContaining({
        'templatePreparation.completed': false,
      }),
    }));
  });

  it('preserves the Builder field snapshot while applying Smart-variable values', async () => {
    const fields = [{
      id: 'signature-1',
      type: 'signature',
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      pageNumber: 1,
      recipientId: 'recipient-1',
      required: true,
      fieldOwner: 'recipients',
    }];
    const response = await PUT(request({
      ...initialContent,
      blocks: [{
        id: 'body',
        type: 'paragraph',
        text: 'Agreement with {{client_name}}',
        html: '<p>Agreement with {{client_name}}</p>',
        align: 'left',
      }],
      variables: [{
        key: 'client_name',
        label: 'Client name',
        defaultValue: 'Acme Ltd',
        required: true,
      }],
    }, fields), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    const update = mocks.documentUpdateOne.mock.calls[0]?.[1];
    expect(update.$push.versions.fields).toEqual(fields);
    expect(payload.fields).toEqual(fields);
    expect(update.$set['templatePreparation.completed']).toBe(true);
  });
});
