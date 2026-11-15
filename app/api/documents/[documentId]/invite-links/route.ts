import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

import connectDB from '@/utils/db';
import { resolvePublicBaseUrl } from '@/lib/app-url';
import DocumentModel, { type IDocumentRecipient } from '@/models/Document';
import { issueSigningToken } from '@/lib/signing-token';
import { isAdminRole } from '@/lib/role-utils';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import { hasDocumentShareAccess, normalizeShareEmail } from '@/lib/document-sharing';
import UserModel from '@/models/Users';

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export const POST = withTrialWriteAccessFromAuthContext(async function POST(
  req: NextRequest,
  context: RouteContext,
  authContext
) {
  try {
    await connectDB();
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const inviteLinkGuard = await getPlanGateForOrgFeature({
      orgId: authContext.orgId,
      feature: 'invite_links',
    });
    if (!inviteLinkGuard.allowed) {
      return NextResponse.json({ message: inviteLinkGuard.message }, { status: inviteLinkGuard.status });
    }

    const { documentId } = await context.params;
    const document = await DocumentModel.findById(documentId);
    if (!document) {
      return NextResponse.json({ message: 'Document not found' }, { status: 404 });
    }

    const inSameWorkspace = document.orgId && String(document.orgId) === authContext.orgId;
    const isOwner = String(document.userId) === authContext.userId && inSameWorkspace;
    const isWorkspaceAdmin = inSameWorkspace && isAdminRole(authContext.orgRole);
    const requester = mongoose.Types.ObjectId.isValid(authContext.userId)
      ? await UserModel.findById(authContext.userId)
          .select('email')
          .lean<{ email?: unknown } | null>()
      : null;
    const requesterEmail = normalizeShareEmail(requester?.email);
    const hasSharedSendAccess = hasDocumentShareAccess({
      sharedWith: document.sharedWith,
      requesterEmail,
      minimumAccess: 'can_send',
    });

    if (!isOwner && !isWorkspaceAdmin && !hasSharedSendAccess) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    if (!['sent', 'pending', 'in_progress', 'delivery_failed'].includes(document.status)) {
      return NextResponse.json(
        { message: 'Invite links are available only for active signing requests.' },
        { status: 409 }
      );
    }

    const baseUrl = resolvePublicBaseUrl({ req });
    const links: Array<{
      recipientId: string;
      name: string;
      email: string;
      role: string;
      status: string;
      url: string;
    }> = [];

    document.recipients = document.recipients.map((recipient: IDocumentRecipient) => {
      if (recipient.isCC || ['signed', 'approved', 'rejected'].includes(recipient.status)) {
        return recipient;
      }

      const issuedToken = issueSigningToken();
      recipient.signingTokenHash = issuedToken.tokenHash;
      const url = `${baseUrl}/sign/${issuedToken.token}?recipient=${encodeURIComponent(recipient.id)}`;

      links.push({
        recipientId: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        status: recipient.status,
        url,
      });

      return recipient;
    });

    await document.save();

    return NextResponse.json({
      success: true,
      links,
    });
  } catch (error) {
    console.error('Invite links route failed:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
});
