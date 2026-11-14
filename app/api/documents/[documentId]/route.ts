import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import Document, { type IDocumentRecipient } from '@/models/Document';
import User from '@/models/Users';
import { getObjectStream, getStorageBucketName, normalizeStorageProvider } from '@/lib/s3';
import { getAuthContext } from '@/lib/auth-context';
import { sanitizeRecipients } from '@/lib/recipient-sanitizer';
import { getLatestPreparedVersion } from '@/lib/signing-utils';
import { recipientMatchesSigningToken, type RecipientTokenShape } from '@/lib/signing-token';
import { getMembershipRoleForUser } from '@/lib/orgs';
import { getEffectiveUserSettingsByUserId } from '@/lib/org-settings-server';
import { sendOwnerDocumentEventEmail } from '@/lib/email';
import { canReadDocument, resolveDocumentReadScope } from '@/lib/document-access';
import { createDocumentEventNotification } from '@/lib/notifications';
import { getDocumentShareForEmail, getDocumentShareForToken } from '@/lib/document-sharing';

type SafeRecipientProjection = {
  id: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
  status: string | null;
  order: number | null;
  isCC: boolean;
  color: string | null;
  captureGpsLocation: boolean;
  sendReminders: boolean;
  reminderDays: number | null;
  expiresAt: unknown;
  viewedAt: unknown;
  signedAt: unknown;
  signedVersion: number | null;
  approvedAt: unknown;
  rejectedAt: unknown;
};

type DocumentVersionProjection = {
  version?: number;
  storage?: {
    bucket?: string;
    key?: string;
    region?: string;
  };
};

