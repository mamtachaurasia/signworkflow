import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/retention-admin', () => ({
  verifyRetentionAdmin: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: vi.fn(() =>
    Promise.resolve({ allowed: true, plan: 'enterprise', normalizedTier: 'enterprise' })
  ),
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

vi.mock('@/models/LegalHold', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/models/Document', () => ({
  default: {
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import { POST } from '@/app/api/retention/holds/[holdId]/release/route';
import { getAuthContext } from '@/lib/auth-context';
import { verifyRetentionAdmin } from '@/lib/retention-admin';
import { buildRetentionUpdatePayload, computeRetentionFields } from '@/lib/retention';
import LegalHoldModel from '@/models/LegalHold';
import DocumentModel from '@/models/Document';

const verifyRetentionAdminMock = vi.mocked(verifyRetentionAdmin);
const getAuthContextMock = vi.mocked(getAuthContext);
const computeRetentionFieldsMock = vi.mocked(computeRetentionFields);
const buildRetentionUpdatePayloadMock = vi.mocked(buildRetentionUpdatePayload);

const legalHoldModelMock = LegalHoldModel as unknown as {
  findOne: ReturnType<typeof vi.fn>;
};

const documentModelMock = DocumentModel as unknown as {
  updateMany: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
};

function createFindMock(value: unknown) {
  return {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

describe('legal hold release route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRetentionAdminMock.mockResolvedValue({ authorized: true });
    getAuthContextMock.mockResolvedValue({
      userId: 'admin-1',
      orgId: 'org-1',
      orgRole: 'admin',
    });
    computeRetentionFieldsMock.mockResolvedValue({
      policy: {
        name: 'Org Policy',
      },
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

  it('recomputes retention when the last legal hold is released', async () => {
    const holdSave = vi.fn().mockResolvedValue(undefined);
    legalHoldModelMock.findOne.mockResolvedValue({
      _id: 'hold-1',
      orgId: 'org-1',
      status: 'active',
      releasedAt: null,
      documentIds: ['doc-1'],
      save: holdSave,
    });
    documentModelMock.updateMany.mockResolvedValue({ acknowledged: true });
    documentModelMock.countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    documentModelMock.find.mockReturnValue(
      createFindMock([
        {
          _id: 'doc-1',
          orgId: 'org-1',
          retention: {
            status: 'on_hold',
            docType: 'msa',
            jurisdiction: 'IN',
          },
          legalHold: {
            status: 'active',
            holdIds: [],
          },
        },
      ])
    );
    documentModelMock.findOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'doc-1' }),
    });

    const req = new NextRequest('http://localhost/api/retention/holds/hold-1/release', {
      method: 'POST',
    });

    const res = await POST(req, { params: Promise.resolve({ holdId: 'hold-1' }) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(legalHoldModelMock.findOne).toHaveBeenCalledWith({
      _id: 'hold-1',
      orgId: 'org-1',
    });
    expect(holdSave).toHaveBeenCalled();
    expect(computeRetentionFieldsMock).toHaveBeenCalled();
    expect(documentModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: { $in: ['doc-1'] },
        orgId: 'org-1',
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
    expect(payload.releasedDocuments).toHaveLength(1);
    expect(payload.releasedDocuments[0]).toEqual(
      expect.objectContaining({
        documentId: 'doc-1',
        retention: expect.objectContaining({
          status: 'active',
          docType: 'msa',
          jurisdiction: 'IN',
        }),
        legalHold: expect.objectContaining({
          status: 'none',
          holdIds: [],
        }),
      })
    );
    expect(payload.recompute).toEqual(
      expect.objectContaining({
        attemptedCount: 1,
        recomputedCount: 1,
        remainingCount: 0,
        capped: false,
        batchSize: 100,
      })
    );
  });

  it('caps recompute work and skips writes if a new hold is applied concurrently', async () => {
    const holdSave = vi.fn().mockResolvedValue(undefined);
    legalHoldModelMock.findOne.mockResolvedValue({
      _id: 'hold-1',
      orgId: 'org-1',
      status: 'active',
      releasedAt: null,
      documentIds: ['doc-1'],
      save: holdSave,
    });
    documentModelMock.updateMany.mockResolvedValue({ acknowledged: true });
    documentModelMock.countDocuments
      .mockResolvedValueOnce(150)
      .mockResolvedValueOnce(50);
    documentModelMock.find.mockReturnValue(
      createFindMock([
        {
          _id: 'doc-1',
          orgId: 'org-1',
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

    const req = new NextRequest('http://localhost/api/retention/holds/hold-1/release', {
      method: 'POST',
    });

    const res = await POST(req, { params: Promise.resolve({ holdId: 'hold-1' }) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(documentModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: { $in: ['doc-1'] },
        orgId: 'org-1',
        'retention.status': 'on_hold',
        'legalHold.holdIds.0': { $exists: false },
      }),
      expect.any(Object),
      { new: true }
    );
    expect(payload.releasedDocuments).toEqual([]);
    expect(payload.recompute).toEqual(
      expect.objectContaining({
        attemptedCount: 1,
        recomputedCount: 0,
        remainingCount: 50,
        capped: true,
        batchSize: 100,
      })
    );
  });
});
