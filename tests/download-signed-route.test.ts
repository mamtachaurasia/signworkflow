import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  connectDB: vi.fn(),
  findById: vi.fn(),
  resolveDocumentReadScope: vi.fn(),
  canReadDocument: vi.fn(),
  buildSignedDocumentPdf: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  unauthorizedResponse: vi.fn((payload) => Response.json(payload, { status: 401 })),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: {
    findById: mocks.findById,
  },
}));

vi.mock('@/lib/document-access', () => ({
  resolveDocumentReadScope: mocks.resolveDocumentReadScope,
  canReadDocument: mocks.canReadDocument,
}));

vi.mock('@/lib/signed-document-pdf', () => ({
  buildSignedDocumentPdf: mocks.buildSignedDocumentPdf,
}));

import { GET } from '@/app/api/documents/download-signed/route';

describe('download signed route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.getAuthContext.mockResolvedValue({
      userId: 'admin-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
    mocks.findById.mockResolvedValue({
      _id: 'doc-1',
      userId: 'owner-1',
      orgId: 'org-1',
      teamId: 'team-1',
      deletedAt: null,
      status: 'completed',
      documentName: 'Signed NDA',
    });
    mocks.resolveDocumentReadScope.mockResolvedValue({
      accessibleTeamIds: ['team-1'],
    });
    mocks.canReadDocument.mockReturnValue(true);
    mocks.buildSignedDocumentPdf.mockResolvedValue({
      buffer: Buffer.from('signed-pdf'),
      fileName: 'Signed NDA-signed.pdf',
    });
  });

  it('lets an authorized workspace reader download a completed signed PDF', async () => {
    const req = new NextRequest('https://example.com/api/documents/download-signed?documentId=doc-1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('Signed NDA-signed.pdf');
    expect(mocks.buildSignedDocumentPdf).toHaveBeenCalledWith({
      document: expect.objectContaining({ _id: 'doc-1' }),
      requesterUserId: 'admin-1',
    });
  });

  it('returns forbidden when the workspace user cannot read the document', async () => {
    mocks.canReadDocument.mockReturnValue(false);

    const req = new NextRequest('https://example.com/api/documents/download-signed?documentId=doc-1');
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
  });
});
