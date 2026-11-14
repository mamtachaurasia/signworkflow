import mongoose from 'mongoose';
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

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  const auth = await verifyRetentionAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  const isDownload = url.searchParams.get('download') === '1' || format === 'csv';
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
    Math.max(1, Number.isFinite(Number(limitRaw)) ? Math.floor(Number(limitRaw)) : 200)
  );

  if (auth.actorId && auth.actorOrgId) {
    const feature = isDownload ? 'audit_export' : 'audit_trail';
    const planGate = await getPlanGateForOrgFeature({ orgId: auth.actorOrgId, feature });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }
  }

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

  if (cursor) {
    const parsed = decodeCursor(cursor);
    if (!parsed) {
      return NextResponse.json({ message: 'Invalid cursor' }, { status: 400 });
    }
    filters.push({
      $or: [
        { createdAt: { $gt: parsed.createdAt } },
        { createdAt: parsed.createdAt, _id: { $gt: parsed.id } },
      ],
    });
  }

  const query = filters.length > 1 ? { $and: filters } : filters[0] || {};

  await connectDB();
  const logs = await AuditLogModel.find(query)
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = logs.length > limit;
  if (hasMore) {
    logs.pop();
  }

  const nextCursor = logs.length > 0
    ? encodeCursor(new Date(logs[logs.length - 1].createdAt), logs[logs.length - 1]._id)
    : null;

  if (format === 'csv') {
    const headers = [
      'createdAt',
      'action',
      'userId',
      'orgId',
      'documentId',
      'ipAddress',
      'userAgent',
      'chainScope',
      'chainId',
      'prevHash',
      'hash',
      'metadata',
    ];
    const rows = logs.map((log) => [
      log.createdAt ? new Date(log.createdAt).toISOString() : '',
      log.action || '',
      log.userId?.toString() || '',
      log.orgId?.toString() || '',
      log.documentId?.toString() || '',
      log.ipAddress || '',
      log.userAgent || '',
      log.chainScope || '',
      log.chainId || '',
      log.prevHash || '',
      log.hash || '',
      JSON.stringify(log.metadata || {}),
    ]);
    const csv = [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
    const response = new NextResponse(csv, { status: 200 });
    response.headers.set('Content-Type', 'text/csv');
    response.headers.set('X-Next-Cursor', nextCursor || '');
    return response;
  }

  return NextResponse.json({
    items: logs,
    nextCursor,
    hasMore,
  });
}
