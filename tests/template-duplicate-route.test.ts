import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type AuthContext = { userId: string; orgId: string; orgRole: string };
type TrialHandler = (req: NextRequest, context: unknown, authContext: AuthContext) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  canReadTemplate: vi.fn(),
  connectDB: vi.fn(),
  copyTemplateArtifact: vi.fn(),
  createdTemplates: [] as Array<Record<string, unknown>>,
  deleteTemplateArtifacts: vi.fn(),
  findById: vi.fn(),
  getTemplateLayoutState: vi.fn(),
  pdfLoad: vi.fn(),
  renderEditableTemplatePdf: vi.fn(),
  sanitizeEditableTemplateContent: vi.fn(),
  save: vi.fn(),
  storeTemplateArtifact: vi.fn(),
  Template: vi.fn(),
}));

vi.mock('pdf-lib', () => ({ PDFDocument: { load: mocks.pdfLoad } }));
vi.mock('@/lib/template-access', () => ({ canReadTemplate: mocks.canReadTemplate }));
vi.mock('@/lib/template-content', () => ({ sanitizeEditableTemplateContent: mocks.sanitizeEditableTemplateContent }));
vi.mock('@/lib/template-content-pdf', () => ({ renderEditableTemplatePdf: mocks.renderEditableTemplatePdf }));
vi.mock('@/lib/template-persistence', () => ({
  sanitizeTemplateDefaultSigners: (value: unknown) => value || [],
  sanitizeTemplateFields: (value: unknown) => value || [],
  sanitizeTemplateTags: (value: unknown) => value || [],
}));
vi.mock('@/lib/template-layout', () => ({ getTemplateLayoutState: mocks.getTemplateLayoutState }));
vi.mock('@/lib/template-artifacts', () => ({
  TEMPLATE_ARTIFACT_MAX_BYTES: 25 * 1024 * 1024,
  copyTemplateArtifact: mocks.copyTemplateArtifact,
  deleteTemplateArtifacts: mocks.deleteTemplateArtifacts,
  getTemplatePdfArtifact: (template: { artifacts?: { pdf?: unknown } }) => template.artifacts?.pdf || null,
  isTemplateArtifact: (value: unknown) => Boolean(value && typeof value === 'object' && 'storage' in value),
  sameTemplateArtifact: (left: { storage?: { key?: string } } | null, right: { storage?: { key?: string } } | null) => left?.storage?.key === right?.storage?.key,
  storeTemplateArtifact: mocks.storeTemplateArtifact,
}));
vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, { userId: 'user-1', orgId: 'org-1', orgRole: 'owner' }),
}));
vi.mock('@/models/Template', () => ({ __esModule: true, default: mocks.Template }));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));

import { POST } from '@/app/api/templates/duplicate/route';

const TEMPLATE_ID = '507f1f77bcf86cd799439011';

function artifact(key: string, contentType = 'application/pdf') {
  return {
    storage: { provider: 's3' as const, bucket: 'templates-test', region: 'ap-south-1', key },
    contentType,
    size: 321,
    sha256: key,
  };
}

function duplicateRequest(templateId = TEMPLATE_ID): NextRequest {
  return new NextRequest('https://example.com/api/templates/duplicate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId }),
  });
}

function sourceTemplate(overrides: Record<string, unknown> = {}) {
  const pdf = artifact('templates/source/pdf.pdf');
  return {
    _id: TEMPLATE_ID,
    name: 'Mutual NDA',
    description: 'Mutual confidentiality terms',
    category: 'Legal',
    jurisdiction: 'International',
    templateFileUrl: `/api/templates/${TEMPLATE_ID}`,
    isSystemTemplate: false,
    artifacts: { pdf, source: pdf },
    fields: [], defaultSigners: [], editableContent: undefined,
    thumbnailUrl: undefined, pageCount: 2, tags: ['legal'],
    ...overrides,
  };
}

