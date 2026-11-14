import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type AuthContext = { userId: string; orgId: string; orgRole: string };
type TrialHandler = (req: NextRequest, context: unknown, authContext: AuthContext) => Promise<Response>;

const SOURCE_STORAGE = {
  provider: 's3' as const,
  bucket: 'documents-test',
  region: 'ap-south-1',
  key: 'documents/user-1/current.pdf',
};

const mocks = vi.hoisted(() => ({
  canManageTemplate: vi.fn(),
  clearLegacyTemplateFilePath: vi.fn((template: { filePath?: unknown }) => {
    delete template.filePath;
  }),
  connectDB: vi.fn(),
  createdTemplates: [] as Array<Record<string, unknown>>,
  deleteTemplateArtifacts: vi.fn(),
  DocumentModel: { findOne: vi.fn() },
  existingSave: vi.fn(),
  findById: vi.fn(),
  getLatestPreparedVersion: vi.fn(),
  getTemplateLayoutState: vi.fn(),
  getRegion: vi.fn(),
  getStorageBucketName: vi.fn(),
  newSave: vi.fn(),
  pdfLoad: vi.fn(),
  readTemplateStorageBuffer: vi.fn(),
  sanitizeTemplateDefaultSigners: vi.fn(),
  sanitizeTemplateFields: vi.fn(),
  sanitizeTemplateTags: vi.fn(),
  storeTemplateArtifact: vi.fn(),
  TemplateModel: vi.fn(),
}));

vi.mock('pdf-lib', () => ({ PDFDocument: { load: mocks.pdfLoad } }));
vi.mock('@/models/Document', () => ({ __esModule: true, default: mocks.DocumentModel }));
vi.mock('@/models/Template', () => ({ __esModule: true, default: mocks.TemplateModel }));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/template-access', () => ({
  canManageTemplate: mocks.canManageTemplate,
  normalizeTemplateSharingScope: (value: unknown) => value === 'workspace' ? 'workspace' : 'private',
}));
vi.mock('@/lib/template-persistence', () => ({
  sanitizeTemplateDefaultSigners: mocks.sanitizeTemplateDefaultSigners,
  sanitizeTemplateFields: mocks.sanitizeTemplateFields,
  sanitizeTemplateTags: mocks.sanitizeTemplateTags,
}));
vi.mock('@/lib/signing-utils', () => ({ getLatestPreparedVersion: mocks.getLatestPreparedVersion }));
vi.mock('@/lib/template-layout', () => ({ getTemplateLayoutState: mocks.getTemplateLayoutState }));
vi.mock('@/lib/s3', () => ({
  getRegion: mocks.getRegion,
  getStorageBucketName: mocks.getStorageBucketName,
}));
vi.mock('@/lib/template-artifacts', () => ({
  TEMPLATE_ARTIFACT_MAX_BYTES: 25 * 1024 * 1024,
  clearLegacyTemplateFilePath: mocks.clearLegacyTemplateFilePath,
  deleteTemplateArtifacts: mocks.deleteTemplateArtifacts,
  getTemplatePdfArtifact: (template: { artifacts?: { pdf?: unknown } }) => template.artifacts?.pdf || null,
  isTemplateArtifact: (value: unknown) => Boolean(value && typeof value === 'object' && 'storage' in value),
  isTemplateArtifactStorage: (value: unknown) => Boolean(value && typeof value === 'object' && 'provider' in value && 'bucket' in value && 'key' in value),
  readTemplateStorageBuffer: mocks.readTemplateStorageBuffer,
  sameTemplateArtifact: (left: { storage?: { key?: string } } | null, right: { storage?: { key?: string } } | null) => left?.storage?.key === right?.storage?.key,
  storeTemplateArtifact: mocks.storeTemplateArtifact,
}));
vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock('@/config/template-categories', () => ({
  isTemplateCategory: (value: string) => ['Legal', 'Other'].includes(value),
}));
vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, { userId: 'user-1', orgId: 'org-1', orgRole: 'owner' }),
}));

import { POST } from '@/app/api/templates/create/route';

