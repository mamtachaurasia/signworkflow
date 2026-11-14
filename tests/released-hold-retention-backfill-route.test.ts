import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/retention-admin', () => ({
  verifyRetentionAdmin: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/retention', () => ({
  computeRetentionFields: vi.fn(),
  buildRetentionUpdatePayload: vi.fn(),
}));

vi.mock('@/models/Document', () => ({
  default: {
    countDocuments: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import { POST } from '@/app/api/retention/holds/backfill-released/route';
import { writeAuditEvent } from '@/lib/audit';
import { verifyRetentionAdmin } from '@/lib/retention-admin';
import { buildRetentionUpdatePayload, computeRetentionFields } from '@/lib/retention';
import DocumentModel from '@/models/Document';

const verifyRetentionAdminMock = vi.mocked(verifyRetentionAdmin);
const writeAuditEventMock = vi.mocked(writeAuditEvent);
const computeRetentionFieldsMock = vi.mocked(computeRetentionFields);
const buildRetentionUpdatePayloadMock = vi.mocked(buildRetentionUpdatePayload);

const documentModelMock = DocumentModel as unknown as {
  countDocuments: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
};

function createFindMock(value: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

describe('released hold retention backfill route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRetentionAdminMock.mockResolvedValue({
      authorized: true,
      actorId: 'admin-1',
      actorOrgId: 'org-1',
      actorRole: 'admin',
    });
    computeRetentionFieldsMock.mockResolvedValue({
      policy: { name: 'Org Policy' },
      triggerEvent: 'completedAt',
      triggerAt: new Date('2026-01-01T00:00:00.000Z'),
      startAt: new Date('2026-01-01T00:00:00.000Z'),
      endAt: new Date('2027-01-01T00:00:00.000Z'),
      status: 'active',
    });
    buildRetentionUpdatePayloadMock.mockReturnValue({
      'retention.status': 'active',
      'retention.policy': { name: 'Org Policy' },
      'retention.lastEvaluatedAt': new Date('2026-02-01T00:00:00.000Z'),
    });
  });

  it('runs dry-run scoped to the active organization without writing changes', async () => {
    documentModelMock.countDocuments.mockResolvedValue(2);
    documentModelMock.find.mockReturnValue(
      createFindMock([
        {
          _id: 'doc-1',
          orgId: 'org-1',
          retention: { status: 'on_hold', docType: 'msa' },
          legalHold: { status: 'none', holdIds: [] },
        },
      ])
    );

    const req = new NextRequest('http://localhost/api/retention/holds/backfill-released', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true, limit: 50 }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(documentModelMock.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        'retention.status': 'on_hold',
        'legalHold.holdIds.0': { $exists: false },
      })
    );
    expect(documentModelMock.findOneAndUpdate).not.toHaveBeenCalled();
    expect(payload).toEqual(
      expect.objectContaining({
        dryRun: true,
        totalCandidates: 2,
        processedCount: 1,
        updatedCount: 0,
        remainingCandidates: 1,
        orgId: 'org-1',
      })
    );
  });

  it('rejects an organization admin trying to run the backfill for another organization', async () => {
    const req = new NextRequest('http://localhost/api/retention/holds/backfill-released', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-2' }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.message).toBe('You can only run this backfill for your active workspace');
    expect(documentModelMock.countDocuments).not.toHaveBeenCalled();
  });

  it('recomputes and persists released-hold retention updates', async () => {
    verifyRetentionAdminMock.mockResolvedValue({ authorized: true });
    documentModelMock.countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    documentModelMock.find.mockReturnValue(
      createFindMock([
        {
          _id: 'doc-9',
          orgId: 'org-9',
          retention: {
            status: 'on_hold',
            docType: 'msa',
            jurisdiction: 'IN',
          },
          legalHold: {
            status: 'none',
            holdIds: [],
          },
        },
      ])
    );
    documentModelMock.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'doc-9' }),
    });

    const req = new NextRequest('http://localhost/api/retention/holds/backfill-released', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-9', limit: 10 }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(computeRetentionFieldsMock).toHaveBeenCalled();
    expect(documentModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: { $in: ['doc-9'] },
        orgId: 'org-9',
        'retention.status': 'on_hold',
        'legalHold.holdIds.0': { $exists: false },
        $or: [{ 'legalHold.status': { $exists: false } }, { 'legalHold.status': 'none' }],
      },
      {
        $set: expect.objectContaining({
          'legalHold.status': 'none',
          'legalHold.holdIds': [],
          'retention.status': 'active',
        }),
      },
      { new: true }
    );
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'retention_released_hold_backfill',
        orgId: 'org-9',
      })
    );
    expect(payload).toEqual(
      expect.objectContaining({
        dryRun: false,
        totalCandidates: 1,
        processedCount: 1,
        updatedCount: 1,
        remainingCandidates: 0,
        orgId: 'org-9',
      })
    );
  });

  it('does not overwrite a document that received a new hold mid-backfill', async () => {
    verifyRetentionAdminMock.mockResolvedValue({ authorized: true });
    documentModelMock.countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    documentModelMock.find.mockReturnValue(
      createFindMock([
        {
          _id: 'doc-9',
          orgId: 'org-9',
          retention: {
            status: 'on_hold',
            docType: 'msa',
          },
          legalHold: {
            status: 'none',
            holdIds: [],
          },
        },
      ])
    );
    documentModelMock.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    const req = new NextRequest('http://localhost/api/retention/holds/backfill-released', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-9', limit: 10 }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        dryRun: false,
        totalCandidates: 1,
        processedCount: 1,
        updatedCount: 0,
        remainingCandidates: 0,
        orgId: 'org-9',
      })
    );
  });
});