describe('template duplication route object storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createdTemplates.length = 0;
    mocks.Template.mockImplementation(function MockTemplate(this: Record<string, unknown>, values: Record<string, unknown>) {
      Object.assign(this, values, { save: mocks.save });
      mocks.createdTemplates.push(this);
    });
    Object.assign(mocks.Template, { findById: mocks.findById });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.findById.mockResolvedValue(sourceTemplate());
    mocks.canReadTemplate.mockReturnValue(true);
    mocks.copyTemplateArtifact.mockResolvedValue(artifact('templates/copy/pdf.pdf'));
    mocks.save.mockResolvedValue(undefined);
    mocks.getTemplateLayoutState.mockImplementation((template: Record<string, unknown>) => ({
      fieldLayoutStatus: template.fieldLayoutStatus || 'current',
      layoutRevision: template.layoutRevision || 1,
      fieldLayoutRevision: template.fieldLayoutRevision || 1,
    }));
    mocks.sanitizeEditableTemplateContent.mockImplementation((value: unknown) => value);
    mocks.renderEditableTemplatePdf.mockResolvedValue(Buffer.from('fresh editable pdf'));
    mocks.storeTemplateArtifact.mockResolvedValue(artifact('templates/copy/rendered.pdf'));
    mocks.pdfLoad.mockResolvedValue({ getPageCount: () => 2 });
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates an independent object-store copy with a final template URL', async () => {
    const response = await POST(duplicateRequest(), {});
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.copyTemplateArtifact).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'pdf', source: artifact('templates/source/pdf.pdf'), orgId: 'org-1',
    }));
    expect(mocks.createdTemplates[0]).toMatchObject({
      name: 'Mutual NDA (Copy)',
      artifacts: { pdf: artifact('templates/copy/pdf.pdf'), source: artifact('templates/copy/pdf.pdf') },
      fileSize: 321, isSystemTemplate: false, sharingScope: 'private', duplicateCount: 0,
    });
    expect(mocks.createdTemplates[0]).not.toHaveProperty('filePath');
    expect(payload.template.templateFileUrl).toBe(mocks.createdTemplates[0].templateFileUrl);
  });

  it('copies a retained DOCX source separately from the rendered PDF', async () => {
    const sourcePdf = artifact('templates/source/pdf.pdf');
    const sourceDocx = artifact(
      'templates/source/source.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    mocks.findById.mockResolvedValue(sourceTemplate({ artifacts: { pdf: sourcePdf, source: sourceDocx } }));
    mocks.copyTemplateArtifact
      .mockResolvedValueOnce(artifact('templates/copy/pdf.pdf'))
      .mockResolvedValueOnce(artifact('templates/copy/source.docx', sourceDocx.contentType));

    const response = await POST(duplicateRequest(), {});

    expect(response.status).toBe(201);
    expect(mocks.copyTemplateArtifact).toHaveBeenCalledTimes(2);
    expect(mocks.copyTemplateArtifact).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'source', extension: 'docx', source: sourceDocx }));
    expect(mocks.createdTemplates[0]).toMatchObject({
      artifacts: { pdf: artifact('templates/copy/pdf.pdf'), source: artifact('templates/copy/source.docx', sourceDocx.contentType) },
    });
  });

  it('renders and uploads an editable legacy template without any filesystem fallback', async () => {
    mocks.findById.mockResolvedValue(sourceTemplate({
      artifacts: undefined,
      editableContent: { version: 1, blocks: [{ id: 'clause', type: 'paragraph', text: 'Confidential information' }], variables: [] },
    }));

    const response = await POST(duplicateRequest(), {});

    expect(response.status).toBe(201);
    expect(mocks.renderEditableTemplatePdf).toHaveBeenCalledOnce();
    expect(mocks.storeTemplateArtifact).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'pdf', data: Buffer.from('fresh editable pdf'), extension: 'pdf',
    }));
    expect(mocks.copyTemplateArtifact).not.toHaveBeenCalled();
  });

  it('cleans up created remote objects when saving the copy fails', async () => {
    mocks.save.mockRejectedValue(new Error('duplicate key details must stay server-side'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(duplicateRequest(), {});
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ message: 'Unable to create a template copy. Please try again.', code: 'TEMPLATE_DUPLICATION_FAILED' });
    expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([artifact('templates/copy/pdf.pdf')]);
    expect(JSON.stringify(payload)).not.toContain('duplicate key');
    consoleError.mockRestore();
  });

  it('cleans a copied PDF if copying the retained source artifact fails', async () => {
    const sourcePdf = artifact('templates/source/pdf.pdf');
    const sourceDocx = artifact(
      'templates/source/source.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    mocks.findById.mockResolvedValue(sourceTemplate({ artifacts: { pdf: sourcePdf, source: sourceDocx } }));
    mocks.copyTemplateArtifact
      .mockResolvedValueOnce(artifact('templates/copy/pdf.pdf'))
      .mockRejectedValueOnce(new Error('source copy failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(duplicateRequest(), {});
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.code).toBe('TEMPLATE_DUPLICATION_FAILED');
    expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([artifact('templates/copy/pdf.pdf')]);
    consoleError.mockRestore();
  });

  it('rejects a template with no durable source artifact or editable fallback', async () => {
    mocks.findById.mockResolvedValue(sourceTemplate({ artifacts: undefined, editableContent: undefined }));

    const response = await POST(duplicateRequest(), {});
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe('TEMPLATE_SOURCE_UNAVAILABLE');
    expect(mocks.copyTemplateArtifact).not.toHaveBeenCalled();
  });

  it('rejects oversized source artifacts before copying them', async () => {
    mocks.findById.mockResolvedValue(sourceTemplate({
      artifacts: { pdf: { ...artifact('templates/source/too-large.pdf'), size: 25 * 1024 * 1024 + 1 } },
    }));

    const response = await POST(duplicateRequest(), {});
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.code).toBe('TEMPLATE_SOURCE_TOO_LARGE');
    expect(mocks.copyTemplateArtifact).not.toHaveBeenCalled();
  });
});