function buildSafeRecipientProjection(recipient: unknown): SafeRecipientProjection {
  const source = (recipient ?? {}) as Record<string, unknown>;
  return {
    id: typeof source.id === 'string' ? source.id : null,
    email: typeof source.email === 'string' ? source.email : null,
    name: typeof source.name === 'string' ? source.name : null,
    role: typeof source.role === 'string' ? source.role : null,
    status: typeof source.status === 'string' ? source.status : null,
    order: typeof source.order === 'number' ? source.order : null,
    isCC: Boolean(source.isCC),
    color: typeof source.color === 'string' ? source.color : null,
    captureGpsLocation: Boolean(source.captureGpsLocation),
    sendReminders: Boolean(source.sendReminders),
    reminderDays: typeof source.reminderDays === 'number' ? source.reminderDays : null,
    expiresAt: source.expiresAt ?? null,
    viewedAt: source.viewedAt ?? null,
    signedAt: source.signedAt ?? null,
    signedVersion: typeof source.signedVersion === 'number' ? source.signedVersion : null,
    approvedAt: source.approvedAt ?? null,
    rejectedAt: source.rejectedAt ?? null,
  };
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    await connectDB()
    const url = new URL(req.url);
    const signingToken = url.searchParams.get('token')?.trim() || null;
    const shareToken = url.searchParams.get('shareToken')?.trim() || null;
    let guestId = url.searchParams.get('guestId');
    // Sanitize guestId to handle potential frontend issues where "null" or "undefined" strings are sent
    if (!guestId || guestId === 'null' || guestId === 'undefined') {
      guestId = null;
    }
    const context = await getAuthContext(req);
    const sessionUserId = context?.userId ?? null;
    const userId = sessionUserId ? String(sessionUserId) : null;
    const orgId = context?.orgId ?? null;
    const orgRole = context?.orgRole ?? null;

    const { documentId } = await params;
    console.log(`[GET DOCUMENT] Fetching document: ${documentId}`);

    const document = await Document.findById(documentId);

    if (!document) {
      console.warn(`[GET DOCUMENT] Document ${documentId} not found`);
      return NextResponse.json({ message: 'Document not found' }, { status: 404 });
    }

    const docUserId = String(document.userId);
    const docOrgId = document.orgId ? String(document.orgId) : null;
    const docTeamId = document.teamId ? String(document.teamId) : null;
    const tokenRecipient =
      signingToken && Array.isArray(document.recipients)
        ? document.recipients.find((recipient: RecipientTokenShape) =>
            recipientMatchesSigningToken(recipient, signingToken)
          )
        : null;
    const hasSigningTokenAccess = Boolean(tokenRecipient);
    const tokenShare = getDocumentShareForToken(document.sharedWith, shareToken);
    const hasShareTokenAccess = Boolean(tokenShare);

    if (!userId && !guestId && !hasSigningTokenAccess && !hasShareTokenAccess) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // If the document is owned by a registered user (not a guest), and there is no active session,
    if (!docUserId.startsWith('guest_') && !userId && !hasSigningTokenAccess && !hasShareTokenAccess) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const isOwner = userId && docUserId === userId && (!docOrgId || docOrgId === orgId);
    const isGuestOwner = guestId && docUserId === guestId;
    const isTokenRecipient = hasSigningTokenAccess;
    let isPrivilegedRequester = false;
    let isTeamMemberRequester = false;
    let isRecipientEmailAccess = false;
    let requesterEmail: string | null = null;

    let hasAccess = Boolean(isOwner || isGuestOwner || isTokenRecipient || hasShareTokenAccess);

    if (userId && (!hasAccess || hasSigningTokenAccess || hasShareTokenAccess)) {
      try {
        const user = await User.findById(userId);
        if (user) {
          requesterEmail = normalizeEmail(user.email);
          let effectiveOrgRole: string | null = null;
          if (docOrgId && docOrgId === orgId) {
            effectiveOrgRole = await getMembershipRoleForUser(userId, docOrgId);
          } else if (!docOrgId && orgRole) {
            effectiveOrgRole = orgRole;
          }

          const readScope = await resolveDocumentReadScope(userId, orgId, effectiveOrgRole);
          isPrivilegedRequester = readScope.hasOrgWideReadAccess;
          isTeamMemberRequester = Boolean(
            docTeamId && readScope.accessibleTeamIds.includes(docTeamId)
          );

          if (
            canReadDocument({
              userId,
              orgId,
              orgRole: effectiveOrgRole,
              documentUserId: docUserId,
              documentOrgId: docOrgId,
              documentTeamId: docTeamId,
              requesterEmail,
              sharedWith: document.sharedWith,
              accessibleTeamIds: readScope.accessibleTeamIds,
            })
          ) {
            hasAccess = true;
          } else if (document.recipients && Array.isArray(document.recipients)) {
            isRecipientEmailAccess = document.recipients.some((recipient: unknown) => {
              const recipientRecord = recipient as Record<string, unknown>;
              return normalizeEmail(recipientRecord.email) === requesterEmail;
            });
            hasAccess = hasAccess || isRecipientEmailAccess;
          }
        } else {
          if (!hasAccess) {
            // User ID from session not found in DB - treat as unauthorized to trigger refresh/logout
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
        }
      } catch (e) {
        console.error('[GET DOCUMENT] Error checking recipient status:', e);
        return NextResponse.json({ message: 'Internal Server Error checking permissions' }, { status: 500 });
      }
    }

    if (!hasAccess) {
      console.warn(`[GET DOCUMENT] Forbidden. DocId: ${documentId}, User: ${userId}, Owner: ${docUserId}`);
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const matchedRecipientEmailEntries: unknown[] =
      requesterEmail && Array.isArray(document.recipients)
        ? document.recipients.filter((recipient: unknown) => {
            const recipientRecord = recipient as Record<string, unknown>;
            return normalizeEmail(recipientRecord.email) === requesterEmail;
          })
        : [];
    const isRecipientEmailOnlyAccess = Boolean(
      isRecipientEmailAccess && !isOwner && !isPrivilegedRequester && !isTokenRecipient
    );
    const hasIndependentDocumentAccess = Boolean(
      isOwner || isGuestOwner || isPrivilegedRequester || isTeamMemberRequester
    );
    const isRestrictedSigningTokenAccess = Boolean(isTokenRecipient && !hasIndependentDocumentAccess);
    const isRestrictedShareTokenAccess = Boolean(hasShareTokenAccess && !hasIndependentDocumentAccess);

    if (
      isRestrictedSigningTokenAccess ||
      isRestrictedShareTokenAccess ||
      isRecipientEmailOnlyAccess
    ) {
      if (document.deletedAt) {
        return NextResponse.json({ message: 'Document has been trashed.' }, { status: 410 });
      }
      if (document.status === 'voided') {
        return NextResponse.json({ message: 'Document has been voided.' }, { status: 409 });
      }
      const isRejectedRecipientAccess = isRestrictedSigningTokenAccess
        ? tokenRecipient?.status === 'rejected'
        : matchedRecipientEmailEntries.some((recipient: unknown) => {
            const recipientRecord = recipient as Record<string, unknown>;
            return recipientRecord.status === 'rejected';
          });
      if (document.status === 'rejected' && !isRejectedRecipientAccess) {
        return NextResponse.json({ message: 'This signing request was rejected.' }, { status: 409 });
      }
      const preparedVersion = getLatestPreparedVersion(document.versions || []);
      if (!preparedVersion) {
        return NextResponse.json({ message: 'Prepared version not found' }, { status: 404 });
      }
      if (preparedVersion.expiresAt && new Date() > new Date(preparedVersion.expiresAt)) {
        return NextResponse.json({ message: 'Signing link has expired' }, { status: 410 });
      }
    }

    const shouldTrackView = Boolean(tokenRecipient) || isRecipientEmailOnlyAccess;
    const viewedRecipients: IDocumentRecipient[] = [];
    const canPersistRecipients = typeof (document as { save?: unknown }).save === 'function';

    if (shouldTrackView && canPersistRecipients) {
      const now = new Date();
      if (tokenRecipient) {
        const recipientRecord = tokenRecipient as IDocumentRecipient;
        if (!recipientRecord.viewedAt) {
          recipientRecord.viewedAt = now;
          if (recipientRecord.status === 'pending' || recipientRecord.status === 'sent') {
            recipientRecord.status = 'viewed';
          }
          viewedRecipients.push(recipientRecord);
        }
      } else if (isRecipientEmailOnlyAccess) {
        matchedRecipientEmailEntries.forEach((entry) => {
          const recipientRecord = entry as IDocumentRecipient;
          if (!recipientRecord.viewedAt) {
            recipientRecord.viewedAt = now;
            if (recipientRecord.status === 'pending' || recipientRecord.status === 'sent') {
              recipientRecord.status = 'viewed';
            }
            viewedRecipients.push(recipientRecord);
          }
        });
      }
    }

    if (viewedRecipients.length > 0 && canPersistRecipients) {
      await document.save();

      try {
        await createDocumentEventNotification({
          type: 'document.viewed',
          ownerUserId: docUserId,
          orgId: docOrgId,
          documentId: document._id,
          documentName: document.documentName,
          recipient: viewedRecipients[0],
          actionAt: viewedRecipients[0].viewedAt ? new Date(viewedRecipients[0].viewedAt) : new Date(),
        });
      } catch (err) {
        console.error('[GET DOCUMENT] Failed to create viewed notification:', err);
      }

      try {
        const owner = await User.findById(document.userId).select('email').lean<{
          email?: unknown;
        } | null>();
        const ownerEmail = typeof owner?.email === 'string' ? owner.email : null;
        const ownerSettings = await getEffectiveUserSettingsByUserId(docUserId, docOrgId);
        const sendImmediate = ownerSettings.emailDigest === 'immediate';

        if (ownerEmail && sendImmediate && ownerSettings.notifyOnViewed) {
          await sendOwnerDocumentEventEmail({
            toEmail: ownerEmail,
            documentName: document.documentName,
            event: 'viewed',
            recipient: viewedRecipients[0],
          });
        }
      } catch (err) {
        console.error('[GET DOCUMENT] Failed to send viewed email notification:', err);
      }
    }

    // Content Negotiation: Return JSON if explicitly requested
    const acceptHeader = req.headers.get('accept') || '';
    if (acceptHeader.includes('application/json')) {
      if (isRestrictedSigningTokenAccess) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
      const safeRecipients = sanitizeRecipients(document.recipients || []).map(buildSafeRecipientProjection);
      const shouldRestrictRecipients = Boolean(
        isRecipientEmailAccess && !isOwner && !isPrivilegedRequester && !isTeamMemberRequester
      );
      const recipientsProjection = shouldRestrictRecipients
        ? safeRecipients.filter((recipient) => normalizeEmail(recipient.email) === requesterEmail)
        : safeRecipients;
      const canViewGovernanceMetadata = Boolean(isOwner || isPrivilegedRequester);
      const requesterEmailShare = getDocumentShareForEmail(document.sharedWith, requesterEmail);
      const safeDocument = {
        _id: document._id,
        documentId: document._id,
        documentName: document.documentName,
        originalFileName: document.originalFileName,
        currentVersion: document.currentVersion,
        status: document.status,
        signingMode: document.signingMode,
        teamId: docTeamId,
        derivedFromDocumentId: document.derivedFromDocumentId ?? null,
        derivedFromVersion: document.derivedFromVersion ?? null,
        recipients: recipientsProjection,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        completedAt: document.completedAt ?? null,
        finalizedAt: document.finalizedAt ?? null,
        paymentRequest: document.paymentRequest ?? null,
        shareAccess: requesterEmailShare?.access ?? (tokenShare ? 'can_view' : null),
        retention: canViewGovernanceMetadata ? (document.retention ?? null) : null,
        legalHold: canViewGovernanceMetadata ? (document.legalHold ?? null) : null,
      };
      return NextResponse.json(safeDocument);
    }

    // Otherwise, serve the PDF file
    const versions = (Array.isArray(document.versions) ? document.versions : []) as DocumentVersionProjection[];
    const currentVersion = versions.find((version) => version.version === document.currentVersion);

    if (!currentVersion?.storage?.key) {
      return NextResponse.json({ message: 'Document file not found' }, { status: 404 });
    }

    const storageProvider = normalizeStorageProvider(
      (currentVersion.storage as { provider?: string } | undefined)?.provider
    );
    const bucket = currentVersion.storage.bucket || getStorageBucketName(storageProvider);
    const key = currentVersion.storage.key;
    if (!bucket || !key) {
      return NextResponse.json({ message: 'Document file not found' }, { status: 404 });
    }
    const region = currentVersion.storage.region;

    const stream = await getObjectStream({ bucket, key, region, provider: storageProvider });

    const safeFileName = (document.documentName || 'document').replace(/[^\w.-]/g, '_');

    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeFileName}.pdf"`,
      },
    });
  } catch (error) {
    console.error('[GET DOCUMENT] Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