const DOCUMENT_ID = '507f1f77bcf86cd799439011';
const EXISTING_TEMPLATE_ID = '507f1f77bcf86cd799439012';
const SOURCE_PDF = Buffer.from('%PDF-1.7 trusted document');

function artifact(key: string) {
  return {
    storage: { provider: 's3' as const, bucket: 'templates-test', region: 'ap-south-1', key },
    contentType: 'application/pdf',
    size: SOURCE_PDF.length,
    sha256: 'template-sha',
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest('https://example.com/api/templates/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'NDA',
      category: 'Legal',
      documentId: DOCUMENT_ID,
      fields: [],
      defaultSigners: [],
      tags: ['legal'],
      ...overrides,
    }),
  });
}

function sourceDocument(storage = SOURCE_STORAGE) {
  return {
    userId: { toString: () => 'user-1' },
    orgId: { toString: () => 'org-1' },
    versions: [{ version: 1, label: 'original', storage, documentName: 'Current agreement.pdf' }],
    currentVersion: 1,
    fields: [],
    recipients: [],
    templateId: null,
  };
}

describe('template create route object storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createdTemplates.length = 0;
    mocks.TemplateModel.mockImplementation(function MockTemplate(
      this: Record<string, unknown>,
      values: Record<string, unknown>
    ) {
      Object.assign(this, values, { save: mocks.newSave });
      mocks.createdTemplates.push(this);
    });
    Object.assign(mocks.TemplateModel, { findById: mocks.findById });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.DocumentModel.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(sourceDocument()) });
    mocks.getLatestPreparedVersion.mockReturnValue(null);
    mocks.getRegion.mockReturnValue('ap-south-1');
    mocks.getStorageBucketName.mockReturnValue('documents-test');
    mocks.newSave.mockResolvedValue(undefined);
    mocks.existingSave.mockResolvedValue(undefined);
    mocks.sanitizeTemplateFields.mockImplementation((value: unknown) => value || []);
    mocks.sanitizeTemplateDefaultSigners.mockImplementation((value: unknown) => value || []);
    mocks.sanitizeTemplateTags.mockImplementation((value: unknown) => value || []);
    mocks.readTemplateStorageBuffer.mockResolvedValue(SOURCE_PDF);
    mocks.pdfLoad.mockResolvedValue({ getPageCount: () => 3 });
    mocks.storeTemplateArtifact.mockResolvedValue(artifact('templates/new.pdf'));
    mocks.canManageTemplate.mockReturnValue(true);
    mocks.getTemplateLayoutState.mockImplementation((template: Record<string, unknown>) => ({
      fieldLayoutStatus: template.fieldLayoutStatus || 'current',
      layoutRevision: template.layoutRevision || 1,
      fieldLayoutRevision: template.fieldLayoutRevision || 1,
    }));
  });

  afterEach(() => vi.restoreAllMocks());

  it('copies the trusted document-version object into a new immutable template artifact', async () => {
    const response = await POST(request({ fileSize: 1, pageCount: 99 }), {});
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.action).toBe('create');
    expect(mocks.readTemplateStorageBuffer).toHaveBeenCalledWith(SOURCE_STORAGE);
    expect(mocks.storeTemplateArtifact).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'pdf', data: SOURCE_PDF, extension: 'pdf', contentType: 'application/pdf',
    }));
    expect(mocks.createdTemplates[0]).toMatchObject({
      name: 'NDA',
      artifacts: { pdf: artifact('templates/new.pdf'), source: artifact('templates/new.pdf') },
      fileSize: SOURCE_PDF.length,
      pageCount: 3,
      fieldLayoutStatus: 'current',
      layoutRevision: 1,
      fieldLayoutRevision: 1,
    });
    expect(mocks.createdTemplates[0]).not.toHaveProperty('filePath');
    expect(payload.template).not.toHaveProperty('artifacts');
    expect(payload.template).not.toHaveProperty('filePath');
  });

  it('replaces only the selected template, then removes its obsolete remote artifact', async () => {
    const oldPdf = artifact('templates/old.pdf');
    const existingTemplate = {
      _id: EXISTING_TEMPLATE_ID,
      name: 'Services Agreement',
      description: 'Keep this description',
      category: 'Legal',
      tags: ['keep'],
      userId: 'user-1',
      orgId: 'org-1',
      sharingScope: 'private',
      artifacts: { pdf: oldPdf, source: oldPdf },
      save: mocks.existingSave,
    };
    mocks.findById.mockResolvedValue(existingTemplate);

    const response = await POST(request({
      saveMode: 'update', existingTemplateId: EXISTING_TEMPLATE_ID, replaceConfirmation: true,
    }), {});

    expect(response.status).toBe(200);
    expect(existingTemplate).toMatchObject({
      name: 'Services Agreement', description: 'Keep this description', category: 'Legal', tags: ['keep'],
      artifacts: { pdf: artifact('templates/new.pdf'), source: artifact('templates/new.pdf') },
      templateFileUrl: `/api/templates/${EXISTING_TEMPLATE_ID}`,
      fieldLayoutStatus: 'current', layoutRevision: 2, fieldLayoutRevision: 2,
    });
    expect(mocks.existingSave).toHaveBeenCalledOnce();
    expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([oldPdf, oldPdf]);
  });

  it('cleans up a newly uploaded object when persistence fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.newSave.mockRejectedValue(new Error('database detail'));

    const response = await POST(request(), {});
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({ code: 'TEMPLATE_SAVE_FAILED' });
    expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([artifact('templates/new.pdf')]);
    expect(JSON.stringify(payload)).not.toContain('database detail');
    consoleError.mockRestore();
  });

  it('does not delete a previous template object when it is still the document version source', async () => {
    const sourceArtifact = {
      ...artifact(SOURCE_STORAGE.key),
      storage: { ...SOURCE_STORAGE },
    };
    const existingTemplate = {
      _id: EXISTING_TEMPLATE_ID,
      name: 'Services Agreement', category: 'Legal', userId: 'user-1', orgId: 'org-1',
      sharingScope: 'private', artifacts: { pdf: sourceArtifact, source: sourceArtifact }, save: mocks.existingSave,
    };
    mocks.findById.mockResolvedValue(existingTemplate);

    const response = await POST(request({
      saveMode: 'update', existingTemplateId: EXISTING_TEMPLATE_ID, replaceConfirmation: true,
    }), {});

    expect(response.status).toBe(200);
    expect(mocks.deleteTemplateArtifacts).not.toHaveBeenCalled();
  });

  it('refuses a document version that has not been moved to object storage', async () => {
    mocks.DocumentModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(sourceDocument({ provider: 'local-dev', key: 'uploads/current.pdf' })),
    });

    const response = await POST(request(), {});
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe('DOCUMENT_ARTIFACT_UNAVAILABLE');
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('uses the configured bucket for a legacy S3 document version with no stored bucket', async () => {
    mocks.DocumentModel.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(sourceDocument({ provider: 's3', key: 'documents/user-1/legacy.pdf' })),
    });

    const response = await POST(request(), {});

    expect(response.status).toBe(201);
    expect(mocks.getStorageBucketName).toHaveBeenCalledWith('s3');
    expect(mocks.readTemplateStorageBuffer).toHaveBeenCalledWith({
      provider: 's3', bucket: 'documents-test', region: 'ap-south-1', key: 'documents/user-1/legacy.pdf',
    });
  });

  it('rejects an object-store document that exceeds the template artifact limit', async () => {
    mocks.readTemplateStorageBuffer.mockResolvedValue(Buffer.alloc(25 * 1024 * 1024 + 1));

    const response = await POST(request(), {});
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.code).toBe('TEMPLATE_ARTIFACT_TOO_LARGE');
    expect(mocks.pdfLoad).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('does not write an artifact for a target the caller cannot manage', async () => {
    mocks.findById.mockResolvedValue({
      _id: EXISTING_TEMPLATE_ID, name: 'NDA', userId: 'another-user', orgId: 'org-1', sharingScope: 'private',
    });
    mocks.canManageTemplate.mockReturnValue(false);

    const response = await POST(request({
      saveMode: 'update', existingTemplateId: EXISTING_TEMPLATE_ID, replaceConfirmation: true,
    }), {});

    expect(response.status).toBe(403);
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
    expect(mocks.newSave).not.toHaveBeenCalled();
  });
});
