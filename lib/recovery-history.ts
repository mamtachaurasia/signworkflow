import { createHash } from 'crypto';
import mongoose from 'mongoose';

export const CLOUD_JOB_HISTORY_STATUSES = ['pending', 'processing', 'completed', 'failed', 'dead_letter'];
export const WEBHOOK_HISTORY_STATUSES = ['pending', 'paused', 'processing', 'delivered', 'failed', 'dead_letter'];

/** Cursors bind the stable (createdAt, _id) ordering to the authenticated scope and filters. */
export function parseRecoveryHistoryQuery(params: URLSearchParams, scope: Record<string, string>, statuses: string[]) {
  const limit = Number(params.get('limit') ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be an integer from 1 to 100.');
  const status = params.get('status') || '';
  if (status && status !== 'failures' && !statuses.includes(status)) throw new Error('Invalid history status.');
  const dates: Record<string, Date> = {};
  for (const key of ['from', 'to']) {
    const value = params.get(key);
    if (!value) continue;
    const date = new Date(value);
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
      throw new Error(`Invalid ${key} date.`);
    }
    dates[key] = date;
  }
  if (dates.from && dates.to && dates.from > dates.to) throw new Error('From date must not be after to date.');
  const fingerprint = createHash('sha256').update(JSON.stringify({ scope, status, from: dates.from, to: dates.to })).digest('hex');
  const filter: Record<string, unknown> = {
    ...scope,
    ...(status ? { status: status === 'failures' ? { $in: ['failed', 'dead_letter'] } : status } : {}),
    ...(dates.from || dates.to ? { createdAt: { ...(dates.from ? { $gte: dates.from } : {}), ...(dates.to ? { $lte: dates.to } : {}) } } : {}),
  };
  const cursor = params.get('cursor');
  if (cursor) {
    try {
      if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (decoded.v !== 1 || decoded.scope !== fingerprint || !/^[a-fA-F0-9]{24}$/.test(decoded.id) || !mongoose.Types.ObjectId.isValid(decoded.id) || typeof decoded.at !== 'string') throw new Error();
      const at = new Date(decoded.at);
      if (!Number.isFinite(at.getTime()) || at.toISOString() !== decoded.at) throw new Error();
      filter.$or = [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: new mongoose.Types.ObjectId(decoded.id) } }];
    } catch {
      throw new Error('Invalid history cursor for this scope or filter.');
    }
  }
  return {
    filter,
    limit,
    page<T extends { _id: unknown; createdAt?: unknown }>(rows: T[]) {
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      const nextCursor = rows.length > limit && last
        ? Buffer.from(JSON.stringify({ v: 1, scope: fingerprint, id: String(last._id), at: new Date(last.createdAt as string | Date).toISOString() })).toString('base64url')
        : null;
      return { items, nextCursor };
    },
  };
}
