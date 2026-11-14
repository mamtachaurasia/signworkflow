import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

const mocks = vi.hoisted(() => ({ verifyRetentionAdmin: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({ dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/admin-governance', () => ({ verifyRetentionAdmin: mocks.verifyRetentionAdmin }));
vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { writeAuditEvent } from '@/lib/audit';
import AuditLogModel from '@/models/AuditLog';
import { GET } from '@/app/api/admin/audit/verify/route';

describe('complete audit chain verification', () => {
  beforeAll(async () => {
    process.env.AUDIT_LOG_HASH_PEPPER = 'audit-verification-test';
    await connectTestDb();
  });
  beforeEach(async () => {
    await AuditLogModel.deleteMany({});
    mocks.verifyRetentionAdmin.mockResolvedValue({ authorized: true });
  });
  afterAll(async () => { await disconnectTestDb(); });

  async function seedChain(orgId = new mongoose.Types.ObjectId()) {
    const documentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    for (let index = 0; index < 3; index += 1) {
      await writeAuditEvent({
        orgId, documentId, userId: index === 2 ? userId : undefined,
        action: index === 1 ? 'excluded' : 'selected',
        createdAt: new Date(Date.UTC(2026, 0, index + 1)),
        metadata: { index },
      });
    }
    return { orgId, documentId, userId, logs: await AuditLogModel.find().sort({ createdAt: 1 }).lean() };
  }

  async function verify(query = '') {
    const response = await GET(new NextRequest(`https://example.test/api/admin/audit/verify?${query}`));
    expect(response.status).toBe(200);
    return response.json();
  }

  it('checks intervening links for an action filter and validates predecessors across every cursor', async () => {
    await seedChain();
    let cursor = '';
    for (let page = 0; page < 3; page += 1) {
      const result = await verify(`action=selected&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      expect(result).toMatchObject({ ok: true, checked: 1, mismatches: [], partialChains: 0, complete: false });
      expect(result.hasMore).toBe(page < 2);
      cursor = result.nextCursor;
    }
    expect(cursor).toBeNull();
  });

  it('checks complete chains when actor and date filters select only the last link', async () => {
    const { userId } = await seedChain();
    const result = await verify(`userId=${userId}&start=2026-01-03&end=2026-01-03`);
    expect(result).toMatchObject({ ok: true, checked: 3, complete: true, partialChains: 0 });
  });

  it('finds real tampering in a record omitted by the selection filter', async () => {
    const { logs } = await seedChain();
    await AuditLogModel.collection.updateOne({ _id: logs[1]._id }, { $set: { metadata: { tampered: true } } });
    const result = await verify('action=selected');
    expect(result).toMatchObject({ ok: false, checked: 3, complete: true, mismatchCount: 1 });
    expect(result.mismatches).toEqual([expect.objectContaining({ id: String(logs[1]._id), reason: 'hash_mismatch' })]);
  });

  it('detects a bad predecessor at the start of the second page', async () => {
    const { logs } = await seedChain();
    const first = await verify('limit=1');
    await AuditLogModel.collection.updateOne({ _id: logs[1]._id }, { $set: { prevHash: 'broken' } });
    const result = await verify(`limit=1&cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(result).toMatchObject({ ok: false, checked: 1, complete: false });
    expect(result.mismatches).toContainEqual(expect.objectContaining({ reason: 'prev_hash_mismatch' }));
  });

  it('detects a deleted intermediate link', async () => {
    const { logs } = await seedChain();
    await AuditLogModel.deleteOne({ _id: logs[1]._id });
    const result = await verify();
    expect(result).toMatchObject({ ok: false, checked: 2 });
    expect(result.mismatches).toContainEqual(expect.objectContaining({ id: String(logs[2]._id), reason: 'prev_hash_mismatch' }));
  });

  it('detects a deleted workspace predecessor instead of marking it inaccessible', async () => {
    const { orgId, logs } = await seedChain();
    await AuditLogModel.deleteOne({ _id: logs[0]._id });
    mocks.verifyRetentionAdmin.mockResolvedValue({
      authorized: true,
      actorId: String(new mongoose.Types.ObjectId()),
      actorOrgId: String(orgId),
    });

    const result = await verify();

    expect(result).toMatchObject({ ok: false, complete: true, checked: 2, partialChains: 0 });
    expect(result.mismatches).toContainEqual(expect.objectContaining({
      id: String(logs[1]._id),
      reason: 'prev_hash_mismatch',
      expected: '',
      actual: logs[1].prevHash,
    }));
  });

  it('batches predecessor resolution instead of querying each chain serially', async () => {
    const orgId = new mongoose.Types.ObjectId();
    for (let index = 0; index < 3; index += 1) {
      await writeAuditEvent({
        orgId,
        documentId: new mongoose.Types.ObjectId(),
        action: 'selected',
        createdAt: new Date(Date.UTC(2026, 0, index + 1)),
      });
    }
    const findOne = vi.spyOn(AuditLogModel, 'findOne');
    const aggregate = vi.spyOn(AuditLogModel, 'aggregate');

    try {
      const result = await verify();

      expect(result).toMatchObject({ ok: true, complete: true, checked: 3, partialChains: 0 });
      expect(findOne).not.toHaveBeenCalled();
      expect(aggregate).toHaveBeenCalledTimes(1);
    } finally {
      findOne.mockRestore();
      aggregate.mockRestore();
    }
  });

  it('does not expand a workspace admin selection into another workspace', async () => {
    const { orgId } = await seedChain();
    await seedChain();
    mocks.verifyRetentionAdmin.mockResolvedValue({ authorized: true, actorId: String(new mongoose.Types.ObjectId()), actorOrgId: String(orgId) });
    const result = await verify('action=selected');
    expect(result).toMatchObject({ ok: true, complete: true, checked: 3 });
  });

  it.each([1, 1000])('marks inaccessible intervening history partial with page size %i', async (limit) => {
    const orgId = new mongoose.Types.ObjectId();
    const otherOrgId = new mongoose.Types.ObjectId();
    const documentId = new mongoose.Types.ObjectId();
    for (let index = 0; index < 3; index += 1) {
      await writeAuditEvent({
        orgId: index === 1 ? otherOrgId : orgId,
        documentId,
        action: 'selected',
        createdAt: new Date(Date.UTC(2026, 0, index + 1)),
      });
    }
    mocks.verifyRetentionAdmin.mockResolvedValue({ authorized: true, actorId: String(new mongoose.Types.ObjectId()), actorOrgId: String(orgId) });
    const first = await verify(`action=selected&limit=${limit}`);
    const result = first.hasMore
      ? await verify(`action=selected&limit=${limit}&cursor=${encodeURIComponent(first.nextCursor)}`)
      : first;
    expect(result).toMatchObject({ ok: true, complete: false, partialChains: 1, mismatches: [] });
    expect(first.checked + (first.hasMore ? result.checked : 0)).toBe(2);
  });

  it('paginates multiple selected chains sharing timestamps without omitting links', async () => {
    await seedChain();
    await seedChain();
    let cursor: string | null = null;
    let checked = 0;
    do {
      const result = await verify(`action=selected&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      expect(result).toMatchObject({ ok: true, partialChains: 0, mismatches: [] });
      checked += result.checked;
      cursor = result.nextCursor;
    } while (cursor);
    expect(checked).toBe(6);
  });

  it('reports unsigned legacy history as incomplete rather than verified or corrupt', async () => {
    await AuditLogModel.create({ action: 'legacy', createdAt: new Date('2020-01-01') });
    await writeAuditEvent({ action: 'signed' });
    const result = await verify();
    expect(result).toMatchObject({ ok: true, complete: false, checked: 2, partialChains: 1, unverifiable: 1, mismatches: [] });
  });
});
