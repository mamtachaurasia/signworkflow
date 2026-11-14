import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { parseRecoveryHistoryQuery, WEBHOOK_HISTORY_STATUSES } from '@/lib/recovery-history';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), rules: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/auth-context', () => ({ getAuthContext: mocks.auth }));
vi.mock('@/lib/auth', () => ({ isSecureRequest: () => true, withSecurityHeaders: (_req: unknown, response: unknown) => response }));
vi.mock('@/lib/audit', () => ({ writeAuditEvent: vi.fn() }));
vi.mock('@/lib/role-utils', () => ({ isAdminRole: mocks.admin }));
vi.mock('@/lib/subscription-server', () => ({ getPlanGateForOrgFeature: async () => ({ allowed: true }) }));
vi.mock('@/lib/cloud/connections', () => ({ listWorkspaceCloudConnections: async () => [] }));
vi.mock('@/models/WebhookDelivery', () => ({ default: { find: mocks.find } }));
vi.mock('@/models/CloudExportJob', () => ({ default: { find: mocks.find } }));
vi.mock('@/models/WorkspaceCloudArchiveJob', () => ({ default: { find: mocks.find } }));
vi.mock('@/models/CloudExportRule', () => ({ default: { find: mocks.rules } }));
vi.mock('@/models/WorkspaceCloudArchiveRule', () => ({ default: { find: mocks.rules } }));
vi.mock('@/models/CloudConnection', () => ({ default: {} }));
vi.mock('@/models/WorkspaceCloudConnection', () => ({ default: {} }));
vi.mock('@/utils/db', () => ({ default: vi.fn() }));

import { GET as webhooks } from '@/app/api/v1/webhooks/deliveries/route';
import { GET as personal } from '@/app/api/cloud/auto-export/route';
import { GET as workspace } from '@/app/api/cloud/workspace-archive/route';

const at = new Date('2026-09-01T00:00:00.000Z');
const id = (value: number) => value.toString(16).padStart(24, '0');
const rows = Array.from({ length: 31 }, (_, index) => ({
  _id: id(31 - index), createdAt: at, orgId: 'org-1', userId: 'user-1',
  endpointId: id(99), documentId: id(100), status: index < 27 ? 'completed' : 'failed',
}));

describe('scoped recovery history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'owner' });
    mocks.admin.mockReturnValue(true);
    mocks.rules.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    mocks.find.mockImplementation((filter) => {
      const matching = rows.filter((row) => {
        if (filter.orgId !== row.orgId || (filter.userId && filter.userId !== row.userId)) return false;
        if (filter.status && !(typeof filter.status === 'string' ? row.status === filter.status : filter.status.$in.includes(row.status))) return false;
        return !filter.$or || row._id < String(filter.$or[1]._id.$lt);
      });
      const query = { select: vi.fn(() => query), sort: vi.fn(() => query), limit: vi.fn((limit: number) => ({ lean: async () => matching.slice(0, limit) })) };
      return query;
    });
  });

  it.each([{ name: 'webhooks', route: webhooks, key: 'deliveries' }, { name: 'personal', route: personal, key: 'jobs' }, { name: 'workspace', route: workspace, key: 'jobs' }])('finds older failures past the first page in $name history', async ({ route, key, name }) => {
    const first = await (await route(new NextRequest('https://example.com/history'))).json();
    expect(first[key]).toHaveLength(25);
    expect(first[key].every((row: { status: string }) => row.status === 'completed')).toBe(true);
    const second = await (await route(new NextRequest(`https://example.com/history?cursor=${first.nextCursor}`))).json();
    expect(second[key]).toHaveLength(6);
    expect(second[key].filter((row: { status: string }) => row.status === 'failed')).toHaveLength(4);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first[key], ...second[key]].map((row: { id: string }) => row.id)).size).toBe(31);
    expect(mocks.find).toHaveBeenLastCalledWith(expect.objectContaining({ orgId: 'org-1', ...(name === 'personal' ? { userId: 'user-1' } : {}), $or: expect.any(Array) }));

    const filtered = await (await route(new NextRequest('https://example.com/history?status=failures&limit=2'))).json();
    expect(filtered[key]).toHaveLength(2);
    expect(filtered[key].every((row: { status: string }) => row.status === 'failed')).toBe(true);
    const filteredNext = await (await route(new NextRequest(`https://example.com/history?status=failures&limit=2&cursor=${filtered.nextCursor}`))).json();
    expect(filteredNext[key]).toHaveLength(2);
    expect(filteredNext.nextCursor).toBeNull();

    mocks.auth.mockResolvedValue({ userId: 'user-1', orgId: 'org-other', orgRole: 'owner' });
    expect((await route(new NextRequest(`https://example.com/history?cursor=${first.nextCursor}`))).status).toBe(400);
    expect((await (await route(new NextRequest('https://example.com/history'))).json())[key]).toEqual([]);
  });

  it('does not permit personal history cursors from another user', async () => {
    const first = await (await personal(new NextRequest('https://example.com/history'))).json();
    mocks.auth.mockResolvedValue({ userId: 'other-user', orgId: 'org-1' });
    expect((await personal(new NextRequest(`https://example.com/history?cursor=${first.nextCursor}`))).status).toBe(400);
    expect((await (await personal(new NextRequest('https://example.com/history'))).json()).jobs).toEqual([]);
  });

  it.each(['limit=0', 'limit=101', 'limit=abc', 'limit=2.5', 'status=invalid', 'from=invalid', 'from=2026-02-30', 'from=2026-09-03&to=2026-09-01', 'cursor=garbage'])('rejects invalid query %s before querying jobs', async (query) => {
    for (const route of [webhooks, personal, workspace]) expect((await route(new NextRequest(`https://example.com/history?${query}`))).status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('keeps admin authorization on webhook and workspace histories', async () => {
    mocks.admin.mockReturnValue(false);
    expect((await webhooks(new NextRequest('https://example.com/history'))).status).toBe(403);
    expect((await workspace(new NextRequest('https://example.com/history'))).status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('binds cursors to endpoint/status/date filters and preserves inclusive date boundaries', () => {
    const params = new URLSearchParams('limit=1&status=failures&from=2026-09-01&to=2026-09-02');
    const scope = { orgId: 'org-1', endpointId: id(99) };
    const page = parseRecoveryHistoryQuery(params, scope, WEBHOOK_HISTORY_STATUSES);
    expect(page.filter.createdAt).toEqual({ $gte: at, $lte: new Date('2026-09-02T00:00:00.000Z') });
    params.set('cursor', page.page(rows.slice(0, 2)).nextCursor!);
    expect(() => parseRecoveryHistoryQuery(params, { ...scope, endpointId: id(98) }, WEBHOOK_HISTORY_STATUSES)).toThrow(/cursor/);
    params.set('status', 'failed');
    expect(() => parseRecoveryHistoryQuery(params, scope, WEBHOOK_HISTORY_STATUSES)).toThrow(/cursor/);
  });
});
