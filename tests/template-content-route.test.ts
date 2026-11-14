import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  canManageTemplate: vi.fn(),
  clearLegacyTemplateFilePath: vi.fn((template: { filePath?: unknown }) => {
    delete template.filePath;
  }),
  connectDB: vi.fn(),
  deleteTemplateArtifacts: vi.fn(),
  findById: vi.fn(),
  getTemplatePdfArtifact: vi.fn(),
  getAuthContext: vi.fn(),
  isTemplateArtifact: vi.fn(),
  loadPdf: vi.fn(),
  renderEditableTemplatePdf: vi.fn(),
  sameTemplateArtifact: vi.fn(),
  save: vi.fn(),
  storeTemplateArtifact: vi.fn(),
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: { load: mocks.loadPdf },
}));
vi.mock('@/lib/auth-context', () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock('@/lib/template-access', () => ({ canManageTemplate: mocks.canManageTemplate }));
vi.mock('@/lib/template-content-pdf', () => ({
  renderEditableTemplatePdf: mocks.renderEditableTemplatePdf,
}));
vi.mock('@/lib/template-artifacts', () => ({
  clearLegacyTemplateFilePath: mocks.clearLegacyTemplateFilePath,
  deleteTemplateArtifacts: mocks.deleteTemplateArtifacts,
  getTemplatePdfArtifact: mocks.getTemplatePdfArtifact,
  isTemplateArtifact: mocks.isTemplateArtifact,
  sameTemplateArtifact: mocks.sameTemplateArtifact,
  storeTemplateArtifact: mocks.storeTemplateArtifact,
}));
vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: { findById: mocks.findById },
}));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));

import { PUT } from '@/app/api/templates/[templateId]/content/route';

const TEMPLATE_ID = '507f1f77bcf86cd799439011';
const originalContent = {
  version: 1,
  blocks: [{ id: 'clause', type: 'paragraph', text: 'Original clause', html: '<p>Original clause</p>' }],
  variables: [],
};

function artifact(key: string) {
  return {
    storage: {
      provider: 'r2' as const,
      bucket: 'templates-test',
      region: 'auto',
      key,
      url: `r2://templates-test/${key}`,
    },
    contentType: 'application/pdf',
    size: Buffer.byteLength('updated pdf'),
    sha256: `hash-${key}`,
  };
}

const UPDATED_PDF_ARTIFACT = artifact('templates/v1/org-1/template-1/pdf/updated.pdf');

function isArtifact(value: unknown): value is { storage: { provider: string; bucket: string; key: string } } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'storage' in value &&
      (value as { storage?: unknown }).storage &&
      typeof (value as { storage: { key?: unknown } }).storage.key === 'string'
  );
}

function sameArtifact(
  left: { storage?: { provider?: string; bucket?: string; key?: string } } | null | undefined,
  right: { storage?: { provider?: string; bucket?: string; key?: string } } | null | undefined
) {
  return Boolean(
    left?.storage &&
      right?.storage &&
      left.storage.provider === right.storage.provider &&
      left.storage.bucket === right.storage.bucket &&
      left.storage.key === right.storage.key
  );
}

function request(editableContent: Record<string, unknown>) {
  return new NextRequest(`https://example.com/api/templates/${TEMPLATE_ID}/content`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'csrf_token=test-csrf-token',
      'X-CSRF-Token': 'test-csrf-token',
    },
    body: JSON.stringify({ editableContent, defaultSigners: [] }),
  });
}

