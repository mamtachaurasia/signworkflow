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

vi.mock('@/models/Users', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('@/models/Team', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/lib/orgs', () => ({
  getMembershipRoleForUser: vi.fn(),
}));

vi.mock('@/lib/s3', () => ({
  getObjectStream: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendOwnerDocumentEventEmail: vi.fn(),
}));

import { GET as getDocumentRoute } from '@/app/api/documents/[documentId]/route';
import { getAuthContext } from '@/lib/auth-context';
import { getMembershipRoleForUser } from '@/lib/orgs';
import DocumentModel from '@/models/Document';
import TeamModel from '@/models/Team';
import UserModel from '@/models/Users';
import { issueDocumentShareToken } from '@/lib/document-sharing';

type MockedFindByIdModel = {
  findById: ReturnType<typeof vi.fn>;
};

type MockedTeamModel = {
  find: ReturnType<typeof vi.fn>;
};

const getAuthContextMock = vi.mocked(getAuthContext);
const getMembershipRoleForUserMock = vi.mocked(getMembershipRoleForUser);
const documentModelMock = DocumentModel as unknown as MockedFindByIdModel;
const userModelMock = UserModel as unknown as MockedFindByIdModel;
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
    _id: 'doc-1',
    userId: 'owner-1',
    orgId: 'org-1',
    teamId: 'team-1',
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
      },
    ],
    versions: [
      {
        version: 1,
        label: 'prepared',
        storage: {
          bucket: 'test-bucket',
          key: 'prepared.pdf',
          region: 'us-east-1',
        },
      },
    ],
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

async function requestDocumentAsJson(options: { shareToken?: string } = {}) {
  const url = new URL('http://localhost:3000/api/documents/doc-1');
  if (options.shareToken) {
    url.searchParams.set('shareToken', options.shareToken);
  }
  const req = new NextRequest(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });

  return getDocumentRoute(req, { params: Promise.resolve({ documentId: 'doc-1' }) });
}

describe('document view team access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows team members to view a team-routed document', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'user',
    });
    getMembershipRoleForUserMock.mockResolvedValue('user');
    userModelMock.findById.mockResolvedValue({
      _id: 'user-1',
      email: 'member@example.com',
    });
    documentModelMock.findById.mockResolvedValue(createDocument());
    teamModelMock.find.mockImplementation((query: Record<string, unknown>) => {
      if (query.memberIds === 'user-1') {
        return createTeamQuery([{ _id: 'team-1' }]);
      }
      return createTeamQuery([]);
    });

    const res = await requestDocumentAsJson();
    const payload = (await res.json()) as {
      documentId?: string;
      teamId?: string | null;
      recipients?: Array<Record<string, unknown>>;
      retention?: unknown;
    };

    expect(res.status).toBe(200);
    expect(payload.documentId).toBe('doc-1');
    expect(payload.teamId).toBe('team-1');
    expect(payload.recipients).toHaveLength(1);
    expect(payload.retention).toBeNull();
  });

  it('blocks users who are not owners, admins, recipients, or team members', async () => {
    getAuthContextMock.mockResolvedValue({
      userId: 'user-2',
      orgId: 'org-1',
      orgRole: 'user',
    });
    getMembershipRoleForUserMock.mockResolvedValue('user');
    userModelMock.findById.mockResolvedValue({
      _id: 'user-2',
      email: 'outside@example.com',
    });
    documentModelMock.findById.mockResolvedValue(createDocument());
    teamModelMock.find.mockReturnValue(createTeamQuery([]));

    const res = await requestDocumentAsJson();
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(403);
    expect(payload.message).toBe('Forbidden');
  });

  it('keeps share-token access restricted when an unrelated user is logged in', async () => {
    const issuedShare = issueDocumentShareToken();
    getAuthContextMock.mockResolvedValue({
      userId: 'user-2',
      orgId: 'org-1',
      orgRole: 'user',
    });
    getMembershipRoleForUserMock.mockResolvedValue('user');
    userModelMock.findById.mockResolvedValue({
      _id: 'user-2',
      email: 'outside@example.com',
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

    const res = await requestDocumentAsJson({ shareToken: issuedShare.token });
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(409);
    expect(payload.message).toBe('Document has been voided.');
  });

  it('does not downgrade independent workspace access when a share token is present', async () => {
    const issuedShare = issueDocumentShareToken();
    getAuthContextMock.mockResolvedValue({
      userId: 'admin-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
    getMembershipRoleForUserMock.mockResolvedValue('admin');
    userModelMock.findById.mockResolvedValue({
      _id: 'admin-1',
      email: 'admin@example.com',
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

    const res = await requestDocumentAsJson({ shareToken: issuedShare.token });
    const payload = (await res.json()) as { status?: string };

    expect(res.status).toBe(200);
    expect(payload.status).toBe('voided');
  });

  it('does not expose elevated share role to an unrelated logged-in share-token viewer', async () => {
    const issuedShare = issueDocumentShareToken();
    getAuthContextMock.mockResolvedValue({
      userId: 'user-2',
      orgId: 'org-1',
      orgRole: 'user',
    });
    getMembershipRoleForUserMock.mockResolvedValue('user');
    userModelMock.findById.mockResolvedValue({
      _id: 'user-2',
      email: 'outside@example.com',
    });
    documentModelMock.findById.mockResolvedValue(
      createDocument({
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

    const res = await requestDocumentAsJson({ shareToken: issuedShare.token });
    const payload = (await res.json()) as { shareAccess?: string | null };

    expect(res.status).toBe(200);
    expect(payload.shareAccess).toBe('can_view');
  });
});
