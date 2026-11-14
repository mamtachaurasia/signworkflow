import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type TrialHandler = (
  request: NextRequest,
  context: unknown,
  auth: { userId: string; orgId: string | null; orgRole: string } | null
) => Promise<Response>;
type Auth = { userId: string; orgId: string | null; orgRole: string } | null;

const mocks = vi.hoisted(() => ({
  auth: { userId: 'user-1', orgId: null, orgRole: 'owner' } as Auth,
  connectDB: vi.fn(),
  createDocumentFromTemplateRecord: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/template-documents', () => ({
  createDocumentFromTemplateRecord: mocks.createDocumentFromTemplateRecord,
}));
vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: { findOne: mocks.findOne },
}));
vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (request: NextRequest, context: unknown) => handler(request, context, mocks.auth),
}));

import { POST } from '@/app/api/documents/sample/route';

describe('sample document route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = { userId: 'user-1', orgId: null, orgRole: 'owner' };
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.createDocumentFromTemplateRecord.mockResolvedValue({
      documentId: 'document-1', sessionId: 'session-1', fields: [{ id: 'signature-1' }], recipients: [],
    });
  });

  it('creates a builder-ready copy from the curated Mutual NDA', async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'template-1', fields: [{ id: 'signature-1' }] }),
    });

    const response = await POST(new NextRequest('https://example.com/api/documents/sample', { method: 'POST' }), {});
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.findOne).toHaveBeenCalledWith(expect.objectContaining({
      isSystemTemplate: true,
      tags: 'curated-slug:professional-mutual-nda',
    }));
    expect(mocks.createDocumentFromTemplateRecord).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'user-1',
      documentName: 'Sample Mutual NDA',
      deferPreparation: true,
    }));
    expect(payload).toMatchObject({ success: true, documentId: 'document-1', fields: [{ id: 'signature-1' }] });
  });

  it('returns a clear unavailable response when the curated sample is not seeded', async () => {
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const response = await POST(new NextRequest('https://example.com/api/documents/sample', { method: 'POST' }), {});

    expect(response.status).toBe(503);
    expect(mocks.createDocumentFromTemplateRecord).not.toHaveBeenCalled();
  });
});
