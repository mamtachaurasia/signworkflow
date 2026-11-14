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
    findById: vi.fn(),
  },
}));

vi.mock('@/models/Signature', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/models/Team', () => ({
  default: {
    find: vi.fn(),
  },
}));

import { GET as loadDocumentRoute } from '@/app/api/documents/load/route';
import { getAuthContext } from '@/lib/auth-context';
import { issueDocumentShareToken } from '@/lib/document-sharing';
import DocumentModel from '@/models/Document';
import TeamModel from '@/models/Team';

type MockedFindByIdModel = {
  findById: ReturnType<typeof vi.fn>;
};

type MockedTeamModel = {
  find: ReturnType<typeof vi.fn>;
};

const getAuthContextMock = vi.mocked(getAuthContext);
const documentModelMock = DocumentModel as unknown as MockedFindByIdModel;
const teamModelMock = TeamModel as unknown as MockedTeamModel;

function createTeamQuery(result: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createDocument(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    userId: 'owner-1',
    orgId: 'org-1',
    teamId: 'team-1',
    documentName: 'Contract',
    originalFileName: 'contract.pdf',
    currentVersion: 1,
    recipients: [],
    versions: [
      {
        version: 1,
        label: 'prepared',
        fields: [],
      },
    ],
    signingEvents: [],
    status: 'draft',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

function requestLoadDocument(options: { shareToken?: string } = {}) {
  const url = new URL('http://localhost:3000/api/documents/load');
  url.searchParams.set('id', '507f1f77bcf86cd799439011');
  if (options.shareToken) {
    url.searchParams.set('shareToken', options.shareToken);
  }

  return new NextRequest(url.toString());
}

describe('document load team access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a team member to load a team-routed document', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'user',
    });
    documentModelMock.findById.mockResolvedValue(createDocument());
    teamModelMock.find.mockImplementation((query: Record<string, unknown>) => {
      if (query.memberIds === 'user-1') {
        return createTeamQuery([{ _id: 'team-1' }]);
      }
      return createTeamQuery([]);
    });

    const req = requestLoadDocument();
    const res = await loadDocumentRoute(req);
    const payload = (await res.json()) as {
      success?: boolean;
      document?: {
        documentId?: string;
        teamId?: string | null;
        templatePreparation?: { fieldsNeedReview?: boolean };
      };
    };

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.document?.documentId).toBe('507f1f77bcf86cd799439011');
    expect(payload.document?.teamId).toBe('team-1');
    expect(payload.document?.templatePreparation?.fieldsNeedReview).toBe(false);
  });

  it('exposes a persisted template field-review requirement', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'owner-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    documentModelMock.findById.mockResolvedValue(createDocument({
      templatePreparation: {
        completed: true,
        variableValues: { company: 'Acme' },
        fieldsNeedReview: true,
      },
    }));
    teamModelMock.find.mockReturnValue(createTeamQuery([]));

    const res = await loadDocumentRoute(requestLoadDocument());
    const payload = (await res.json()) as {
      document?: { templatePreparation?: { fieldsNeedReview?: boolean } };
    };

    expect(res.status).toBe(200);
    expect(payload.document?.templatePreparation?.fieldsNeedReview).toBe(true);
  });

  it('blocks users who are outside the document team', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-2',
      orgId: 'org-1',
      orgRole: 'user',
    });
    documentModelMock.findById.mockResolvedValue(createDocument());
    teamModelMock.find.mockReturnValue(createTeamQuery([]));

    const req = requestLoadDocument();
    const res = await loadDocumentRoute(req);
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(403);
    expect(payload.message).toBe('Forbidden');
  });

  it('blocks stale share-token load for a logged-in user without independent access', async () => {
    const issuedShare = issueDocumentShareToken();
    getAuthContextMock.mockResolvedValue({
      userId: 'user-2',
      orgId: 'org-1',
      orgRole: 'user',
    });
    documentModelMock.findById.mockResolvedValue(
      createDocument({
        status: 'voided',
        sharedWith: [
          {
            email: 'viewer@example.com',
            access: 'can_view',
            shareTokenHash: issuedShare.tokenHash,
          },
        ],
      })
    );
    teamModelMock.find.mockReturnValue(createTeamQuery([]));

    const res = await loadDocumentRoute(requestLoadDocument({ shareToken: issuedShare.token }));
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(409);
    expect(payload.message).toBe('Document has been voided.');
  });

  it('blocks expired share-token load before returning document metadata', async () => {
    const issuedShare = issueDocumentShareToken();
    getAuthContextMock.mockResolvedValue(null);
    documentModelMock.findById.mockResolvedValue(
      createDocument({
        sharedWith: [
          {
            email: 'viewer@example.com',
            access: 'can_view',
            shareTokenHash: issuedShare.tokenHash,
          },
        ],
        versions: [
          {
            version: 1,
            label: 'prepared',
            expiresAt: new Date(Date.now() - 60_000),
            fields: [{ id: 'field-1', type: 'text', x: 0, y: 0, width: 10, height: 10, required: false }],
          },
        ],
      })
    );

    const res = await loadDocumentRoute(requestLoadDocument({ shareToken: issuedShare.token }));
    const payload = (await res.json()) as { message?: string; document?: unknown };

    expect(res.status).toBe(410);
    expect(payload.message).toBe('Signing link has expired');
    expect(payload.document).toBeUndefined();
  });

  it('does not downgrade independent workspace access when a share token is present', async () => {
    const issuedShare = issueDocumentShareToken();
    getAuthContextMock.mockResolvedValue({
      userId: 'admin-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
    documentModelMock.findById.mockResolvedValue(
      createDocument({
        status: 'voided',
        sharedWith: [
          {
            email: 'viewer@example.com',
            access: 'can_view',
            shareTokenHash: issuedShare.tokenHash,
          },
        ],
      })
    );

    const res = await loadDocumentRoute(requestLoadDocument({ shareToken: issuedShare.token }));
    const payload = (await res.json()) as { success?: boolean; document?: { status?: string } };

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.document?.status).toBe('voided');
  });

  it('does not expose elevated share role to an unrelated logged-in share-token viewer', async () => {
    const issuedShare = issueDocumentShareToken();
    getAuthContextMock.mockResolvedValue({
      userId: 'user-2',
      orgId: 'org-1',
      orgRole: 'user',
    });
    documentModelMock.findById.mockResolvedValue(
      createDocument({
        status: 'draft',
        sharedWith: [
          {
            email: 'editor@example.com',
            access: 'can_edit',
            shareTokenHash: issuedShare.tokenHash,
          },
        ],
      })
    );
    teamModelMock.find.mockReturnValue(createTeamQuery([]));

    const res = await loadDocumentRoute(requestLoadDocument({ shareToken: issuedShare.token }));
    const payload = (await res.json()) as { document?: { shareAccess?: string | null } };

    expect(res.status).toBe(200);
    expect(payload.document?.shareAccess).toBe('can_view');
  });
});
