import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

vi.mock('@/lib/webhooks', () => ({ dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/admin-governance', () => ({
  verifyRetentionAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}));
vi.mock('@/lib/subscription-server', () => ({ getPlanGateForOrgFeature: vi.fn() }));

import { writeAuditEvent } from '@/lib/audit';
import AuditLogModel from '@/models/AuditLog';
import { GET as verifyAudit } from '@/app/api/admin/audit/verify/route';

describe('audit chain appends on standalone MongoDB', () => {
  beforeAll(async () => {
    process.env.AUDIT_LOG_HASH_PEPPER = 'audit-concurrency-test';
    await connectTestDb();
  });

  beforeEach(async () => { await AuditLogModel.deleteMany({}); });
  afterAll(async () => { await disconnectTestDb(); });

  async function expectValidChain(count: number) {
    const logs = await AuditLogModel.find().sort({ createdAt: 1, _id: 1 }).lean();
    expect(logs).toHaveLength(count);
    expect(logs[0].prevHash).toBe('');
    for (let index = 1; index < logs.length; index += 1) {
      expect(logs[index].prevHash).toBe(logs[index - 1].hash);
      expect(logs[index].createdAt.getTime()).toBeGreaterThan(logs[index - 1].createdAt.getTime());
    }
    const response = await verifyAudit(new NextRequest('https://example.test/api/admin/audit/verify?limit=1000'));
    expect(await response.json()).toMatchObject({ ok: true, checked: count, mismatches: [], partialChains: 0 });
    return logs;
  }

  it('serializes concurrent first and subsequent writers without forking or losing events', async () => {
    const documentId = new mongoose.Types.ObjectId();
    const createdAt = new Date('2026-01-02T00:00:00Z');
    await Promise.all(Array.from({ length: 24 }, (_, index) => writeAuditEvent({
      documentId, action: 'parallel', metadata: { index }, createdAt,
    })));
    const logs = await expectValidChain(24);
    expect(new Set(logs.map((log) => log.metadata?.index)).size).toBe(24);
  });

  it('keeps retrying a busy chain beyond the former fixed collision limit', async () => {
    const collision = Object.assign(new Error('duplicate successor'), {
      code: 11000,
      keyPattern: { _id: 1 },
    });
    const create = vi.spyOn(AuditLogModel, 'create').mockImplementation(async () => {
      if (create.mock.calls.length <= 100) throw collision;
      return { _id: new mongoose.Types.ObjectId() } as never;
    });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      await expect(writeAuditEvent({ action: 'contended-system-event' })).resolves.toBeUndefined();
      expect(create).toHaveBeenCalledTimes(101);
    } finally {
      create.mockRestore();
      random.mockRestore();
    }
  });

  it('extends a legacy tail whose _id was randomly allocated', async () => {
    await writeAuditEvent({ action: 'legacy', createdAt: new Date('2026-01-01T00:00:00Z') });
    const original = (await AuditLogModel.findOne().lean())!;
    await AuditLogModel.deleteOne({ _id: original._id });
    const legacyId = new mongoose.Types.ObjectId();
    await AuditLogModel.collection.insertOne({ ...original, _id: legacyId });
    await Promise.all(Array.from({ length: 8 }, () => writeAuditEvent({ action: 'successor' })));
    const logs = await expectValidChain(9);
    expect(logs[0]._id).toEqual(legacyId);
  });

  it('preserves chronological append order when a caller supplies an older date', async () => {
    const future = new Date(Date.now() + 60_000);
    await writeAuditEvent({ action: 'future', createdAt: future });
    await writeAuditEvent({ action: 'backdated', createdAt: new Date('2000-01-01'), timestamp: new Date('2000-01-01') });
    await writeAuditEvent({ action: 'clock', createdAt: new Date() });
    const logs = await expectValidChain(3);
    expect(logs[1].createdAt.getTime()).toBe(future.getTime() + 1);
    expect(logs[1].timestamp).toEqual(new Date('2000-01-01'));
  });

  it('hashes the canonical ObjectId spelling persisted by MongoDB', async () => {
    const documentId = new mongoose.Types.ObjectId().toHexString();
    await writeAuditEvent({ documentId: documentId.toUpperCase(), action: 'upper' });
    await writeAuditEvent({ documentId, action: 'lower' });
    await expectValidChain(2);
  });
});
