import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  find: vi.fn(),
  aggregate: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
  verifyRetentionAdmin: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/admin-governance', () => ({
  verifyRetentionAdmin: mocks.verifyRetentionAdmin,
}));
vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature,
}));
vi.mock('@/models/AuditLog', () => ({
  default: { find: mocks.find, aggregate: mocks.aggregate, collection: { name: 'auditlogs' } },
}));

import { GET as exportAuditLogs } from '@/app/api/admin/audit/export/route';
import { GET as verifyAuditLogs } from '@/app/api/admin/audit/verify/route';

const ACTOR_ORG_ID = new mongoose.Types.ObjectId().toString();
const OTHER_ORG_ID = new mongoose.Types.ObjectId().toString();

function mockEmptyQuery() {
  const lean = vi.fn().mockResolvedValue([]);
  const limit = vi.fn(() => ({ lean }));
  const sort = vi.fn(() => ({ limit }));
  mocks.find.mockReturnValue({ sort });
  return { lean, limit, sort };
}

describe('admin audit workspace scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyRetentionAdmin.mockResolvedValue({
      authorized: true,
      actorId: new mongoose.Types.ObjectId().toString(),
      actorOrgId: ACTOR_ORG_ID,
      actorRole: 'admin',
    });
    mocks.getPlanGateForOrgFeature.mockResolvedValue({ allowed: true });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.aggregate.mockResolvedValue([]);
  });

  it.each([
    ['export', exportAuditLogs, '/api/admin/audit/export'],
    ['verify', verifyAuditLogs, '/api/admin/audit/verify'],
  ])('scopes an unfiltered session-admin %s query to the active workspace', async (_name, handler, path) => {
    mockEmptyQuery();

    const response = await handler(
      new NextRequest(`https://example.com${path}`)
    );

    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({
      orgId: new mongoose.Types.ObjectId(ACTOR_ORG_ID),
    });
  });

  it.each([
    ['export', exportAuditLogs, '/api/admin/audit/export'],
    ['verify', verifyAuditLogs, '/api/admin/audit/verify'],
  ])('rejects a session-admin %s query for another workspace', async (_name, handler, path) => {
    const response = await handler(
      new NextRequest(
        `https://example.com${path}?orgId=${OTHER_ORG_ID}`
      )
    );

    expect(response.status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.connectDB).not.toHaveBeenCalled();
  });

  it.each([
    ['export', exportAuditLogs, '/api/admin/audit/export'],
    ['verify', verifyAuditLogs, '/api/admin/audit/verify'],
  ])('accepts an equivalent session-admin %s workspace ObjectId', async (_name, handler, path) => {
    mockEmptyQuery();

    const response = await handler(
      new NextRequest(
        `https://example.com${path}?orgId=${ACTOR_ORG_ID.toUpperCase()}`
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith({
      orgId: new mongoose.Types.ObjectId(ACTOR_ORG_ID),
    });
  });

  it.each([
    ['export', exportAuditLogs, '/api/admin/audit/export'],
    ['verify', verifyAuditLogs, '/api/admin/audit/verify'],
  ])('preserves global filtering for a valid retention-admin token actor on %s', async (_name, handler, path) => {
    mocks.verifyRetentionAdmin.mockResolvedValue({ authorized: true });
    mockEmptyQuery();

    const response = await handler(
      new NextRequest(
        `https://example.com${path}?orgId=${OTHER_ORG_ID}`
      )
    );

    expect(response.status).toBe(200);
    if (handler === verifyAuditLogs) {
      expect(mocks.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $match: { orgId: new mongoose.Types.ObjectId(OTHER_ORG_ID) } },
      ]));
    } else {
      expect(mocks.find).toHaveBeenCalledWith({ orgId: new mongoose.Types.ObjectId(OTHER_ORG_ID) });
    }
  });
});
