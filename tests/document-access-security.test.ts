import { Readable } from 'node:stream';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/utils/db', () => ({
  default: vi.fn(async () => undefined),
}));

vi.mock('@/lib/api-helpers', () => ({
  getAuthSession: vi.fn(),
}));

vi.mock('@/lib/s3', () => ({
  getObjectStream: vi.fn(),
}));

vi.mock('@/models/Document', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('@/models/Users', () => ({
  default: {
    findById: vi.fn(),
  },
}));

import { GET as getDocumentRoute } from '@/app/api/documents/[documentId]/route';
import { getAuthSession } from '@/lib/api-helpers';
import { getObjectStream } from '@/lib/s3';
import DocumentModel from '@/models/Document';
import UserModel from '@/models/Users';

type MockedModel = {
  findById: ReturnType<typeof vi.fn>;
};

const documentModelMock = DocumentModel as unknown as MockedModel;
const userModelMock = UserModel as unknown as MockedModel;
const getAuthSessionMock = vi.mocked(getAuthSession);
const getObjectStreamMock = vi.mocked(getObjectStream);

function createDocument(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: 'doc-1',
    userId: 'owner-1',
    documentName: 'Contract',
    originalFileName: 'contract.pdf',
    currentVersion: 1,
    status: 'sent',
    signingMode: 'parallel',
    deletedAt: null,
    derivedFromDocumentId: null,
    derivedFromVersion: null,
    completedAt: null,
    finalizedAt: null,
    recipients: [
      {
        id: 'r1',
        email: 'recipient.one@example.com',
        name: 'Recipient One',
        role: 'signer',
        status: 'sent',
        order: 1,
        isCC: false,
        color: '#000000',
        sendReminders: false,
        captureGpsLocation: false,
        signingToken: 'token-r1',
      },
      {
        id: 'r2',
        email: 'recipient.two@example.com',
        name: 'Recipient Two',
        role: 'signer',
        status: 'pending',
        order: 2,
        isCC: false,
        color: '#000000',
        sendReminders: false,
        captureGpsLocation: false,
        signingToken: 'token-r2',
      },
    ],
    versions: [
      {
        version: 1,
        label: 'prepared',
        expiresAt: null,
        storage: {
          bucket: 'test-bucket',
          key: 'prepared.pdf',
          region: 'us-east-1',
        },
      },
    ],
    createdAt: new Date('2026-03-03T00:00:00.000Z'),
    updatedAt: new Date('2026-03-03T00:00:00.000Z'),
    ...overrides,
  };
}

async function requestDocument(args: {
  documentId?: string;
  token?: string;
  accept?: string;
}) {
  const documentId = args.documentId ?? 'doc-1';
  const url = new URL(`http://localhost:3000/api/documents/${documentId}`);
  if (args.token) {
    url.searchParams.set('token', args.token);
  }
  const req = new NextRequest(url.toString(), {
    method: 'GET',
    headers: {
      accept: args.accept ?? 'application/pdf',
    },
  });
  return getDocumentRoute(req, { params: Promise.resolve({ documentId }) });
}

describe('document access security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getObjectStreamMock.mockResolvedValue(Readable.from([Buffer.from('%PDF-1.4')]) as unknown as never);
  });

  it('blocks token-only PDF fetch for voided documents', async () => {
    getAuthSessionMock.mockResolvedValue(null);
    documentModelMock.findById.mockResolvedValue(createDocument({ status: 'voided' }));

    const res = await requestDocument({ token: 'token-r1', accept: 'application/pdf' });
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(409);
    expect(payload.message).toBe('Document has been voided.');
    expect(getObjectStreamMock).not.toHaveBeenCalled();
  });

  it('blocks token-only PDF fetch for expired signing links', async () => {
    getAuthSessionMock.mockResolvedValue(null);
    documentModelMock.findById.mockResolvedValue(
      createDocument({
        versions: [
          {
            version: 1,
            label: 'prepared',
            expiresAt: new Date(Date.now() - 60_000),
            storage: {
              bucket: 'test-bucket',
              key: 'prepared.pdf',
              region: 'us-east-1',
            },
          },
        ],
      })
    );

    const res = await requestDocument({ token: 'token-r1', accept: 'application/pdf' });
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(410);
    expect(payload.message).toBe('Signing link has expired');
    expect(getObjectStreamMock).not.toHaveBeenCalled();
  });

  it('blocks recipient-email PDF fetch for voided documents', async () => {
    getAuthSessionMock.mockResolvedValue('user-1');
    userModelMock.findById.mockResolvedValue({
      _id: 'user-1',
      role: 'user',
      email: 'recipient.one@example.com',
    });
    documentModelMock.findById.mockResolvedValue(createDocument({ status: 'voided' }));

    const res = await requestDocument({ accept: 'application/pdf' });
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(409);
    expect(payload.message).toBe('Document has been voided.');
    expect(getObjectStreamMock).not.toHaveBeenCalled();
  });

  it('blocks recipient-email PDF fetch for expired signing links', async () => {
    getAuthSessionMock.mockResolvedValue('user-1');
    userModelMock.findById.mockResolvedValue({
      _id: 'user-1',
      role: 'user',
      email: 'recipient.one@example.com',
    });
    documentModelMock.findById.mockResolvedValue(
      createDocument({
        versions: [
          {
            version: 1,
            label: 'prepared',
            expiresAt: new Date(Date.now() - 60_000),
            storage: {
              bucket: 'test-bucket',
              key: 'prepared.pdf',
              region: 'us-east-1',
            },
          },
        ],
      })
    );

    const res = await requestDocument({ accept: 'application/pdf' });
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(410);
    expect(payload.message).toBe('Signing link has expired');
    expect(getObjectStreamMock).not.toHaveBeenCalled();
  });

  it('limits JSON recipient projection to the matched recipient for recipient-email access', async () => {
    getAuthSessionMock.mockResolvedValue('user-1');
    userModelMock.findById.mockResolvedValue({
      _id: 'user-1',
      role: 'user',
      email: 'recipient.one@example.com',
    });
    documentModelMock.findById.mockResolvedValue(createDocument());

    const res = await requestDocument({ accept: 'application/json' });
    const payload = (await res.json()) as { recipients?: Array<Record<string, unknown>> };
    const recipients = payload.recipients ?? [];

    expect(res.status).toBe(200);
    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.email).toBe('recipient.one@example.com');
    expect(recipients[0]).not.toHaveProperty('signingToken');
    expect(recipients.some((recipient) => recipient.email === 'recipient.two@example.com')).toBe(false);
  });
});
