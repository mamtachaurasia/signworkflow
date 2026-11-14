import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import LegalHoldModel from '@/models/LegalHold';
import DocumentModel from '@/models/Document';
import { writeAuditEvent } from '@/lib/audit';
import { verifyRetentionAdmin } from '@/lib/retention-admin';
import { getAuthContext } from '@/lib/auth-context';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

function buildCriteriaQuery(criteria: Record<string, unknown>): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (Array.isArray(criteria.userIds) && criteria.userIds.length > 0) {
    query.userId = { $in: criteria.userIds };
  }
  if (Array.isArray(criteria.docTypes) && criteria.docTypes.length > 0) {
    query['retention.docType'] = { $in: criteria.docTypes };
  }
  if (Array.isArray(criteria.jurisdictions) && criteria.jurisdictions.length > 0) {
    query['retention.jurisdiction'] = { $in: criteria.jurisdictions };
  }
  if (Array.isArray(criteria.statuses) && criteria.statuses.length > 0) {
    query.status = { $in: criteria.statuses };
  }

  const createdAt: Record<string, unknown> = {};
  if (typeof criteria.createdAfter === 'string') {
    const parsed = new Date(criteria.createdAfter);
    if (!Number.isNaN(parsed.getTime())) createdAt.$gte = parsed;
  }
  if (typeof criteria.createdBefore === 'string') {
    const parsed = new Date(criteria.createdBefore);
    if (!Number.isNaN(parsed.getTime())) createdAt.$lte = parsed;
  }
  if (Object.keys(createdAt).length > 0) {
    query.createdAt = createdAt;
  }

  return query;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyRetentionAdmin(req);
    if (!auth.authorized) {
      return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
    }
    const context = await getAuthContext(req);
    if (!context?.orgId) {
      return NextResponse.json({ message: 'Workspace context is missing' }, { status: 400 });
    }
    const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'legal_holds' });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }

    await connectDB();
    const holds = await LegalHoldModel.find({ orgId: context.orgId })
      .sort({ updatedAt: -1 })
      .lean();
    return NextResponse.json({ holds }, { status: 200 });
  } catch (error) {
    console.error('Legal holds GET error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyRetentionAdmin(req);
    if (!auth.authorized) {
      return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
    }
    const context = await getAuthContext(req);
    if (!context?.orgId) {
      return NextResponse.json({ message: 'Workspace context is missing' }, { status: 400 });
    }
    const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'legal_holds' });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined;
    const documentIds = Array.isArray(body.documentIds) ? body.documentIds : [];
    const criteria = typeof body.criteria === 'object' && body.criteria ? body.criteria as Record<string, unknown> : null;

    if (!name) {
      return NextResponse.json({ message: 'Hold name is required' }, { status: 400 });
    }

    if (documentIds.length === 0 && !criteria) {
      return NextResponse.json({ message: 'documentIds or criteria is required' }, { status: 400 });
    }

    await connectDB();

    const orQueries: Record<string, unknown>[] = [];
    if (documentIds.length > 0) {
      orQueries.push({ _id: { $in: documentIds } });
    }
    if (criteria) {
      const criteriaQuery = buildCriteriaQuery(criteria);
      if (Object.keys(criteriaQuery).length > 0) {
        orQueries.push(criteriaQuery);
      }
    }

    if (orQueries.length === 0) {
      return NextResponse.json({ message: 'criteria did not produce any matchable fields' }, { status: 400 });
    }

    const matchQuery = orQueries.length === 1 ? orQueries[0] : { $or: orQueries };
    const scopedQuery = { orgId: context.orgId, ...matchQuery };
    const matchedDocs = await DocumentModel.find(scopedQuery).select({ _id: 1 }).lean();
    const matchedIds = matchedDocs.map((doc) => doc._id);

    const hold = await LegalHoldModel.create({
      orgId: context.orgId,
      name,
      reason,
      status: 'active',
      documentIds: matchedIds,
      criteria: criteria ?? undefined,
      createdBy: typeof body.createdBy === 'string' ? body.createdBy : undefined,
    });

    if (matchedIds.length > 0) {
      const appliedAt = new Date();
      await DocumentModel.updateMany(
        { _id: { $in: matchedIds }, orgId: context.orgId },
        {
          $addToSet: { 'legalHold.holdIds': hold._id },
          $set: {
            'legalHold.status': 'active',
            'legalHold.lastCheckedAt': appliedAt,
            'retention.status': 'on_hold',
            'retention.lastEvaluatedAt': appliedAt,
          },
        }
      );
    }

    await writeAuditEvent({
      userId: context.userId,
      orgId: context.orgId,
      action: 'legal_hold_created',
      metadata: {
        holdId: hold._id,
        name,
        reason,
        matchedCount: matchedIds.length,
      },
    });

    return NextResponse.json(
      { holdId: hold._id, matchedCount: matchedIds.length },
      { status: 201 }
    );
  } catch (error) {
    console.error('Legal holds POST error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
