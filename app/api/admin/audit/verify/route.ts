import crypto from 'crypto';
import mongoose, { type PipelineStage } from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import AuditLogModel from '@/models/AuditLog';
import connectDB from '@/utils/db';
import { verifyRetentionAdmin } from '@/lib/admin-governance';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

export const runtime = 'nodejs';

const MAX_LIMIT = 1000;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encodeCursor(createdAt: Date, id: mongoose.Types.ObjectId): string {
  return Buffer.from(`${createdAt.toISOString()}|${id.toString()}`).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: Date; id: mongoose.Types.ObjectId } | null {
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const [datePart, idPart] = raw.split('|');
    const createdAt = new Date(datePart);
    if (!idPart || Number.isNaN(createdAt.getTime())) return null;
    if (!mongoose.Types.ObjectId.isValid(idPart)) return null;
    return { createdAt, id: new mongoose.Types.ObjectId(idPart) };
  } catch {
    return null;
  }
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : null;
  }

  if (typeof (value as { toString?: () => string }).toString === 'function') {
    const normalized = (value as { toString: () => string }).toString();
    return normalized && normalized !== '[object Object]' ? normalized : null;
  }

  return null;
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function computeAuditHash(payload: Record<string, unknown>): string {
  const pepper = process.env.AUDIT_LOG_HASH_PEPPER || '';
  return crypto
    .createHmac('sha256', pepper)
    .update(stableStringify(payload))
    .digest('hex');
}

