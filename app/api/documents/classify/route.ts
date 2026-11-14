import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import DocumentModel from '@/models/Document';
import RetentionPolicyModel, { type IRetentionPolicy } from '@/models/RetentionPolicy';
import { writeAuditEvent } from '@/lib/audit';
import { buildRetentionUpdatePayload, computeRetentionFields } from '@/lib/retention';
import { resolveManualRetentionPolicyOverride } from '@/lib/retention-policy-overrides';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';

export const POST = withTrialWriteAccessFromAuthContext(async function POST(req: NextRequest, _context, authContext) {
  try {
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = authContext.userId;
    const orgId = authContext.orgId;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
    if (!documentId) {
      return NextResponse.json({ message: 'documentId is required' }, { status: 400 });
    }

    const docType = typeof body.docType === 'string' ? body.docType.trim() : undefined;
    const jurisdiction = typeof body.jurisdiction === 'string' ? body.jurisdiction.trim() : undefined;
    const governingLaw = typeof body.governingLaw === 'string' ? body.governingLaw.trim() : undefined;
    const customTriggerAtRaw = typeof body.customTriggerAt === 'string' ? body.customTriggerAt : undefined;
    const customTriggerAt = customTriggerAtRaw ? new Date(customTriggerAtRaw) : undefined;
    if (customTriggerAtRaw && (!customTriggerAt || Number.isNaN(customTriggerAt.getTime()))) {
      return NextResponse.json({ message: 'customTriggerAt is not a valid date' }, { status: 400 });
    }
    const hasPolicyId = Object.prototype.hasOwnProperty.call(body, 'policyId');
    const policyId = typeof body.policyId === 'string' ? body.policyId.trim() : '';

    await connectDB();

    const document = await DocumentModel.findOne({ _id: documentId, userId, orgId });
    if (!document) {
      return NextResponse.json({ message: 'Document not found' }, { status: 404 });
    }

    document.retention = document.retention || {};
    if (docType !== undefined) document.retention.docType = docType;
    if (jurisdiction !== undefined) document.retention.jurisdiction = jurisdiction;
    if (governingLaw !== undefined) document.retention.governingLaw = governingLaw;
    if (customTriggerAt && !Number.isNaN(customTriggerAt.getTime())) {
      document.retention.customTriggerAt = customTriggerAt;
    }

    const policy = policyId
      ? await RetentionPolicyModel.findById(policyId).lean<IRetentionPolicy | null>()
      : null;
    if (policyId && (!policy || (policy.orgId && String(policy.orgId) !== orgId))) {
      return NextResponse.json({ message: 'Retention policy not found' }, { status: 404 });
    }
    const existingManualPolicy = await resolveManualRetentionPolicyOverride(document.toObject());
    const selectedPolicy =
      policy ||
      (!hasPolicyId ? existingManualPolicy : undefined);

    const retention = await computeRetentionFields({
      document: document.toObject(),
      policy: selectedPolicy,
    });

    const updatePayload = buildRetentionUpdatePayload({
      retention,
      docType: document.retention.docType,
      jurisdiction: document.retention.jurisdiction,
      governingLaw: document.retention.governingLaw,
      customTriggerAt: document.retention.customTriggerAt,
      evaluatedAt: new Date(),
    });

    const updateOperation: {
      $set: Record<string, unknown>;
      $unset?: Record<string, 1>;
    } = { $set: updatePayload };

    if (policy) {
      updateOperation.$set['retention.policySelection'] = 'manual';
      updateOperation.$set['retention.policyOverrideId'] = policy._id;
    } else if (hasPolicyId) {
      updateOperation.$set['retention.policySelection'] = 'automatic';
      updateOperation.$unset = { 'retention.policyOverrideId': 1 };
    }

    await DocumentModel.updateOne({ _id: documentId, userId, orgId }, updateOperation);

    await writeAuditEvent({
      userId,
      orgId,
      documentId,
      actor: String(userId),
      action: 'document_classified',
      metadata: {
        docType: document.retention.docType,
        jurisdiction: document.retention.jurisdiction,
        governingLaw: document.retention.governingLaw,
        policyId: retention.policy?.policyId || null,
        policySelection: policy ? 'manual' : hasPolicyId ? 'automatic' : document.retention.policySelection || null,
      },
    });

    return NextResponse.json({
      success: true,
      retention: {
        ...retention,
        docType: document.retention.docType ?? undefined,
        jurisdiction: document.retention.jurisdiction ?? undefined,
        governingLaw: document.retention.governingLaw ?? undefined,
        customTriggerAt: document.retention.customTriggerAt ?? undefined,
      },
    });
  } catch (error) {
    console.error('Document classify error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
});
