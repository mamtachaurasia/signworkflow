import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type AuthContext = { userId?: string; orgId?: string; orgRole?: string } | null;
type TrialHandler = (
  req: NextRequest,
  context: unknown,
  authContext: AuthContext
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  authContext: { userId: 'user-1', orgId: 'org-1', orgRole: 'owner' } as AuthContext,
  connectDB: vi.fn(),
  createdTemplates: [] as Array<Record<string, unknown>>,
  deleteTemplateArtifacts: vi.fn(),
  renderEditableTemplatePdf: vi.fn(),
  save: vi.fn(),
  storeTemplateArtifact: vi.fn(),
  TemplateModel: vi.fn(),
}));

vi.mock('@/lib/template-content-pdf', () => ({
  renderEditableTemplatePdf: mocks.renderEditableTemplatePdf,
}));

vi.mock('@/lib/template-artifacts', () => ({
  deleteTemplateArtifacts: mocks.deleteTemplateArtifacts,
  storeTemplateArtifact: mocks.storeTemplateArtifact,
}));

vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, mocks.authContext),
}));

vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: mocks.TemplateModel,
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));

import { POST } from '@/app/api/templates/scratch/route';

const PDF_ARTIFACT = {
  storage: {
    provider: 'r2' as const,
    bucket: 'templates-test',
    region: 'auto',
    key: 'templates/v1/org-1/template-1/pdf/blank.pdf',
    url: 'r2://templates-test/templates/v1/org-1/template-1/pdf/blank.pdf',
  },
  contentType: 'application/pdf',
  size: Buffer.byteLength('blank pdf'),
  sha256: 'blank-pdf-hash',
};

function request(body: Record<string, unknown> = {}) {
  return new NextRequest('https://example.com/api/templates/scratch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('scratch template route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authContext = { userId: 'user-1', orgId: 'org-1', orgRole: 'owner' };
    mocks.createdTemplates.length = 0;
    mocks.TemplateModel.mockImplementation(function MockTemplate(
      this: Record<string, unknown>,
      values: Record<string, unknown>
    ) {
      Object.assign(this, values, { save: mocks.save });
      mocks.createdTemplates.push(this);
    });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.renderEditableTemplatePdf.mockResolvedValue(Buffer.from('blank pdf'));
    mocks.save.mockResolvedValue(undefined);
    mocks.deleteTemplateArtifacts.mockResolvedValue(undefined);
    mocks.storeTemplateArtifact.mockResolvedValue(PDF_ARTIFACT);
  });

  it('creates a private, editable one-page draft with safe layout defaults', async () => {
    const response = await POST(request(), {});
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(mocks.storeTemplateArtifact).toHaveBeenCalledWith(expect.objectContaining({
      templateId: expect.any(String),
      orgId: 'org-1',
      kind: 'pdf',
      data: Buffer.from('blank pdf'),
      contentType: 'application/pdf',
      extension: 'pdf',
    }));
    expect(mocks.createdTemplates[0]).toMatchObject({
      name: 'Untitled template',
      sharingScope: 'private',
      category: 'Other',
      isSystemTemplate: false,
      fields: [],
      defaultSigners: [],
      pageCount: 1,
      fieldLayoutStatus: 'current',
      layoutRevision: 1,
      fieldLayoutRevision: 1,
      editableContent: {
        version: 1,
        blocks: [expect.objectContaining({ id: 'initial-paragraph', type: 'paragraph' })],
        variables: [],
      },
      artifacts: {
        pdf: PDF_ARTIFACT,
        source: PDF_ARTIFACT,
      },
      fileSize: PDF_ARTIFACT.size,
    });
  });

  it('does not create a draft without an authenticated workspace', async () => {
    mocks.authContext = null;

    const response = await POST(request({ name: 'Draft' }), {});

    expect(response.status).toBe(401);
    expect(mocks.TemplateModel).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('removes the generated PDF artifact when the draft cannot be persisted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.save.mockRejectedValueOnce(new Error('database unavailable'));

    try {
      const response = await POST(request({ name: 'Draft' }), {});
      const payload = await response.json();

      expect(response.status).toBe(500);
      expect(payload.code).toBe('TEMPLATE_SCRATCH_CREATE_FAILED');
      expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([PDF_ARTIFACT]);
    } finally {
      consoleError.mockRestore();
    }
  });
});
