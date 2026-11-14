import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/utils/db';
import SessionModel from '@/models/Session';
import MembershipModel from '@/models/Membership';
import Users from '@/models/Users';
import { verifyRetentionAdmin } from '@/lib/admin-governance';
import { writeAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

const DEFAULT_DRY_RUN_LIMIT = 200;

type PurgeRequestBody = {
  userIds?: string[];
  dryRun?: boolean;
  limit?: number;
};

type PurgeUserProjection = {
  _id: mongoose.Types.ObjectId;
  email?: string;
  deletionScheduledAt?: Date | null;
  purgedAt?: Date | null;
};

function buildPurgeQuery(userIds?: string[]) {
  const now = new Date();
  const base: Record<string, unknown> = {
    isDeleted: true,
    purgedAt: { $in: [null, undefined] },
    deletionScheduledAt: { $ne: null, $lte: now },
  };
  if (Array.isArray(userIds) && userIds.length > 0) {
    const ids = userIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    return { ...base, _id: { $in: ids } };
  }
  return base;
}

function anonymizeEmail(userId: mongoose.Types.ObjectId): string {
  return `deleted+${userId.toString()}@example.invalid`;
}

export async function POST(req: NextRequest) {
  const auth = await verifyRetentionAdmin(req);
  if (!auth.authorized) {
    return NextResponse.json({ message: auth.message || 'Unauthorized' }, { status: auth.status || 401 });
  }

  await connectDB();

  const body = (await req.json().catch(() => ({}))) as PurgeRequestBody;
  const dryRun = Boolean(body?.dryRun);
  const limit =
    typeof body?.limit === 'number' && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(Math.floor(body.limit), 2000))
      : DEFAULT_DRY_RUN_LIMIT;

  const query = buildPurgeQuery(body?.userIds);
  const totalMatches = await Users.countDocuments(query);
  if (totalMatches === 0) {
    return NextResponse.json({ message: 'No matching users found to purge', dryRun }, { status: 200 });
  }

  if (dryRun) {
    const sample = await Users.find(query)
      .select({ _id: 1, email: 1, deletionScheduledAt: 1, purgedAt: 1 })
      .sort({ deletionScheduledAt: 1, _id: 1 })
      .limit(limit)
      .lean<PurgeUserProjection[]>();

    const responsePayload = {
      message: 'User purge dry-run completed',
      dryRun: true,
      totalMatches,
      sampleCount: sample.length,
      truncated: totalMatches > sample.length,
      sample: sample.map((user) => ({
        id: String(user._id),
        email: user.email,
        deletionScheduledAt: user.deletionScheduledAt,
        purgedAt: user.purgedAt,
      })),
    };

    await writeAuditEvent({
      action: 'user_purge_dry_run',
      metadata: {
        totalMatches,
        sampleCount: sample.length,
        limit,
      },
    });

    return NextResponse.json(responsePayload);
  }

  const users = await Users.find(query)
    .select({ _id: 1 })
    .lean<PurgeUserProjection[]>();

  if (users.length === 0) {
    return NextResponse.json({ message: 'No matching users found to purge', dryRun }, { status: 200 });
  }

  const now = new Date();
  const purgeIds = users.map((user) => user._id);

  const bulkOps = users.map((user) => ({
    updateOne: {
      filter: { _id: user._id },
      update: {
        $set: {
          email: anonymizeEmail(user._id),
          passwordHash: null,
          password: null,
          firstName: '',
          lastName: '',
          name: '',
          picture: '',
          phone: '',
          address: null,
          settings: {},
          mfaSecret: null,
          mfaEnabled: false,
          isActive: false,
          isDeleted: true,
          deletionScheduledAt: null,
          purgedAt: now,
        },
        $inc: {
          tokenVersion: 1,
        },
      },
    },
  }));

  if (bulkOps.length > 0) {
    await Users.bulkWrite(bulkOps as Parameters<typeof Users.bulkWrite>[0], { ordered: false });
  }

  await SessionModel.deleteMany({ userId: { $in: purgeIds } });
  await MembershipModel.updateMany(
    { userId: { $in: purgeIds } },
    { $set: { status: 'disabled', disabledReason: 'user_deleted' } }
  );

  await writeAuditEvent({
    action: 'user_purge_executed',
    metadata: {
      purgedCount: users.length,
    },
  });

  return NextResponse.json({
    message: `Purged ${users.length} user(s)`,
    purgedIds: purgeIds.map((id) => String(id)),
  });
}
