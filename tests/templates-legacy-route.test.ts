import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  find: vi.fn(),
  getAuthContext: vi.fn(),
  lean: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/auth-context', () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: { find: mocks.find },
}));

import { GET } from '@/app/api/templates/route';

describe('legacy template listing route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthContext.mockResolvedValue({ userId: 'user-1', orgId: 'org-1' });
    mocks.lean.mockResolvedValue([{ _id: 'template-1', documentName: 'Legacy template' }]);
    mocks.select.mockReturnValue({ lean: mocks.lean });
    mocks.find.mockReturnValue({ select: mocks.select });
  });

  it('keeps the legacy response but projects out document storage metadata', async () => {
    const response = await GET(new NextRequest('https://example.com/api/templates'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ _id: 'template-1', documentName: 'Legacy template' }]);
    expect(mocks.find).toHaveBeenCalledWith({ userId: 'user-1', orgId: 'org-1', isTemplate: true });
    expect(mocks.select).toHaveBeenCalledWith(
      '_id documentName originalFileName status currentVersion isTemplate createdAt updatedAt'
    );
  });

  it('does not query data for an unauthenticated caller', async () => {
    mocks.getAuthContext.mockResolvedValue(null);

    const response = await GET(new NextRequest('https://example.com/api/templates'));

    expect(response.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });
});
