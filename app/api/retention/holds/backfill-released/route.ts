import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import DocumentModel, { type IDocument } from '@/models/Document';
import { writeAuditEvent } from '@/lib/audit';
import { verifyRetentionAdmin } from '@/lib/retention-admin';
import {
  buildReleasedHoldRetentionCandidateQuery,
  buildReleasedHoldRetentionUpdate,
} from '@/lib/released-hold-retention';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

type BackfillRequestBody = {
  dryRun?: boolean;
  limit?: number;
  orgId?: string;
  documentIds?: string[];
};

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(Math.floor(value), MAX_LIMIT));
}

function normalizeDocumentIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyRetentionAdmin(req);
    if (!auth.authorized) {
      return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
    }

    await connectDB();

    const body = (await req.json().catch(() => ({}))) as BackfillRequestBody;
    const actorOrgId = auth.actorOrgId ?? null;
    const requestedOrgId = typeof body.orgId === 'string' && body.orgId.trim().length > 0 ? body.orgId.trim() : null;
    if (actorOrgId && requestedOrgId && requestedOrgId !== actorOrgId) {
      return NextResponse.json(
        { message: 'You can only run this backfill for your active workspace' },
        { status: 403 }
      );
    }

    const orgId = actorOrgId || requestedOrgId || undefined;
    const dryRun = Boolean(body.dryRun);
    const limit = normalizeLimit(body.limit);
    const documentIds = normalizeDocumentIds(body.documentIds);
    const query = buildReleasedHoldRetentionCandidateQuery({ orgId, documentIds });

    const totalCandidates = await DocumentModel.countDocuments(query);
    if (totalCandidates === 0) {
      return NextResponse.json({
        message: 'No released-hold retention rows require backfill',
        dryRun,
        totalCandidates: 0,
        processedCount: 0,
        updatedCount: 0,
        remainingCandidates: 0,
        orgId: orgId || null,
      });
    }

    const documents = await DocumentModel.find(query)
      .select({
        _id: 1,
        orgId: 1,
        createdAt: 1,
        completedAt: 1,
        finalizedAt: 1,
        expiresAt: 1,
        retention: 1,
        legalHold: 1,
      })
      .sort({ _id: 1 })
      .limit(limit)
      .lean<IDocument[]>();

    if (dryRun) {
      return NextResponse.json({
        message: 'Released-hold retention backfill dry-run completed',
        dryRun: true,
        totalCandidates,
        processedCount: documents.length,
        updatedCount: 0,
        remainingCandidates: Math.max(totalCandidates - documents.length, 0),
        orgId: orgId || null,
        sample: documents.map((document) => ({
          documentId: String(document._id),
          orgId: document.orgId ? String(document.orgId) : null,
          retention: document.retention ?? null,
          legalHold: document.legalHold ?? null,
        })),
      });
    }

    const now = new Date();
    const updates = await Promise.all(
      documents.map((document) => buildReleasedHoldRetentionUpdate(document as IDocument, now))
    );

    const updatedDocuments = (
      await Promise.all(
        updates.map(async ({ documentId, legalHold, retention, update }) => {
          const updated = await DocumentModel.findOneAndUpdate(
            buildReleasedHoldRetentionCandidateQuery({ orgId, documentIds: [documentId] }),
            { $set: update },
            { new: true }
          ).lean();

          if (!updated) {
            return null;
          }

          return { documentId, legalHold, retention };
        })
      )
    ).filter((item): item is NonNullable<typeof item> => Boolean(item));

    const remainingCandidates = await DocumentModel.countDocuments(query);

    await writeAuditEvent({
      userId: auth.actorId,
      orgId: orgId,
      action: 'retention_released_hold_backfill',
      metadata: {
        dryRun: false,
        limit,
        totalCandidates,
        processedCount: documents.length,
        updatedCount: updatedDocuments.length,
        remainingCandidates,
        scope: orgId ? 'organization' : 'global',
      },
    });

    return NextResponse.json({
      message: `Released-hold retention backfill updated ${updatedDocuments.length} document(s)`,
      dryRun: false,
      totalCandidates,
      processedCount: documents.length,
      updatedCount: updatedDocuments.length,
      remainingCandidates,
      orgId: orgId || null,
      updatedDocuments,
    });
  } catch (error) {
    console.error('Released-hold retention backfill error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
