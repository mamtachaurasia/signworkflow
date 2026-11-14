import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  canManageTemplate: vi.fn(),
  canReadTemplate: vi.fn(),
  connectDB: vi.fn(),
  deleteOne: vi.fn(),
  deleteTemplateArtifacts: vi.fn(),
  findById: vi.fn(),
  getAuthContext: vi.fn(),
  getTemplateArtifactStream: vi.fn(),
  getTemplateLayoutState: vi.fn(),
  getTemplatePdfArtifact: vi.fn(),
  isSecureRequest: vi.fn(),
  isTemplateArtifact: vi.fn(),
  validateCsrfToken: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  isSecureRequest: mocks.isSecureRequest,
  validateCsrfToken: mocks.validateCsrfToken,
  withSecurityHeaders: (_request: NextRequest, response: Response) => response,
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: {
    findById: mocks.findById,
    deleteOne: mocks.deleteOne,
  },
}));

vi.mock('@/lib/template-access', () => ({
  canManageTemplate: mocks.canManageTemplate,
  canReadTemplate: mocks.canReadTemplate,
  normalizeTemplateSharingScope: (value: unknown) => value === 'workspace' ? 'workspace' : 'private',
}));

vi.mock('@/lib/template-artifacts', () => ({
  deleteTemplateArtifacts: mocks.deleteTemplateArtifacts,
  getTemplateArtifactStream: mocks.getTemplateArtifactStream,
  getTemplatePdfArtifact: mocks.getTemplatePdfArtifact,
  isTemplateArtifact: mocks.isTemplateArtifact,
}));

vi.mock('@/lib/template-layout', () => ({
  getTemplateLayoutState: mocks.getTemplateLayoutState,
}));

vi.mock('@/lib/template-persistence', () => ({
  sanitizeTemplateDefaultSigners: (value: unknown) => value,
  sanitizeTemplateFields: (value: unknown) => value,
  sanitizeTemplateTags: (value: unknown) => value,
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: vi.fn(),
}));

vi.mock('@/config/template-categories', () => ({
  isTemplateCategory: vi.fn(() => true),
}));

vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: unknown) => handler,
}));

import { DELETE, GET } from '@/app/api/templates/[templateId]/route';

const TEMPLATE_ID = '507f1f77bcf86cd799439011';
const PDF_BODY = Buffer.from('%PDF-1.7\n');
const PDF_ARTIFACT = {
  storage: {
    provider: 'r2' as const,
    bucket: 'template-bucket',
    region: 'auto',
    key: 'templates/v1/org-1/template-1/pdf/revision-1.pdf',
    url: 'r2://template-bucket/templates/v1/org-1/template-1/pdf/revision-1.pdf',
  },
  contentType: 'application/pdf',
  size: PDF_BODY.length,
  sha256: 'pdf-sha',
};
const SOURCE_ARTIFACT = {
  storage: {
    provider: 'r2' as const,
    bucket: 'template-bucket',
    region: 'auto',
    key: 'templates/v1/org-1/template-1/source/original.docx',
  },
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 42,
  sha256: 'source-sha',
  originalFileName: 'agreement.docx',
};

function context() {
  return { params: Promise.resolve({ templateId: TEMPLATE_ID }) };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    _id: TEMPLATE_ID,
    userId: 'user-1',
    orgId: 'org-1',
    name: 'Board report',
    isSystemTemplate: false,
    templateFileUrl: `/api/templates/${TEMPLATE_ID}`,
    // A stale legacy path must not be read or removed once an object reference
    // exists. It makes this regression test fail if the route falls back to fs.
    filePath: '/definitely-not-mounted/template.pdf',
    artifacts: {
      pdf: PDF_ARTIFACT,
      source: SOURCE_ARTIFACT,
    },
    fields: [],
    defaultSigners: [],
    ...overrides,
  };
}

