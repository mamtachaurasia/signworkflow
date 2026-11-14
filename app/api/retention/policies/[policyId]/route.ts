import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import RetentionPolicyModel from '@/models/RetentionPolicy';
import { writeAuditEvent } from '@/lib/audit';
import { verifyRetentionAdmin } from '@/lib/retention-admin';
import { getAuthContext } from '@/lib/auth-context';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';

function parseDurationDays(body: Record<string, unknown>): number | null {
  const durationDays = body.durationDays;
  const durationYears = body.durationYears;
  const durationMonths = body.durationMonths;

  if (typeof durationDays === 'number' && Number.isFinite(durationDays) && durationDays > 0) {
    return Math.floor(durationDays);
  }

  if (typeof durationYears === 'number' && Number.isFinite(durationYears) && durationYears > 0) {
    return Math.floor(durationYears * 365);
  }

  if (typeof durationMonths === 'number' && Number.isFinite(durationMonths) && durationMonths > 0) {
    return Math.floor(durationMonths * 30);
  }

  return null;
}

function buildOrgOwnedPolicyFilter(policyId: string, orgId: string) {
  return {
    _id: policyId,
    orgId,
  };
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ policyId: string }> }) {
  try {
    const auth = await verifyRetentionAdmin(req);
    if (!auth.authorized) {
      return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
    }
    const contextAuth = await getAuthContext(req);
    if (!contextAuth?.orgId) {
      return NextResponse.json({ message: 'Workspace context is missing' }, { status: 400 });
    }
    const planGate = await getPlanGateForOrgFeature({ orgId: contextAuth.orgId, feature: 'retention_policies' });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }

    const { policyId } = await context.params;
    if (!policyId) {
      return NextResponse.json({ message: 'Policy ID is required' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (typeof body.name === 'string') update.name = body.name.trim();
    if (typeof body.docType === 'string') update.docType = body.docType.trim() || '*';
    if (typeof body.jurisdiction === 'string') update.jurisdiction = body.jurisdiction.trim() || '*';
    if (typeof body.triggerEvent === 'string') {
      const triggerEvent = body.triggerEvent.trim();
      const allowedTriggers = ['createdAt', 'completedAt', 'finalizedAt', 'expiresAt', 'custom'];
      if (!allowedTriggers.includes(triggerEvent)) {
        return NextResponse.json({ message: 'Invalid triggerEvent' }, { status: 400 });
      }
      update.triggerEvent = triggerEvent;
    }
    if (typeof body.priority === 'number') update.priority = body.priority;
    if (typeof body.regime === 'string') update.regime = body.regime;
    if (typeof body.active === 'boolean') update.active = body.active;
    if (typeof body.notes === 'string') update.notes = body.notes;

    const durationDays = parseDurationDays(body);
    if (durationDays) {
      update.durationDays = durationDays;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ message: 'No updates provided' }, { status: 400 });
    }

    await connectDB();
    const policy = await RetentionPolicyModel.findOneAndUpdate(
      buildOrgOwnedPolicyFilter(policyId, contextAuth.orgId),
      update,
      { new: true }
    );
    if (!policy) {
      return NextResponse.json({ message: 'Policy not found' }, { status: 404 });
    }

    await writeAuditEvent({
      userId: contextAuth.userId,
      orgId: contextAuth.orgId,
      action: 'retention_policy_updated',
      metadata: {
        policyId: policy._id,
        updates: update,
      },
    });

    return NextResponse.json({ policy }, { status: 200 });
  } catch (error) {
    console.error('Retention policy PATCH error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ policyId: string }> }) {
  try {
    const auth = await verifyRetentionAdmin(req);
    if (!auth.authorized) {
      return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
    }
    const contextAuth = await getAuthContext(req);
    if (!contextAuth?.orgId) {
      return NextResponse.json({ message: 'Workspace context is missing' }, { status: 400 });
    }
    const planGate = await getPlanGateForOrgFeature({ orgId: contextAuth.orgId, feature: 'retention_policies' });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }

    const { policyId } = await context.params;
    if (!policyId) {
      return NextResponse.json({ message: 'Policy ID is required' }, { status: 400 });
    }

    await connectDB();
    const policy = await RetentionPolicyModel.findOneAndDelete(
      buildOrgOwnedPolicyFilter(policyId, contextAuth.orgId)
    );
    if (!policy) {
      return NextResponse.json({ message: 'Policy not found' }, { status: 404 });
    }

    await writeAuditEvent({
      userId: contextAuth.userId,
      orgId: contextAuth.orgId,
      action: 'retention_policy_deleted',
      metadata: { policyId },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Retention policy DELETE error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
