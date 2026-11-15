import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

import OrganizationModel from '@/models/Organization';
import Users from '@/models/Users';
import { sendTrialExpirationEmail } from '@/lib/email';
import connectDB from '@/utils/db';

const CLAIM_LEASE_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type TrialExpirationEmailFailureReason =
  | 'owner_unavailable'
  | 'email_delivery_failed'
  | 'send_acknowledgement_failed';

type TrialExpirationEmailFailure = {
  organizationId: string;
  reason: TrialExpirationEmailFailureReason;
};

type TrialExpirationOrganization = {
  _id: mongoose.Types.ObjectId;
  name: string;
  ownerUserId: mongoose.Types.ObjectId;
  trialEndsAt: Date;
};

export async function processTrialExpirationEmailJobs(
  options: { limit?: number; baseUrl?: string } = {}
) {
  await connectDB();

  const requestedLimit = options.limit ?? DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, requestedLimit));
  const now = new Date();
  const candidates = await OrganizationModel.find({
    plan: 'trial',
    trialEndsAt: { $lte: now },
    trialExpirationEmailSentAt: null,
  })
    .sort({ trialExpirationEmailLastAttemptAt: 1, trialEndsAt: 1 })
    .limit(limit)
    .select('_id name ownerUserId trialEndsAt')
    .lean<TrialExpirationOrganization[]>();

  let sent = 0;
  let skipped = 0;
  const failures: TrialExpirationEmailFailure[] = [];

  for (const candidate of candidates) {
    const claimedAt = new Date();
    const claimId = randomUUID();
    const claimedOrganization = await OrganizationModel.findOneAndUpdate(
      {
        _id: candidate._id,
        plan: 'trial',
        trialEndsAt: { $lte: claimedAt },
        trialExpirationEmailSentAt: null,
        $or: [
          { trialExpirationEmailClaimedAt: null },
          { trialExpirationEmailClaimedAt: { $lte: new Date(claimedAt.getTime() - CLAIM_LEASE_MS) } },
        ],
      },
      {
        $set: {
          trialExpirationEmailLastAttemptAt: claimedAt,
          trialExpirationEmailClaimedAt: claimedAt,
          trialExpirationEmailClaimId: claimId,
        },
      },
      { new: true }
    )
      .select('_id name ownerUserId trialEndsAt')
      .lean<TrialExpirationOrganization | null>();

    if (!claimedOrganization) {
      skipped += 1;
      continue;
    }

    let failureReason: TrialExpirationEmailFailureReason = 'email_delivery_failed';
    try {
      const owner = await Users.findOne({
        _id: claimedOrganization.ownerUserId,
        isActive: true,
        isDeleted: false,
        pendingAccount: { $ne: true },
      })
        .select('email firstName lastName name')
        .lean<{
          email: string;
          firstName?: string;
          lastName?: string;
          name?: string;
        } | null>();

      if (!owner?.email) {
        failureReason = 'owner_unavailable';
        throw new Error('Workspace owner is unavailable for trial expiration email.');
      }

      const recipientName =
        [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || owner.name || null;
      const delivery = await sendTrialExpirationEmail({
        email: owner.email,
        messageId: `<trial-expiration-${String(claimedOrganization._id)}@signworkflow.com>`,
        recipientName,
        workspaceName: claimedOrganization.name,
        trialEndsAt: claimedOrganization.trialEndsAt,
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      });

      if (!delivery.success) {
        throw new Error(delivery.error || 'Trial expiration email delivery failed.');
      }

      const acknowledgement = await OrganizationModel.updateOne(
        { _id: claimedOrganization._id, trialExpirationEmailClaimId: claimId },
        {
          $set: { trialExpirationEmailSentAt: new Date() },
          $unset: {
            trialExpirationEmailClaimedAt: 1,
            trialExpirationEmailClaimId: 1,
          },
        }
      );

      if (acknowledgement.modifiedCount !== 1) {
        failureReason = 'send_acknowledgement_failed';
        throw new Error('Trial expiration email was sent but its delivery marker was not recorded.');
      }

      sent += 1;
    } catch (error) {
      await OrganizationModel.updateOne(
        { _id: claimedOrganization._id, trialExpirationEmailClaimId: claimId },
        {
          $unset: {
            trialExpirationEmailClaimedAt: 1,
            trialExpirationEmailClaimId: 1,
          },
        }
      );
      failures.push({ organizationId: String(claimedOrganization._id), reason: failureReason });
      console.error('Trial expiration email job failed.', {
        organizationId: String(claimedOrganization._id),
        reason: failureReason,
        error: error instanceof Error ? error.message : 'Unknown delivery error.',
      });
    }
  }

  return {
    processed: candidates.length - skipped,
    sent,
    failed: failures.length,
    skipped,
    failures,
  };
}
