import { NextRequest, NextResponse } from 'next/server';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  withSecurityHeaders,
} from '@/lib/auth';
import { getAccountDeletionGraceDays } from '@/lib/user-deletion';
import connectDB from '@/utils/db';
import { authenticateRequest } from '@/middleware/authMiddleware';
import DocumentModel from '@/models/Document';
import MembershipModel from '@/models/Membership';
import OrganizationModel from '@/models/Organization';
import UserModel from '@/models/Users';

export const runtime = 'nodejs';

export async function OPTIONS(req: NextRequest) {
  return withSecurityHeaders(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  getClientIp(req);
  getUserAgent(req);

  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authentication endpoints.' }, { status: 400 })
    );
  }

  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return withSecurityHeaders(req, auth.response);
  }

  const userId = String(auth.context.user._id);

  try {
    await connectDB();

    const ownedDocumentFilter = { userId, deletedAt: null };
    const signedDocumentFilter = {
      ...ownedDocumentFilter,
      $or: [
        { status: { $in: ['signed', 'completed', 'final'] } },
        { completedAt: { $ne: null } },
        { finalizedAt: { $ne: null } },
        { 'signingEvents.action': { $in: ['signed', 'approved'] } },
      ],
    };
    const pendingRequestFilter = {
      ...ownedDocumentFilter,
      status: { $in: ['sent', 'pending', 'in_progress'] },
      recipients: {
        $elemMatch: {
          role: { $in: ['signer', 'approver'] },
          status: { $in: ['pending', 'sent', 'viewed', 'delivery_failed'] },
        },
      },
    };

    const memberships = await MembershipModel.find({ userId, status: 'active' })
      .select('orgId role status')
      .lean<Array<{ orgId: unknown; role: string; status: string }>>();
    const orgIds = memberships.map((membership) => membership.orgId);

    const [
      user,
      documentsStored,
      signedDocuments,
      pendingSignatureRequests,
      organizations,
    ] = await Promise.all([
      UserModel.findById(userId)
        .select('+passwordHash +password mfaEnabled')
        .lean<{ passwordHash?: string; password?: string; mfaEnabled?: boolean } | null>(),
      DocumentModel.countDocuments(ownedDocumentFilter),
      DocumentModel.countDocuments(signedDocumentFilter),
      DocumentModel.aggregate<{ count: number }>([
        { $match: pendingRequestFilter },
        { $unwind: '$recipients' },
        {
          $match: {
            'recipients.role': { $in: ['signer', 'approver'] },
            'recipients.status': { $in: ['pending', 'sent', 'viewed', 'delivery_failed'] },
          },
        },
        { $count: 'count' },
      ]).then((rows) => rows[0]?.count || 0),
      orgIds.length > 0
        ? OrganizationModel.find({ _id: { $in: orgIds } })
            .select('name plan status billing.subscriptionStatus billing.cancelAtPeriodEnd billing.currentPeriodEnd')
            .lean<Array<{
              _id: unknown;
              name?: string;
              plan?: string;
              status?: string;
              billing?: {
                subscriptionStatus?: string;
                cancelAtPeriodEnd?: boolean;
                currentPeriodEnd?: Date | string | null;
              };
            }>>()
        : Promise.resolve([]),
    ]);

    const orgById = new Map(organizations.map((org) => [String(org._id), org]));
    const teamMemberships = memberships.map((membership) => {
      const org = orgById.get(String(membership.orgId));
      return {
        orgId: String(membership.orgId),
        name: org?.name || 'Unknown workspace',
        role: membership.role,
        status: membership.status,
      };
    });

    const subscriptionWorkspaces = organizations
      .filter((org) => org.billing?.subscriptionStatus || org.plan)
      .map((org) => ({
        orgId: String(org._id),
        name: org.name || 'Unknown workspace',
        plan: org.plan || 'trial',
        workspaceStatus: org.status || 'active',
        subscriptionStatus: org.billing?.subscriptionStatus || '',
        cancelAtPeriodEnd: org.billing?.cancelAtPeriodEnd === true,
        currentPeriodEnd: org.billing?.currentPeriodEnd || null,
      }));

    const graceDays = getAccountDeletionGraceDays();
    const scheduledDeletionDate = new Date();
    scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + graceDays);

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          email: auth.context.user.email,
          counts: {
            documentsStored,
            signedDocuments,
            pendingSignatureRequests,
            teamMemberships: teamMemberships.length,
            subscriptions: subscriptionWorkspaces.filter((workspace) => workspace.subscriptionStatus).length,
          },
          teamMemberships,
          subscriptionWorkspaces,
          verification: {
            passwordAvailable: Boolean(user?.passwordHash || user?.password),
            googleAvailable: Boolean(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
            mfaRequired: user?.mfaEnabled === true,
          },
          graceDays,
          scheduledDeletionDate: scheduledDeletionDate.toISOString(),
          implications: [
            'You will lose access to your documents and workspace data immediately.',
            'Pending signature requests you started will be cancelled.',
            'Recipients may no longer access shared documents where your account controls access.',
            'Signed documents, audit trails, retention records, billing records, and legal-hold evidence may be retained when required by law, contract, tax, fraud-prevention, or compliance obligations.',
            'Your account can be restored during the grace period by signing in again.',
          ],
        },
        { status: 200 }
      )
    );
  } catch (err) {
    console.error('Delete account review route error:', err);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    );
  }
}
