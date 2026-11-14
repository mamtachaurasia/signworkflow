import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/utils/db', () => ({
  default: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/models/Document', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Team', () => ({
  default: {
    find: vi.fn(),
  },
}));

import { GET as getDocumentsRoute } from '@/app/api/documents/list/route';
import { getAuthContext } from '@/lib/auth-context';
import DocumentModel from '@/models/Document';
import TeamModel from '@/models/Team';

type AwaitableQuery<T> = {
  select: ReturnType<typeof vi.fn>;
  sort: ReturnType<typeof vi.fn>;
  skip: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  lean: ReturnType<typeof vi.fn>;
  then: Promise<T>['then'];
  catch: Promise<T>['catch'];
  finally: Promise<T>['finally'];
};

type MockedDocumentModel = {
  find: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
};

type MockedTeamModel = {
  find: ReturnType<typeof vi.fn>;
};

const getAuthContextMock = vi.mocked(getAuthContext);
const documentModelMock = DocumentModel as unknown as MockedDocumentModel;
const teamModelMock = TeamModel as unknown as MockedTeamModel;

function createAwaitableQuery<T>(result: T): AwaitableQuery<T> {
  const promise = Promise.resolve(result);
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  } as AwaitableQuery<T>;

  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.lean.mockReturnValue(query);

  return query;
}

function createTeamQuery(result: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createDocument(overrides: Partial<Record<string, unknown>> = {}) {
  const document = {
    _id: '507f1f77bcf86cd799439011',
    userId: 'owner-1',
    documentName: 'Contract',
    originalFileName: 'contract.pdf',
    versions: [],
    recipients: [],
    status: 'draft',
    deletedAt: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };

  return {
    ...document,
    toObject: () => ({ ...document }),
  };
}

describe('document list team access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns own and team documents for non-admin users', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'user',
    });

    const documents = [
      createDocument({ _id: 'doc-own', userId: 'user-1', orgId: 'org-1' }),
      createDocument({ _id: 'doc-team', userId: 'owner-1', orgId: 'org-1', teamId: 'team-1' }),
    ];

    documentModelMock.find.mockImplementation((query: Record<string, unknown>) => {
      expect(query).toEqual({
        orgId: 'org-1',
        $or: [{ userId: 'user-1' }, { teamId: { $in: ['team-1'] } }],
      });
      return createAwaitableQuery(documents);
    });
    documentModelMock.countDocuments.mockResolvedValue(2);
    teamModelMock.find.mockImplementation((query: Record<string, unknown>) => {
      if (query.memberIds === 'user-1') {
        return createTeamQuery([{ _id: 'team-1' }]);
      }

      return createTeamQuery([{ _id: 'team-1', name: 'Sales' }]);
    });

    const req = new NextRequest('http://localhost:3000/api/documents/list');
    const res = await getDocumentsRoute(req);
    const payload = (await res.json()) as {
      success?: boolean;
      documents?: Array<{ id: string; teamId?: string | null; teamName?: string | null }>;
    };

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.documents?.map((doc) => doc.id)).toEqual(['doc-own', 'doc-team']);
    expect(payload.documents?.find((doc) => doc.id === 'doc-team')).toMatchObject({
      teamId: 'team-1',
      teamName: 'Sales',
    });
    expect(documentModelMock.countDocuments).not.toHaveBeenCalled();
  });

  it('uses org-wide scope for auditors and admins', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'auditor-1',
      orgId: 'org-1',
      orgRole: 'auditor',
    });

    documentModelMock.find.mockImplementation((query: Record<string, unknown>) => {
      expect(query).toEqual({ orgId: 'org-1' });
      return createAwaitableQuery([createDocument({ _id: 'doc-org', orgId: 'org-1' })]);
    });
    documentModelMock.countDocuments.mockResolvedValue(1);
    teamModelMock.find.mockReturnValue(createTeamQuery([]));

    const req = new NextRequest('http://localhost:3000/api/documents/list');
    const res = await getDocumentsRoute(req);
    const payload = (await res.json()) as { documents?: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(payload.documents?.map((doc) => doc.id)).toEqual(['doc-org']);
  });

  it('returns personal documents for users without an organization workspace', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });

    documentModelMock.find.mockImplementation((query: Record<string, unknown>) => {
      expect(query).toEqual({
        userId: 'user-1',
        $or: [{ orgId: { $exists: false } }, { orgId: null }],
      });
      return createAwaitableQuery([
        createDocument({ _id: 'doc-personal', userId: 'user-1', orgId: null }),
      ]);
    });
    documentModelMock.countDocuments.mockResolvedValue(1);
    teamModelMock.find.mockReturnValue(createTeamQuery([]));

    const req = new NextRequest('http://localhost:3000/api/documents/list');
    const res = await getDocumentsRoute(req);
    const payload = (await res.json()) as { documents?: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(payload.documents?.map((doc) => doc.id)).toEqual(['doc-personal']);
  });

  it('uses a lean, narrow projection and only counts paginated results', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });

    const documentQuery = createAwaitableQuery([
      createDocument({
        versions: [
          {
            version: 1,
            label: 'draft',
            sentAt: new Date('2026-03-02T00:00:00.000Z'),
            expiresAt: new Date('2026-03-10T00:00:00.000Z'),
          },
        ],
        currentVersion: 1,
      }),
    ]);
    documentModelMock.find.mockReturnValue(documentQuery);
    documentModelMock.countDocuments.mockResolvedValue(1);
    teamModelMock.find.mockReturnValue(createTeamQuery([]));

    const req = new NextRequest('http://localhost:3000/api/documents/list?page=2&limit=10');
    const res = await getDocumentsRoute(req);
    const payload = (await res.json()) as {
      pagination?: { page: number; limit: number; total: number; pages: number };
      documents?: Array<{ totalVersions: number; lastSentAt?: string; expiresAt?: string }>;
    };

    expect(res.status).toBe(200);
    expect(documentQuery.skip).toHaveBeenCalledWith(10);
    expect(documentQuery.limit).toHaveBeenCalledWith(10);
    expect(documentQuery.lean).toHaveBeenCalledTimes(1);
    expect(documentModelMock.countDocuments).toHaveBeenCalledTimes(1);
    expect(payload.pagination).toEqual({ page: 2, limit: 10, total: 1, pages: 1 });
    expect(payload.documents?.[0]).toMatchObject({
      totalVersions: 1,
      lastSentAt: '2026-03-02T00:00:00.000Z',
      expiresAt: '2026-03-10T00:00:00.000Z',
    });

    const projection = String(documentQuery.select.mock.calls[0]?.[0]);
    expect(projection).toContain('versions.version');
    expect(projection).toContain('versions.label');
    expect(projection).toContain('versions.sentAt');
    expect(projection).toContain('versions.expiresAt');
    expect(projection).not.toContain('versions.pdfData');
    expect(projection).not.toContain('versions.fields');
    expect(projection).not.toContain('versions.editHistory');
    expect(projection).not.toContain('versions.storage');
  });
});