function request(method: 'GET' | 'DELETE' = 'GET') {
  return new NextRequest(`https://example.com/api/templates/${TEMPLATE_ID}`, {
    method,
    headers: method === 'DELETE'
      ? { Cookie: 'csrf_token=test-csrf-token', 'X-CSRF-Token': 'test-csrf-token' }
      : { Accept: 'application/pdf' },
  });
}

describe('template artifact route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.getAuthContext.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'owner' });
    mocks.canReadTemplate.mockReturnValue(true);
    mocks.canManageTemplate.mockReturnValue(true);
    mocks.isSecureRequest.mockReturnValue(true);
    mocks.validateCsrfToken.mockReturnValue(true);
    mocks.getTemplateLayoutState.mockReturnValue({
      fieldLayoutStatus: 'current',
      layoutRevision: 1,
      fieldLayoutRevision: 1,
    });
    mocks.getTemplatePdfArtifact.mockImplementation((value: { artifacts?: { pdf?: unknown } }) => value.artifacts?.pdf || null);
    mocks.isTemplateArtifact.mockImplementation((value: unknown) => Boolean(
      value && typeof value === 'object' && 'storage' in value
    ));
    mocks.getTemplateArtifactStream.mockResolvedValue(Readable.from([PDF_BODY]));
    mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.deleteTemplateArtifacts.mockResolvedValue(undefined);
  });

  it('streams the stored PDF through the authenticated template route without using filePath', async () => {
    const record = template();
    mocks.findById.mockResolvedValue(record);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-length')).toBe(String(PDF_BODY.length));
    expect(response.headers.get('content-disposition')).toBe('inline; filename="Board report.pdf"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PDF_BODY);
    expect(mocks.getTemplatePdfArtifact).toHaveBeenCalledWith(record);
    expect(mocks.getTemplateArtifactStream).toHaveBeenCalledWith(PDF_ARTIFACT);
  });

  it('returns a safe not-found response when the template has no PDF object reference', async () => {
    mocks.findById.mockResolvedValue(template({ artifacts: {} }));
    mocks.getTemplatePdfArtifact.mockReturnValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Template artifact is unavailable. Please contact support.',
    });
    expect(mocks.getTemplateArtifactStream).not.toHaveBeenCalled();
  });

  it('maps a missing object-store key to the same safe not-found response', async () => {
    mocks.findById.mockResolvedValue(template());
    mocks.getTemplateArtifactStream.mockRejectedValue(
      Object.assign(new Error('remote object missing'), { name: 'NoSuchKey' })
    );

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Template artifact is unavailable. Please contact support.',
    });
  });

  it('does not fetch an object for a caller who cannot read the template', async () => {
    mocks.findById.mockResolvedValue(template());
    mocks.canReadTemplate.mockReturnValue(false);

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.getTemplatePdfArtifact).not.toHaveBeenCalled();
    expect(mocks.getTemplateArtifactStream).not.toHaveBeenCalled();
  });

  it('deletes the record first, then delegates PDF/source cleanup to object storage', async () => {
    const record = template();
    mocks.findById.mockResolvedValue(record);

    const response = await DELETE(request('DELETE'), context());

    expect(response.status).toBe(200);
    expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: TEMPLATE_ID, isSystemTemplate: false });
    expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([PDF_ARTIFACT, SOURCE_ARTIFACT]);
    expect(mocks.deleteOne.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteTemplateArtifacts.mock.invocationCallOrder[0]
    );
  });

  it('does not remove local or remote artifacts for a caller who cannot manage the template', async () => {
    mocks.findById.mockResolvedValue(template());
    mocks.canManageTemplate.mockReturnValue(false);

    const response = await DELETE(request('DELETE'), context());

    expect(response.status).toBe(403);
    expect(mocks.deleteOne).not.toHaveBeenCalled();
    expect(mocks.deleteTemplateArtifacts).not.toHaveBeenCalled();
  });
});
