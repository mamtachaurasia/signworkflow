import { NextRequest, NextResponse } from 'next/server';
import { stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';
import connectDB from '@/utils/db';
import DocumentModel, { IVersionDoc } from '@/models/Document';
import { sendOwnerDocumentEventEmail, sendSigningRejectedEmail } from '@/lib/email';
import { processSigningEmailJobs, stageNextSigningEmails } from '@/lib/signing-email-jobs';
import { applySigningAction } from '@/lib/signing-actions';
import {
  buildSigningTokenLookup,
  recipientMatchesSigningToken,
  type RecipientTokenShape,
} from '@/lib/signing-token';
import { getLatestPreparedVersion, isRecipientTurn, normalizeIp } from '@/lib/signing-utils';
import Users from '@/models/Users';
import { applyRetentionToDocument, computeRetentionFields } from '@/lib/retention';
import { getEffectiveUserSettingsByUserId } from '@/lib/org-settings-server';
import { hasAcceptedEsignDisclosure } from '@/lib/esign-disclosure';
import { createDocumentEventNotification } from '@/lib/notifications';
import { writeAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const {
      token: rawToken,
      action,
      location,
      device,
      consent
    } = await req.json();
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';

    if (!token) {
      return NextResponse.json({ message: 'Token is required' }, { status: 400 });
    }

    /* =====================================================
       FIND DOCUMENT + RECIPIENT (TOKEN IS AUTH)
    ===================================================== */
    const document = await DocumentModel.findOne(buildSigningTokenLookup(token));

    if (!document) {
      return NextResponse.json(
        { message: 'Invalid or expired signing link' },
        { status: 404 }
      );
    }
    if (document.deletedAt) {
      return NextResponse.json({ message: 'Document has been trashed.' }, { status: 410 });
    }
    if (document.status === 'completed' || document.status === 'voided' || document.status === 'rejected') {
      const message =
        document.status === 'rejected'
          ? 'This signing request was rejected.'
          : 'Document is not available for signing.';
      return NextResponse.json({ message }, { status: 409 });
    }

    const recipient = document.recipients.find((candidate: RecipientTokenShape) =>
      recipientMatchesSigningToken(candidate, token)
    );

    if (!recipient) {
      return NextResponse.json(
        { message: 'Recipient not found' },
        { status: 404 }
      );
    }

    if (!hasAcceptedEsignDisclosure(recipient.consent)) {
      return NextResponse.json(
        {
          message: 'You must accept the Electronic Record and Signature Disclosure before continuing.',
          reason: 'esign_consent_required',
        },
        { status: 403 }
      );
    }

    /* =====================================================
       EXPIRY CHECK
    ===================================================== */
    const preparedVersion = getLatestPreparedVersion(document.versions || []);
    if (preparedVersion?.expiresAt && new Date() > new Date(preparedVersion.expiresAt)) {
      recipient.status = 'expired';
      await document.save();

      return NextResponse.json(
        { message: 'Signing link expired' },
        { status: 410 }
      );
    }

    if (recipient.expiresAt && new Date() > recipient.expiresAt) {
      recipient.status = 'expired';
      await document.save();

      return NextResponse.json(
        { message: 'Signing link expired' },
        { status: 410 }
      );
    }

    /* =====================================================
       PREVENT REUSE
    ===================================================== */
    if (['signed', 'approved'].includes(recipient.status)) {
      return NextResponse.json({ success: true });
    }

    if (['rejected', 'expired'].includes(recipient.status)) {
      return NextResponse.json(
        { message: 'Signing link no longer valid' },
        { status: 401 }
      );
    }

    /* =====================================================
       SEQUENTIAL SIGNING ENFORCEMENT
    ===================================================== */
    if (document.signingMode === 'sequential') {
      if (!isRecipientTurn(recipient, document.recipients)) {
        return NextResponse.json(
          { message: 'Signing not allowed yet' },
          { status: 403 }
        );
      }
    }

    const signedVersionFromRecipient =
      recipient.signedVersion != null
        ? document.versions.find((v: IVersionDoc) => v.version === recipient.signedVersion)
        : undefined;
    const signedVersionFromChain = document.versions
      .filter((v: IVersionDoc) => {
        if (Array.isArray(v.signedBy)) {
          return v.signedBy.includes(recipient.id);
        }
        return v.signedBy === recipient.id;
      })
      .sort((a: IVersionDoc, b: IVersionDoc) => (b.version ?? 0) - (a.version ?? 0))[0];
    const signedVersion = signedVersionFromRecipient ?? signedVersionFromChain;
    if (action === 'signed' && !signedVersion) {
      return NextResponse.json(
        { message: 'Signed PDF missing. Please sign via the signing endpoint.' },
        { status: 409 }
      );
    }

    /* =====================================================
       GPS CONSENT CHECK
    ===================================================== */
    const requiresGps =
      recipient.captureGpsLocation === true;

    if (requiresGps && action !== 'rejected') {
      if (!location || !consent?.locationGranted) {
        return NextResponse.json(
          { message: 'GPS location consent is required' },
          { status: 400 }
        );
      }
    }

    /* =====================================================
       APPLY ACTION
    ===================================================== */
    const { ip, ipUnavailableReason } = normalizeIp(req.headers.get('x-forwarded-for'));
    const userAgent = req.headers.get('user-agent') ?? undefined;
    const actionAt = new Date();

    if (recipient.role === 'signer') {
      if (!['signed', 'rejected'].includes(action)) {
        return NextResponse.json({ message: 'Invalid signer action' }, { status: 400 });
      }
    }

    if (recipient.role === 'approver') {
      if (!['approved', 'rejected'].includes(action)) {
        return NextResponse.json({ message: 'Invalid approver action' }, { status: 400 });
      }
    }
    const { nextRecipientsToNotify } = applySigningAction({
      document,
      recipient,
      action,
      actionAt,
      version: signedVersion?.version,
      baseVersion: signedVersion?.derivedFromVersion,
      location,
      device,
      consent,
      ip,
      ipUnavailableReason,
      userAgent,
    });
    stageNextSigningEmails(document, nextRecipientsToNotify, actionAt);

    if (document.status === 'completed') {
      const retention = await computeRetentionFields({
        document: document.toObject(),
        completionAt: actionAt,
      });
      applyRetentionToDocument(document, retention, new Date());
    }

    if (document.status === 'completed') {
      const finalizedVersion = document.versions.find((version: IVersionDoc) => version.version === document.currentVersion);
      stageDocumentIntegrationEvent(document, { event: 'document_finalized', createdAt: actionAt,
        metadata: { version: document.currentVersion, finalHash: finalizedVersion?.hash ?? null, completionAction: action } });
    }
    await document.save();

    if (document.status === 'completed') {
      const finalizedVersion = document.versions.find(
        (version: IVersionDoc) => version.version === document.currentVersion
      );
      await writeAuditEvent({
        userId: document.userId,
        orgId: document.orgId,
        documentId: document._id,
        actor: recipient.id,
        action: 'document_finalized',
        ipAddress: ip,
        userAgent,
        metadata: {
          version: finalizedVersion?.version ?? document.currentVersion,
          finalHash: finalizedVersion?.hash ?? null,
          completionAction: action,
        },
      });
    }

    try {
      if (action === 'rejected') {
        await createDocumentEventNotification({
          type: 'document.declined',
          ownerUserId: document.userId,
          orgId: document.orgId ? String(document.orgId) : null,
          documentId: document._id,
          documentName: document.documentName,
          recipient,
          actionAt,
        });
      }

      if (action === 'signed' || action === 'approved') {
        await createDocumentEventNotification({
          type: 'document.signed',
          ownerUserId: document.userId,
          orgId: document.orgId ? String(document.orgId) : null,
          documentId: document._id,
          documentName: document.documentName,
          recipient,
          actionAt,
          metadata: {
            action,
            version: signedVersion?.version ?? null,
          },
        });
      }

      if (document.status === 'completed') {
        await createDocumentEventNotification({
          type: 'document.completed',
          ownerUserId: document.userId,
          orgId: document.orgId ? String(document.orgId) : null,
          documentId: document._id,
          documentName: document.documentName,
          recipient,
          actionAt,
          metadata: {
            action,
            version: signedVersion?.version ?? null,
          },
        });
      }
    } catch (err) {
      console.error('Failed to create sender notification:', err);
    }

    try {
      const owner = await Users.findById(document.userId).select('email').lean<{ email?: unknown }>();
      const ownerEmail = typeof owner?.email === 'string' ? owner.email : undefined;
      const ownerSettings = await getEffectiveUserSettingsByUserId(
        String(document.userId),
        document.orgId ? String(document.orgId) : null
      );
      const sendImmediate = ownerSettings.emailDigest === 'immediate';

      if (ownerEmail) {
        if (sendImmediate && action === 'rejected' && ownerSettings.notifyOnDeclined) {
          await sendSigningRejectedEmail(ownerEmail, document.documentName, recipient);
        }

        if (
          sendImmediate &&
          (action === 'signed' || action === 'approved') &&
          ownerSettings.notifyOnSigned
        ) {
          await sendOwnerDocumentEventEmail({
            toEmail: ownerEmail,
            documentName: document.documentName,
            event: 'signed',
            recipient,
          });
        }

        if (sendImmediate && document.status === 'completed' && ownerSettings.notifyOnCompleted) {
          await sendOwnerDocumentEventEmail({
            toEmail: ownerEmail,
            documentName: document.documentName,
            event: 'completed',
            recipient,
          });
        }
      }
    } catch (err) {
      console.error('Failed to send sender notification email:', err);
    }

    if (nextRecipientsToNotify.length > 0) {
      try {
        await processSigningEmailJobs({ documentId: String(document._id), limit: nextRecipientsToNotify.length });
      } catch (err) {
        console.error('Signing email processing deferred:', err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('SIGN ERROR:', error);
    return NextResponse.json(
      { message: 'Failed to update document status' },
      { status: 500 }
    );
  }
}
