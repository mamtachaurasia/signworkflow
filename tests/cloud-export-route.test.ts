import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
  connectDB: vi.fn(),
  documentFindById: vi.fn(),
  organizationFindById: vi.fn(),
  resolveDocumentReadScope: vi.fn(),
  canReadDocument: vi.fn(),
  buildSignedDocumentPdf: vi.fn(),
  exportPdfToConnectedProvider: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature,
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: {
    findById: mocks.documentFindById,
  },
}));

vi.mock('@/models/Organization', () => ({
  __esModule: true,
  default: {
    findById: mocks.organizationFindById,
  },
}));

vi.mock('@/lib/document-access', () => ({
  resolveDocumentReadScope: mocks.resolveDocumentReadScope,
  canReadDocument: mocks.canReadDocument,
}));

vi.mock('@/lib/signed-document-pdf', () => ({
  buildSignedDocumentPdf: mocks.buildSignedDocumentPdf,
}));

vi.mock('@/lib/cloud/connections', () => ({
  exportPdfToConnectedProvider: mocks.exportPdfToConnectedProvider,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

import { POST } from '@/app/api/cloud/export/route';

describe('cloud export route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
    mocks.getPlanGateForOrgFeature.mockResolvedValue({
      allowed: true,
      status: 200,
      message: null,
    });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.documentFindById.mockResolvedValue({
      _id: 'doc-1',
      userId: 'owner-1',
      orgId: 'org-1',
      teamId: 'team-1',
      deletedAt: null,
      status: 'completed',
      documentName: 'Mutual NDA',
    });
    mocks.resolveDocumentReadScope.mockResolvedValue({
      accessibleTeamIds: ['team-1'],
    });
    mocks.canReadDocument.mockReturnValue(true);
    mocks.organizationFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ name: 'Acme Workspace' }),
      }),
    });
    mocks.buildSignedDocumentPdf.mockResolvedValue({
      buffer: Buffer.from('pdf-data'),
      fileName: 'Mutual NDA-signed.pdf',
    });
    mocks.exportPdfToConnectedProvider.mockResolvedValue({
      providerFileId: 'file-1',
      providerFileName: 'Acme Workspace - Mutual NDA-signed.pdf',
      providerUrl: 'https://drive.example.test/file-1',
    });
  });

  it('exports a completed signed PDF to the connected provider for an authorized workspace reader', async () => {
    const req = new NextRequest('https://example.com/api/cloud/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'google_drive',
        documentId: 'doc-1',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.message).toMatch(/exported to google drive/i);
    expect(mocks.buildSignedDocumentPdf).toHaveBeenCalledWith({
      document: expect.objectContaining({ _id: 'doc-1' }),
      requesterUserId: 'user-1',
    });
    expect(mocks.exportPdfToConnectedProvider).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'google_drive',
      fileName: 'Mutual NDA-signed.pdf',
      contentType: 'application/pdf',
      fileBuffer: Buffer.from('pdf-data'),
      workspaceName: 'Acme Workspace',
    });
  });

  it('blocks exports for users without document read access', async () => {
    mocks.canReadDocument.mockReturnValue(false);

    const req = new NextRequest('https://example.com/api/cloud/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'google_drive',
        documentId: 'doc-1',
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.message).toBe('Forbidden');
    expect(mocks.buildSignedDocumentPdf).not.toHaveBeenCalled();
    expect(mocks.exportPdfToConnectedProvider).not.toHaveBeenCalled();
  });
});
