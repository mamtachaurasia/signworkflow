import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/utils/db', () => ({
  default: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/models/Document', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/subscription-server', () => ({
  getExpiredTrialWriteGuard: vi.fn(async () => ({ allowed: true })),
}));

import { POST as resetDocumentRoute } from '@/app/api/documents/[documentId]/reset/route';
import { getAuthContext } from '@/lib/auth-context';
import DocumentModel from '@/models/Document';

type MockedDocumentModel = {
  findOne: ReturnType<typeof vi.fn>;
};

const getAuthContextMock = vi.mocked(getAuthContext);
const documentModelMock = DocumentModel as unknown as MockedDocumentModel;

function createResettableDocument() {
  return {
    _id: 'doc-1',
    status: 'rejected',
    createdAt: new Date('2026-03-03T00:00:00.000Z'),
    updatedAt: new Date('2026-03-03T00:00:00.000Z'),
    recipients: [
      {
        id: 'r1',
        name: 'Recipient One',
        email: 'recipient.one@example.com',
        role: 'signer',
        status: 'rejected',
        rejectedAt: new Date('2026-03-04T00:00:00.000Z'),
        signingToken: 'token-r1',
        signingTokenHash: 'hash-r1',
      },
      {
        id: 'r2',
        name: 'Recipient Two',
        email: 'recipient.two@example.com',
        role: 'signer',
        status: 'sent',
      },
    ],
    toObject() {
      return {
        _id: this._id,
        status: this.status,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        recipients: this.recipients,
      };
    },
    async save() {
      this.updatedAt = new Date('2026-03-05T00:00:00.000Z');
      return this;
    },
  };
}

describe('document reset route security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated reset attempts', async () => {
    getAuthContextMock.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/documents/doc-1/reset', {
      method: 'POST',
    });

    const res = await resetDocumentRoute(req, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(401);
    expect(payload.message).toBe('Unauthorized');
    expect(documentModelMock.findOne).not.toHaveBeenCalled();
  });

  it('returns a sanitized document payload after a successful reset', async () => {
    getAuthContextMock.mockResolvedValue({ userId: 'owner-1', orgId: 'org-1', orgRole: 'owner' });
    documentModelMock.findOne.mockResolvedValue(createResettableDocument());

    const req = new NextRequest('http://localhost/api/documents/doc-1/reset', {
      method: 'POST',
    });

    const res = await resetDocumentRoute(req, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const payload = (await res.json()) as {
      success?: boolean;
      document?: { recipients?: Array<Record<string, unknown>>; status?: string };
    };
    const recipients = payload.document?.recipients ?? [];

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.document?.status).toBe('sent');
    expect(recipients[0]?.status).toBe('sent');
    expect(recipients[0]).not.toHaveProperty('signingToken');
    expect(recipients[0]).not.toHaveProperty('signingTokenHash');
  });
});