export async function GET(req: NextRequest) {
  const auth = await verifyRetentionAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
  }

  if (auth.actorId && auth.actorOrgId) {
    const planGate = await getPlanGateForOrgFeature({ orgId: auth.actorOrgId, feature: 'audit_export' });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  const requestedOrgId = url.searchParams.get('orgId');
  const documentId = url.searchParams.get('documentId');
  const action = url.searchParams.get('action');
  const start = parseDate(url.searchParams.get('start'));
  const end = parseDate(url.searchParams.get('end'));
  const limitRaw = url.searchParams.get('limit');
  const cursor = url.searchParams.get('cursor');

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, limitRaw && Number.isFinite(Number(limitRaw)) ? Math.floor(Number(limitRaw)) : 200)
  );

  const baseFilters: Record<string, unknown> = {};
  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
    }
    baseFilters.userId = new mongoose.Types.ObjectId(userId);
  }
  if (requestedOrgId) {
    if (!mongoose.Types.ObjectId.isValid(requestedOrgId)) {
      return NextResponse.json({ message: 'Invalid orgId' }, { status: 400 });
    }
    baseFilters.orgId = new mongoose.Types.ObjectId(requestedOrgId);
  }
  if (auth.actorId) {
    if (!auth.actorOrgId || !mongoose.Types.ObjectId.isValid(auth.actorOrgId)) {
      return NextResponse.json({ message: 'Workspace context is required' }, { status: 403 });
    }
    const actorOrgId = new mongoose.Types.ObjectId(auth.actorOrgId);
    if (requestedOrgId && !actorOrgId.equals(requestedOrgId)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    baseFilters.orgId = actorOrgId;
  }
  if (documentId) {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return NextResponse.json({ message: 'Invalid documentId' }, { status: 400 });
    }
    baseFilters.documentId = new mongoose.Types.ObjectId(documentId);
  }
  if (action && action.trim()) {
    baseFilters.action = { $regex: escapeRegex(action.trim()), $options: 'i' };
  }

  const filters: Record<string, unknown>[] = [];
  if (Object.keys(baseFilters).length > 0) {
    filters.push(baseFilters);
  }

  if (start || end) {
    const createdAt: Record<string, unknown> = {};
    if (start) createdAt.$gte = start;
    if (end) createdAt.$lte = end;
    filters.push({ createdAt });
  }

  const selectionQuery = filters.length > 1 ? { $and: filters } : filters[0] || {};
  const pageFilters: Record<string, unknown>[] = [];
  // Filters select chains, not individual links. Keep the access boundary when
  // including links outside a user's action, actor, document, or date filter.
  const accessScope = auth.actorId ? { orgId: baseFilters.orgId } : {};
  if (auth.actorId) pageFilters.push(accessScope);
  if (cursor) {
    const parsed = decodeCursor(cursor);
    if (!parsed) {
      return NextResponse.json({ message: 'Invalid cursor' }, { status: 400 });
    }
    pageFilters.push({
      $or: [
        { createdAt: { $gt: parsed.createdAt } },
        { createdAt: parsed.createdAt, _id: { $gt: parsed.id } },
      ],
    });
  }

  await connectDB();
  const selectsChains = Boolean(userId || documentId || action?.trim() || start || end || (!auth.actorId && requestedOrgId));
  const pageQuery = pageFilters.length > 1 ? { $and: pageFilters } : pageFilters[0] || {};
  const logs = selectsChains
    ? await AuditLogModel.aggregate([
      { $match: selectionQuery },
      { $group: { _id: {
        scope: { $ifNull: ['$chainScope', 'system'] },
        id: { $ifNull: ['$chainId', 'system'] },
      } } },
      { $lookup: {
        from: AuditLogModel.collection.name,
        let: { scope: '$_id.scope', chain: '$_id.id' },
        pipeline: [
          { $match: { ...pageQuery, $expr: { $and: [
            { $eq: [{ $ifNull: ['$chainScope', 'system'] }, '$$scope'] },
            { $eq: [{ $ifNull: ['$chainId', 'system'] }, '$$chain'] },
          ] } } },
          { $sort: { createdAt: 1, _id: 1 } },
          { $limit: limit + 1 },
        ],
        as: 'entries',
      } },
      { $unwind: '$entries' },
      { $replaceRoot: { newRoot: '$entries' } },
      { $sort: { createdAt: 1, _id: 1 } },
      { $limit: limit + 1 },
    ])
    : await AuditLogModel.find(pageQuery)
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit + 1)
      .lean();

  const hasMore = logs.length > limit;
  if (hasMore) {
    logs.pop();
  }

  const nextCursor = hasMore && logs.length > 0
    ? encodeCursor(new Date(logs[logs.length - 1].createdAt), logs[logs.length - 1]._id)
    : null;

  const mismatches: Array<{ id: string; reason: string; expected?: string; actual?: string }> = [];
  const lastHashes = new Map<string, string>();
  const partialChainKeys = new Set<string>();
  let unverifiable = 0;

  type Predecessor = { hash?: string; orgId?: unknown };
  type PredecessorLookup = {
    _id: unknown;
    scopedPredecessor?: Predecessor;
    immediatePredecessor?: Predecessor;
  };
  // Resolve every predecessor in one database request. Doing this in the
  // verification loop would turn a 1,000-link page into 1,000 serial network
  // round trips when the page contains distinct chains.
  const predecessorRows = logs.length > 0
    ? await AuditLogModel.aggregate<PredecessorLookup>([
      { $match: { _id: { $in: logs.map((log) => log._id) } } },
      { $lookup: {
        from: AuditLogModel.collection.name,
        let: {
          chainScope: { $ifNull: ['$chainScope', 'system'] },
          chainId: { $ifNull: ['$chainId', 'system'] },
          createdAt: '$createdAt',
          id: '$_id',
        },
        pipeline: [
          { $match: {
            ...accessScope,
            $expr: { $and: [
              { $eq: [{ $ifNull: ['$chainScope', 'system'] }, '$$chainScope'] },
              { $eq: [{ $ifNull: ['$chainId', 'system'] }, '$$chainId'] },
              { $or: [
                { $lt: ['$createdAt', '$$createdAt'] },
                { $and: [
                  { $eq: ['$createdAt', '$$createdAt'] },
                  { $lt: ['$_id', '$$id'] },
                ] },
              ] },
            ] },
          } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 1 },
          { $project: { hash: 1 } },
        ],
        as: 'scopedPredecessors',
      } },
      ...(auth.actorId ? [{ $lookup: {
        from: AuditLogModel.collection.name,
        let: {
          chainScope: { $ifNull: ['$chainScope', 'system'] },
          chainId: { $ifNull: ['$chainId', 'system'] },
          createdAt: '$createdAt',
          id: '$_id',
        },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: [{ $ifNull: ['$chainScope', 'system'] }, '$$chainScope'] },
            { $eq: [{ $ifNull: ['$chainId', 'system'] }, '$$chainId'] },
            { $or: [
              { $lt: ['$createdAt', '$$createdAt'] },
              { $and: [
                { $eq: ['$createdAt', '$$createdAt'] },
                { $lt: ['$_id', '$$id'] },
              ] },
            ] },
          ] } } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 1 },
          { $project: { orgId: 1 } },
        ],
        as: 'immediatePredecessors',
      } }] : []),
      { $project: {
        scopedPredecessor: { $arrayElemAt: ['$scopedPredecessors', 0] },
        ...(auth.actorId ? { immediatePredecessor: { $arrayElemAt: ['$immediatePredecessors', 0] } } : {}),
      } },
    ] as PipelineStage[])
    : [];
  const predecessorsByLogId = new Map(
    predecessorRows.map((row) => [String(row._id), row])
  );

  for (const log of logs) {
    const chainScope = log.chainScope || 'system';
    const chainId = log.chainId || 'system';
    const chainKey = `${chainScope}:${chainId}`;

    const prevHash = typeof log.prevHash === 'string' ? log.prevHash : '';
    let expectedPrev = lastHashes.get(chainKey);
    const predecessors = predecessorsByLogId.get(String(log._id));
    if (!lastHashes.has(chainKey)) {
      // Establish the real predecessor independently of filters and cursors.
      // Then cache each chain's tail for the remaining records in this page.
      const previous = predecessors?.scopedPredecessor;
      if (previous) {
        expectedPrev = previous.hash || '';
        if (!previous.hash) partialChainKeys.add(chainKey);
      } else if (prevHash && auth.actorId) {
        // Distinguish an inaccessible link from one that was deleted. A
        // missing predecessor belongs to this workspace's verifiable history
        // and must be compared with the empty genesis hash.
        const predecessor = predecessors?.immediatePredecessor;
        if (predecessor && String(predecessor.orgId) !== auth.actorOrgId) {
          partialChainKeys.add(chainKey);
        } else {
          expectedPrev = '';
        }
      } else {
        expectedPrev = '';
      }
    }
    if (auth.actorId && expectedPrev !== undefined && prevHash !== expectedPrev) {
      // A chain can include older links from outside the current workspace.
      // Inspect only the predecessor's scope; never return its hash or data.
      const predecessor = predecessors?.immediatePredecessor;
      if (predecessor && String(predecessor.orgId) !== auth.actorOrgId) {
        partialChainKeys.add(chainKey);
        expectedPrev = undefined;
      }
    }
    if (expectedPrev !== undefined) {
      if (prevHash !== expectedPrev) {
        mismatches.push({
          id: String(log._id),
          reason: 'prev_hash_mismatch',
          expected: expectedPrev,
          actual: prevHash,
        });
      }
    }

    if (!log.hash) {
      unverifiable += 1;
      partialChainKeys.add(chainKey);
      lastHashes.set(chainKey, '');
      continue;
    }

    const payloadForHash = {
      chainScope,
      chainId,
      prevHash,
      userId: normalizeId(log.userId),
      orgId: normalizeId(log.orgId),
      documentId: normalizeId(log.documentId),
      actor: normalizeString(log.actor),
      action: log.action,
      ipAddress: normalizeString(log.ipAddress),
      userAgent: normalizeString(log.userAgent),
      metadata: log.metadata || {},
      timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : null,
      createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : null,
    };

    const computedHash = computeAuditHash(payloadForHash);
    if (computedHash !== log.hash) {
      mismatches.push({
        id: String(log._id),
        reason: 'hash_mismatch',
        expected: computedHash,
        actual: log.hash || '',
      });
    }

    lastHashes.set(chainKey, log.hash);
  }

  return NextResponse.json({
    ok: mismatches.length === 0,
    complete: !cursor && !hasMore && partialChainKeys.size === 0,
    scope: 'matching_chains',
    checked: logs.length,
    mismatches: mismatches.slice(0, 50),
    mismatchCount: mismatches.length,
    unverifiable,
    partialChains: partialChainKeys.size,
    hasMore,
    nextCursor,
  });
}