function requestWithoutCsrf(editableContent: Record<string, unknown>) {
  return new NextRequest(`https://example.com/api/templates/${TEMPLATE_ID}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ editableContent, defaultSigners: [] }),
  });
}

function context() {
  return { params: Promise.resolve({ templateId: TEMPLATE_ID }) };
}

describe('editable template content route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.getAuthContext.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'owner' });
    mocks.canManageTemplate.mockReturnValue(true);
    mocks.renderEditableTemplatePdf.mockResolvedValue(Buffer.from('updated pdf'));
    mocks.loadPdf.mockResolvedValue({ getPageCount: () => 2 });
    mocks.save.mockResolvedValue(undefined);
    mocks.deleteTemplateArtifacts.mockResolvedValue(undefined);
    mocks.getTemplatePdfArtifact.mockImplementation((template: { artifacts?: { pdf?: unknown } }) =>
      isArtifact(template.artifacts?.pdf) ? template.artifacts!.pdf : null
    );
    mocks.isTemplateArtifact.mockImplementation(isArtifact);
    mocks.sameTemplateArtifact.mockImplementation(sameArtifact);
    mocks.storeTemplateArtifact.mockResolvedValue(UPDATED_PDF_ARTIFACT);
  });

  it('preserves fields and marks them for review when content changes', async () => {
    const fields = [{ id: 'signature-1', type: 'signature', pageNumber: 1 }];
    const template = {
      _id: TEMPLATE_ID,
      name: 'NDA',
      editableContent: originalContent,
      fields,
      defaultSigners: [],
      save: mocks.save,
    };
    mocks.findById.mockResolvedValue(template);

    const response = await PUT(request({
      ...originalContent,
      blocks: [{ id: 'clause', type: 'paragraph', text: 'Changed clause', html: '<p>Changed clause</p>' }],
    }), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(template.fields).toBe(fields);
    expect(template).toMatchObject({
      fieldLayoutStatus: 'needs_review',
      layoutRevision: 2,
      fieldLayoutRevision: 1,
      pageCount: 2,
      artifacts: {
        pdf: UPDATED_PDF_ARTIFACT,
        source: UPDATED_PDF_ARTIFACT,
      },
    });
    expect(mocks.storeTemplateArtifact).toHaveBeenCalledWith({
      templateId: TEMPLATE_ID,
      orgId: 'org-1',
      kind: 'pdf',
      data: Buffer.from('updated pdf'),
      contentType: 'application/pdf',
      extension: 'pdf',
    });
    expect(payload.template.fields).toHaveLength(1);
    expect(payload.template.fieldLayoutStatus).toBe('needs_review');
  });

  it('rejects a cookie-authenticated content update without a CSRF token before loading the template', async () => {
    const response = await PUT(requestWithoutCsrf(originalContent), context());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      message: 'CSRF validation failed',
      reason: 'csrf_mismatch',
    });
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('keeps a legacy field layout current when content has not changed', async () => {
    const template = {
      _id: TEMPLATE_ID,
      name: 'NDA',
      editableContent: originalContent,
      fields: [{ id: 'signature-1' }],
      defaultSigners: [],
      save: mocks.save,
    };
    mocks.findById.mockResolvedValue(template);

    const response = await PUT(request(originalContent), context());

    expect(response.status).toBe(200);
    expect(template).toMatchObject({
      fieldLayoutStatus: 'current',
      layoutRevision: 1,
      fieldLayoutRevision: 1,
    });
    expect(template.fields).toHaveLength(1);
  });

  it('removes a superseded PDF artifact only after the template save succeeds', async () => {
    const previousPdfArtifact = artifact('templates/v1/org-1/template-1/pdf/previous.pdf');
    const sourceArtifact = artifact('templates/v1/org-1/template-1/source/original.pdf');
    const template = {
      _id: TEMPLATE_ID,
      orgId: 'org-1',
      name: 'NDA',
      editableContent: originalContent,
      fields: [],
      defaultSigners: [],
      artifacts: { pdf: previousPdfArtifact, source: sourceArtifact },
      save: mocks.save,
    };
    mocks.findById.mockResolvedValue(template);

    const response = await PUT(request({
      ...originalContent,
      blocks: [{ id: 'clause', type: 'paragraph', text: 'Changed clause', html: '<p>Changed clause</p>' }],
    }), context());

    expect(response.status).toBe(200);
    expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([previousPdfArtifact]);
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteTemplateArtifacts.mock.invocationCallOrder[0]
    );
  });

  it('removes the newly stored PDF artifact when saving the template fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const template = {
      _id: TEMPLATE_ID,
      orgId: 'org-1',
      name: 'NDA',
      editableContent: originalContent,
      fields: [],
      defaultSigners: [],
      save: mocks.save,
    };
    mocks.findById.mockResolvedValue(template);
    mocks.save.mockRejectedValueOnce(new Error('database unavailable'));

    try {
      const response = await PUT(request(originalContent), context());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: 'Unable to save template content. Please try again.',
      });
      expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([UPDATED_PDF_ARTIFACT]);
    } finally {
      consoleError.mockRestore();
    }
  });
});
