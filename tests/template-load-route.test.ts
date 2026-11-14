import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  connectDB: vi.fn(),
  findById: vi.fn(),
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
  },
}));

import { GET } from '@/app/api/templates/load/route';

describe('template load route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
  });

  it('allows a workspace admin to load a workspace-shared template', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'admin-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
    mocks.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      isSystemTemplate: false,
      userId: 'owner-1',
      orgId: 'org-1',
      sharingScope: 'workspace',
      name: 'Shared NDA',
      filePath: 'uploads/templates/shared-nda.pdf',
      fields: [],
      defaultSigners: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      category: 'Legal',
      description: 'Workspace shared template',
      pageCount: 2,
      fileSize: 12345,
      tags: ['nda'],
    });

    const req = new NextRequest('https://example.com/api/templates/load?id=507f1f77bcf86cd799439012');
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.template.name).toBe('Shared NDA');
    expect(payload.template.sharingScope).toBe('workspace');
    expect(payload.template.fieldLayoutStatus).toBe('current');
    expect(payload.template.layoutRevision).toBe(1);
    expect(payload.template.fieldLayoutRevision).toBe(1);
  });

  it('blocks users outside the workspace from loading a workspace-shared template', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'member-2',
      orgId: 'org-2',
      orgRole: 'user',
    });
    mocks.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      isSystemTemplate: false,
      userId: 'owner-1',
      orgId: 'org-1',
      sharingScope: 'workspace',
      name: 'Shared NDA',
      filePath: 'uploads/templates/shared-nda.pdf',
      fields: [],
      defaultSigners: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      category: 'Legal',
      description: 'Workspace shared template',
      pageCount: 2,
      fileSize: 12345,
      tags: ['nda'],
    });

    const req = new NextRequest('https://example.com/api/templates/load?id=507f1f77bcf86cd799439012');
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.message).toBe('Forbidden');
  });
});
