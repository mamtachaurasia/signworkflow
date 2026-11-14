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
    const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'retention_policies' });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }

    await connectDB();
    const policies = await RetentionPolicyModel.find({
      $or: [{ orgId: context.orgId }, { orgId: { $exists: false } }, { orgId: null }],
    })
      .sort({ updatedAt: -1 })
      .lean();
    return NextResponse.json({ policies }, { status: 200 });
  } catch (error) {
    console.error('Retention policies GET error:', error);
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
    const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'retention_policies' });
    if (!planGate.allowed) {
      return NextResponse.json({ message: planGate.message }, { status: planGate.status });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const docType = typeof body.docType === 'string' ? body.docType.trim() : '*';
    const jurisdiction = typeof body.jurisdiction === 'string' ? body.jurisdiction.trim() : '*';
    const triggerEvent = typeof body.triggerEvent === 'string' ? body.triggerEvent.trim() : 'completedAt';

    if (!name) {
      return NextResponse.json({ message: 'Policy name is required' }, { status: 400 });
    }

    const durationDays = parseDurationDays(body);
    if (!durationDays) {
      return NextResponse.json(
        { message: 'durationDays (or durationYears/durationMonths) must be a positive number' },
        { status: 400 }
      );
    }

    const allowedTriggers = ['createdAt', 'completedAt', 'finalizedAt', 'expiresAt', 'custom'];
    if (!allowedTriggers.includes(triggerEvent)) {
      return NextResponse.json({ message: 'Invalid triggerEvent' }, { status: 400 });
    }

    await connectDB();

    const policy = await RetentionPolicyModel.create({
      orgId: context.orgId,
      name,
      docType: docType || '*',
      jurisdiction: jurisdiction || '*',
      triggerEvent,
      durationDays,
      priority: typeof body.priority === 'number' ? body.priority : 0,
      regime: typeof body.regime === 'string' ? body.regime : undefined,
      active: typeof body.active === 'boolean' ? body.active : true,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });

    await writeAuditEvent({
      userId: context.userId,
      orgId: context.orgId,
      action: 'retention_policy_created',
      metadata: {
        policyId: policy._id,
        name,
        docType,
        jurisdiction,
        triggerEvent,
        durationDays,
      },
    });

    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    console.error('Retention policies POST error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
