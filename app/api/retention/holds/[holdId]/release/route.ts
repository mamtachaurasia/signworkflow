import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import LegalHoldModel from '@/models/LegalHold';
import DocumentModel, { type IDocument } from '@/models/Document';
import { writeAuditEvent } from '@/lib/audit';
import { verifyRetentionAdmin } from '@/lib/retention-admin';
import { getAuthContext } from '@/lib/auth-context';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import {
  buildReleasedHoldRetentionCandidateQuery,
  buildReleasedHoldRetentionUpdate,
  type ReleasedHoldRetentionUpdate,
} from '@/lib/released-hold-retention';

const MAX_RELEASE_RECOMPUTE_BATCH = 100;

export async function POST(req: NextRequest, context: { params: Promise<{ holdId: string }> }) {
  try {
    const auth = await verifyRetentionAdmin(req);
    if (!auth.authorized) {
      return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
    }
    const contextAuth = await getAuthContext(req);
    if (!contextAuth?.orgId) {
      return NextResponse.json({ message: 'Workspace context is missing' }, { status: 400 });
    }
    const orgId = contextAuth.orgId;
    const planGate = await getPlanGateForOrgFeature({ orgId, feature: 'legal_holds' });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }

    const { holdId } = await context.params;
    if (!holdId) {
      return NextResponse.json({ message: 'Hold ID is required' }, { status: 400 });
    }

    await connectDB();

    const hold = await LegalHoldModel.findOne({
      _id: holdId,
      orgId,
    });
    if (!hold) {
      return NextResponse.json({ message: 'Hold not found' }, { status: 404 });
    }

    if (hold.status === 'released') {
      return NextResponse.json({ message: 'Hold already released' }, { status: 200 });
    }

    hold.status = 'released';
    hold.releasedAt = new Date();
    await hold.save();

    const targetIds = Array.isArray(hold.documentIds) ? hold.documentIds.map((id: unknown) => String(id)) : [];
    const releasedDocuments: Array<{
      documentId: string;
      retention: ReleasedHoldRetentionUpdate['retention'];
      legalHold: IDocument['legalHold'];
    }> = [];
    let recomputeAttemptedCount = 0;
    let remainingRecomputeCount = 0;
    let cappedRecompute = false;

    if (targetIds.length > 0) {
      const now = new Date();

      await DocumentModel.updateMany(
        { _id: { $in: targetIds }, orgId },
        { $pull: { 'legalHold.holdIds': hold._id }, $set: { 'legalHold.lastCheckedAt': now } }
      );
      await DocumentModel.updateMany(
        {
          _id: { $in: targetIds },
          orgId,
          'legalHold.holdIds.0': { $exists: false },
        },
        { $set: { 'legalHold.status': 'none', 'legalHold.lastCheckedAt': now } }
      );

      const releasedHoldCandidateQuery = buildReleasedHoldRetentionCandidateQuery({
        orgId,
        documentIds: targetIds,
      });
      const totalCandidates = await DocumentModel.countDocuments(releasedHoldCandidateQuery);
      cappedRecompute = totalCandidates > MAX_RELEASE_RECOMPUTE_BATCH;
      const documentsWithoutHold = await DocumentModel.find(releasedHoldCandidateQuery)
        .sort({ _id: 1 })
        .limit(MAX_RELEASE_RECOMPUTE_BATCH)
        .lean<IDocument[]>();

      if (documentsWithoutHold.length > 0) {
        recomputeAttemptedCount = documentsWithoutHold.length;
        const retentionUpdates = await Promise.all(
          documentsWithoutHold.map((document) => buildReleasedHoldRetentionUpdate(document as IDocument, now))
        );

        const updatedDocuments = (
          await Promise.all(
            retentionUpdates.map(async ({ documentId, legalHold, retention, update }) => {
              const updated = await DocumentModel.findOneAndUpdate(
                buildReleasedHoldRetentionCandidateQuery({
                  orgId,
                  documentIds: [documentId],
                }),
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
        remainingRecomputeCount = await DocumentModel.countDocuments(releasedHoldCandidateQuery);

        releasedDocuments.push(
          ...updatedDocuments
        );

        await writeAuditEvent({
          userId: contextAuth.userId,
          orgId,
          action: 'legal_hold_release_recompute_progress',
          metadata: {
            holdId: hold._id,
            attemptedRecomputeCount: documentsWithoutHold.length,
            recomputedCount: updatedDocuments.length,
            totalCandidates,
            remainingRecomputeCount,
            capped: cappedRecompute,
            batchSize: MAX_RELEASE_RECOMPUTE_BATCH,
          },
        });
      } else {
        remainingRecomputeCount = totalCandidates;
      }
    }

    await writeAuditEvent({
      userId: contextAuth.userId,
      orgId,
      action: 'legal_hold_released',
      metadata: { holdId: hold._id, releasedAt: hold.releasedAt },
    });

    return NextResponse.json(
      {
        success: true,
        releasedDocuments,
        recompute: {
          attemptedCount: recomputeAttemptedCount,
          recomputedCount: releasedDocuments.length,
          remainingCount: remainingRecomputeCount,
          capped: cappedRecompute,
          batchSize: MAX_RELEASE_RECOMPUTE_BATCH,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Legal hold release error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
