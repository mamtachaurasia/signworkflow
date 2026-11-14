import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import DocumentModel, { IDocumentRecipient, IVersionDoc } from '@/models/Document';
import { writeAuditEvent } from '@/lib/audit';
import { documentIntegrationUpdate, stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';
import { sha256Buffer } from '@/lib/hash';
import { getRegion, putObjectStream, copyObject, getStorageBucketName, getStorageProvider, normalizeStorageProvider, type StorageProvider } from '@/lib/s3';
import { nextSigningEmailUpdate, processSigningEmailJobs } from '@/lib/signing-email-jobs';
import { buildEventClient, buildEventConsent, buildEventGeo, buildSignedBySnapshot, getLatestPreparedVersion, getLatestSignedVersion, getNextSequentialOrder, isRecipientTurn, normalizeIp } from '@/lib/signing-utils';
import { issueSigningToken, recipientMatchesSigningToken } from '@/lib/signing-token';
import { buildSignedFieldRecords, deleteSignedFieldRecords, upsertSignedFieldRecords } from '@/lib/signed-fields';
import { hasAnySignedRecipient } from '@/lib/document-guards';
import { normalizeFieldOwner } from '@/lib/field-normalization';
import { applyRetentionToDocument, buildRetentionUpdatePayload, computeRetentionFields } from '@/lib/retention';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import { buildWorkspaceOwnedFilter } from '@/lib/workspace-scope';
import { buildDocumentWriteFilter } from '@/lib/document-sharing';
import UserModel from '@/models/Users';
import { parseJsonOrThrow } from '@/lib/json-parse-safe';
import { convertOfficeDocumentToPdf } from '@/lib/document-conversion';
import {
  getUploadSourceType,
  shouldConvertToPdf,
  toPreparedPdfFileName,
  validatePdfUploadMetadata,
} from '@/lib/pdf-upload-validation';
import { validateOfficeUploadBuffer } from '@/lib/office-upload-validation.server';

export const runtime = 'nodejs';
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_UPLOAD_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_SIZE_BYTES + MAX_UPLOAD_MULTIPART_OVERHEAD_BYTES;
const MAX_RECIPIENTS = 100;
const MAX_FIELDS = 500;

type PreparedFieldInput = {
  id?: string;
  recipientId?: string | null;
  value?: unknown;
  fieldOwner?: string;
  pageRect?: unknown;
  [key: string]: unknown;
};

function getPdfMime(): string {
  return 'application/pdf';
}

function sanitizePreparedFields(fields: PreparedFieldInput[]): PreparedFieldInput[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((field) => {
    if (!field || typeof field !== 'object') return field;
    const { pageRect, ...rest } = field;
    if (!pageRect || typeof pageRect !== 'object') return rest;
    const rect = pageRect as Record<string, unknown>;
    const cleaned = {
      x: typeof rect.x === 'number' ? rect.x : undefined,
      y: typeof rect.y === 'number' ? rect.y : undefined,
      width: typeof rect.width === 'number' ? rect.width : undefined,
      height: typeof rect.height === 'number' ? rect.height : undefined,
      top: typeof rect.top === 'number' ? rect.top : undefined,
      right: typeof rect.right === 'number' ? rect.right : undefined,
      bottom: typeof rect.bottom === 'number' ? rect.bottom : undefined,
      left: typeof rect.left === 'number' ? rect.left : undefined,
    };
    const hasAny = Object.values(cleaned).some((value) => typeof value === 'number');
    return hasAny ? { ...rest, pageRect: cleaned } : rest;
  });
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function validatePayloadLimits(fields: PreparedFieldInput[], recipients: IDocumentRecipient[]): string | null {
  if (fields.length > MAX_FIELDS) return `Too many fields. Maximum allowed is ${MAX_FIELDS}.`;
  if (recipients.length > MAX_RECIPIENTS) return `Too many recipients. Maximum allowed is ${MAX_RECIPIENTS}.`;
  return null;
}

function getActiveStorageTarget() {
  const provider = getStorageProvider();
  const bucket = getStorageBucketName(provider);

  if (!bucket) {
    console.error('Storage bucket environment variable is not set.');
    throw new Error('Storage bucket is not configured.');
  }

  return {
    provider,
    bucket,
    region: getRegion(provider),
  };
}

function getVersionStorageTarget(storage?: {
  provider?: string;
  bucket?: string;
  region?: string;
}) {
  const provider = normalizeStorageProvider(storage?.provider);
  const bucket = storage?.bucket || getStorageBucketName(provider);

  if (!bucket) {
    console.error('Storage bucket environment variable is not set.');
    throw new Error('Storage bucket is not configured.');
  }

  return {
    provider,
    bucket,
    region: storage?.region || getRegion(provider),
  };
}

function buildStorageMetadata(
  provider: StorageProvider,
  bucket: string,
  key: string,
  region: string
) {
  return {
    provider,
    bucket,
    key,
    region,
    url: `${provider}://${bucket}/${key}`,
  };
}

function buildOwnedDocumentFilter(
  userId: string,
  orgId: string | null,
  documentId: string,
  extra: Record<string, unknown> = {}
) {
  return buildWorkspaceOwnedFilter({
    userId,
    orgId,
    extra: {
      _id: documentId,
      ...extra,
    },
  });
}

async function handleSigningUpdate(
  documentId: string,
  userId: string,
  orgId: string | null,
  formData: FormData,
  pdfBuffer: Buffer,
  signingToken: string,
  req: NextRequest
): Promise<NextResponse> {
  const existingDoc = await DocumentModel.findOne(buildOwnedDocumentFilter(userId, orgId, documentId));
  if (!existingDoc) return NextResponse.json({ message: 'Document not found' }, { status: 404 });
  if (existingDoc.status === 'completed') {
    return NextResponse.json({ message: 'Completed documents are immutable. Create a new document to modify.' }, { status: 409 });
  }

  // Validate signingToken belongs to a recipient in this document
  const recipient = existingDoc.recipients.find((r: IDocumentRecipient) => recipientMatchesSigningToken(r, signingToken));
  if (!recipient) {
    return NextResponse.json({ message: 'Invalid signing token' }, { status: 401 });
  }

  const recipientId = recipient.id;
  const { ip, ipUnavailableReason } = normalizeIp(req.headers.get('x-forwarded-for'));
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const signedAt = new Date();

  const documentName = (formData.get('documentName') as string) || existingDoc.documentName || 'document.pdf';
  const fieldsData = formData.get('fields') as string | null;
  let fields: PreparedFieldInput[] = [];
  if (fieldsData) {
    try {
      fields = parseJsonOrThrow<PreparedFieldInput[]>(fieldsData, 'fields');
      if (!Array.isArray(fields)) fields = [];
    } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : 'Invalid fields JSON' }, { status: 400 });
    }
  }
  const eventClient = buildEventClient({ ip, userAgent, recipient });
  const eventGeo = buildEventGeo(recipient);
  const eventConsent = buildEventConsent(recipient);

  const { provider, bucket, region } = getActiveStorageTarget();

  // Determine Signing Mode
  const mode = existingDoc.signingMode;

  const preparedVersion = getLatestPreparedVersion(existingDoc.versions || []);
  if (!preparedVersion) {
    return NextResponse.json({ message: 'Prepared version not found' }, { status: 400 });
  }
  const latestSignedVersion = getLatestSignedVersion(existingDoc.versions || []);

  if (mode === 'sequential') {
    if (!isRecipientTurn(recipient, existingDoc.recipients)) {
      return NextResponse.json({ message: 'Sequential signing: Not your turn to sign' }, { status: 403 });
    }
  }

  const hasForeignValues = (fields || []).some((field: PreparedFieldInput) => {
    const owner = normalizeFieldOwner(field);
    if (owner === 'me') return false;
    const belongsToRecipient = field?.recipientId === recipientId;
    const value = field?.value;
    const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
    return hasValue && !belongsToRecipient;
  });
  if (hasForeignValues) {
    return NextResponse.json({ message: 'Fields include values for other recipients.' }, { status: 400 });
  }
  const recipientFields = (fields || []).filter((field: PreparedFieldInput) => {
    const owner = normalizeFieldOwner(field);
    if (owner === 'me') return false;
    return field?.recipientId === recipientId;
  });
  const eventFields = await Promise.all(
    recipientFields.map(async (field: PreparedFieldInput) => ({
      fieldId: String(field.id),
      fieldHash: await sha256Buffer(Buffer.from(`${String(field.id)}:${field.value ?? ''}`)),
    }))
  );
  const fieldsHash = await sha256Buffer(Buffer.from(JSON.stringify(eventFields)));

  const hash = await sha256Buffer(pdfBuffer);
  const size = pdfBuffer.length;
  const mimeType = getPdfMime();

  // ⚠️ RACE CONDITION GUARD: Prevent signing if base version changed
  // This ensures we always derive from the expected baseVersion
  const baseVersion = existingDoc.currentVersion;
  const basePreparedVersion = preparedVersion.version;
  const baseChainVersion = mode === 'sequential' && latestSignedVersion ? latestSignedVersion : preparedVersion;
  const baseChainVersionNumber = baseChainVersion.version;
  if (mode === 'sequential' && baseVersion !== baseChainVersionNumber) {
    return NextResponse.json({ message: 'Signing base version is stale. Please refresh.' }, { status: 409 });
  }

  // PARALLEL MODE LOGIC - Every signer creates a new signed version
  if (mode === 'parallel') {
    const newVersionNumber = baseVersion + 1;
    const key = `documents/${userId}/${documentId}/signed_${newVersionNumber}_${recipientId}.pdf`;

    await putObjectStream({ bucket, key, body: pdfBuffer, contentType: mimeType, contentLength: size, provider });

    // Check if this is the final signer
    const recipients = existingDoc.recipients || [];
    const recipientsAfterSign = recipients.map((r: IDocumentRecipient) =>
      r.id === recipientId ? { ...r, status: 'signed', signedVersion: newVersionNumber } : r
    );
    const allRecipientsSigned = recipientsAfterSign.every((r: IDocumentRecipient) => r.status === 'signed');
    const parLabel = allRecipientsSigned ? 'signed_final' : `signed_by_order_${recipient.order}`;
    const label = parLabel;

    const newVersion = {
      version: newVersionNumber,
      label,
      derivedFromVersion: baseChainVersionNumber,
      signedBy: buildSignedBySnapshot(recipientsAfterSign, newVersionNumber),
      storage: buildStorageMetadata(provider, bucket, key, region),
      hash,
      hashAlgo: 'SHA-256',
      size,
      mimeType,
      locked: true,
      status: 'final',
      documentName,
      changeLog: `Signed by recipient ${recipientId}`,
      changeMeta: {
        action: 'signed',
        actorId: recipientId,
        actorRole: recipient.role,
        signingMode: mode,
        baseVersion: baseChainVersionNumber,
        derivedFromVersion: baseChainVersionNumber,
        signedAt,
        source: 'client',
      },
      renderedBy: 'client',
      pdfSignedAt: signedAt,
      editHistory: [],
      createdAt: signedAt,
      updatedAt: signedAt
    };

    const { records: signedFieldRecords, fieldIds: signedFieldIds } = await buildSignedFieldRecords({
      documentId,
      version: newVersionNumber,
      recipientId,
      fields: recipientFields,
      eventFields,
      signedAt,
      ip,
      ipUnavailableReason,
      userAgent,
    });
    await upsertSignedFieldRecords(signedFieldRecords);

    const docUpdate: { $push: Record<string, unknown>; $set: Record<string, unknown> } = {
      $push: {
        versions: newVersion,
        signingEvents: {
          recipientId,
          action: 'signed',
          fields: eventFields,
          fieldsHash,
          fieldsHashAlgo: 'SHA-256',
          ip,
          ipUnavailableReason,
          userAgent,
          signedAt,
          serverTimestamp: signedAt,
          baseVersion: basePreparedVersion,
          version: newVersionNumber,
          order: recipient.order,
          client: eventClient,
          geo: eventGeo,
          consent: eventConsent,
        },
      },
      $set: {
        currentVersion: newVersionNumber,
        documentName: documentName,
        updatedAt: new Date(),
        status: allRecipientsSigned ? 'completed' : 'in_progress',
        "recipients.$[elem].status": 'signed',
        "recipients.$[elem].signedAt": signedAt,
        "recipients.$[elem].signedVersion": newVersionNumber,
      }
    };

    if (allRecipientsSigned) {
      docUpdate.$set.completedAt = signedAt;
      docUpdate.$set.finalizedAt = signedAt;

      const retention = await computeRetentionFields({
        document: existingDoc.toObject(),
        completionAt: signedAt,
      });
      const retentionUpdate = buildRetentionUpdatePayload({
        retention,
        docType: existingDoc.retention?.docType,
        jurisdiction: existingDoc.retention?.jurisdiction,
        governingLaw: existingDoc.retention?.governingLaw,
        customTriggerAt: existingDoc.retention?.customTriggerAt,
        evaluatedAt: new Date(),
      });
      Object.assign(docUpdate.$set, pruneUndefined(retentionUpdate));
    }

    // ⚠️ ATOMIC CHECK: Ensure base version hasn't changed (race condition protection)
    Object.assign(docUpdate.$set, documentIntegrationUpdate({ event: 'recipient_signed', documentId, orgId,
      createdAt: signedAt, metadata: { recipientId, version: newVersionNumber } }));
    if (allRecipientsSigned) Object.assign(docUpdate.$set, documentIntegrationUpdate({ event: 'document_finalized', documentId, orgId,
      createdAt: signedAt, metadata: { version: newVersionNumber, finalHash: hash } }));
    const updateResult = await DocumentModel.updateOne(
      { _id: documentId, currentVersion: baseVersion },
      docUpdate,
      { arrayFilters: [{ "elem.id": recipientId }] }
    );

    if (updateResult.matchedCount === 0) {
      await deleteSignedFieldRecords({
        documentId,
        version: newVersionNumber,
        recipientId,
        fieldIds: signedFieldIds,
      });
      return NextResponse.json({ message: 'Failed to save signing data, document state may have changed.' }, { status: 409 });
    }

    // The intent is now durable in the same guarded write as the signature.
    // writeAuditEvent attaches its audit ID to that source event and nudges the
    // source outbox, preventing the audit outbox from producing a second event.
    await writeAuditEvent({
      userId,
      orgId,
      documentId: existingDoc._id,
      actor: recipientId,
      action: 'recipient_signed',
      ipAddress: ip,
      userAgent,
      createdAt: signedAt,
      metadata: { ipUnavailableReason }
    });
    if (allRecipientsSigned) {
      await writeAuditEvent({
        userId,
        orgId,
        documentId: existingDoc._id,
        actor: recipientId,
        action: 'document_finalized',
        ipAddress: ip,
        userAgent,
        createdAt: signedAt,
        metadata: { ipUnavailableReason, finalHash: hash }
      });
    }

    return NextResponse.json({ success: true, documentId, version: newVersionNumber, message: 'Document signed successfully.' });
  }

  if (mode === 'sequential') {
    const seqRecipient = existingDoc.recipients.find((r: IDocumentRecipient) => r.id === recipientId);
    if (!seqRecipient) {
      return NextResponse.json({ message: 'Recipient not found for sequential signing.' }, { status: 404 });
    }

    // Create a NEW version for this signature
    const newVersionNumber = baseVersion + 1;
    const key = `documents/${userId}/${documentId}/signed_${newVersionNumber}_${recipient.id}.pdf`;

    await putObjectStream({ bucket, key, body: pdfBuffer, contentType: mimeType, contentLength: size, provider });

    const recipientsAfterSign = existingDoc.recipients.map((r: IDocumentRecipient) => (
      r.id === recipientId ? { ...r, status: 'signed', signedVersion: newVersionNumber } : r
    ));
    const nextOrder = getNextSequentialOrder(recipientsAfterSign);
    const allRecipientsSigned = recipientsAfterSign.every((r: IDocumentRecipient) => r.status === 'signed');
    const label = allRecipientsSigned ? 'signed_final' : `signed_by_order_${seqRecipient.order}`;
    const nextRecipientsToNotify =
      nextOrder !== null
        ? existingDoc.recipients.filter(
            (r: IDocumentRecipient) => r.role !== 'viewer' && r.order === nextOrder && r.status === 'pending'
          )
        : [];
    // Pending recipients store no reusable plaintext token. Issue and encrypt
    // each invitation before the atomic write that makes its hash usable.
    const nextInvitations: Array<{ recipient: IDocumentRecipient; token: string; tokenHash: string }> = nextRecipientsToNotify.map((nextRecipient: IDocumentRecipient) => ({
      recipient: nextRecipient,
      ...issueSigningToken(),
    }));

    const newVersion = {
      version: newVersionNumber,
      label,
      derivedFromVersion: baseChainVersionNumber,
      signedBy: buildSignedBySnapshot(recipientsAfterSign, newVersionNumber),
      storage: buildStorageMetadata(provider, bucket, key, region),
      hash,
      hashAlgo: 'SHA-256',
      size,
      mimeType,
      locked: true,
      status: 'final',
      documentName,
      changeLog: `Signed by recipient ${recipient.order} (${recipientId})`,
      changeMeta: {
        action: 'signed',
        actorId: recipientId,
        actorRole: recipient.role,
        signingMode: mode,
        baseVersion: baseChainVersionNumber,
        derivedFromVersion: baseChainVersionNumber,
        signedAt,
        source: 'client',
      },
      renderedBy: 'client',
      pdfSignedAt: signedAt,
      editHistory: [],
      createdAt: signedAt,
      updatedAt: signedAt
    };

    const { records: signedFieldRecords, fieldIds: signedFieldIds } = await buildSignedFieldRecords({
      documentId,
      version: newVersionNumber,
      recipientId,
      fields: recipientFields,
      eventFields,
      signedAt,
      ip,
      ipUnavailableReason,
      userAgent,
    });
    await upsertSignedFieldRecords(signedFieldRecords);

    const sentEvents =
      nextOrder !== null
        ? nextRecipientsToNotify.map((r: IDocumentRecipient) => ({
            recipientId: r.id,
            action: 'sent',
            sentAt: signedAt,
            serverTimestamp: signedAt,
            baseVersion: newVersionNumber,
            targetVersion: newVersionNumber + 1,
            order: r.order,
            ip,
            ipUnavailableReason,
            userAgent,
          }))
        : [];

    const docUpdate: { $push: Record<string, unknown>; $set: Record<string, unknown> } = {
      $push: {
        versions: newVersion,
        signingEvents: {
          $each: [
            {
              recipientId,
              ip,
              ipUnavailableReason,
              userAgent,
              signedAt,
              version: newVersionNumber,
              order: seqRecipient.order,
              action: 'signed',
              fields: eventFields,
              fieldsHash,
              fieldsHashAlgo: 'SHA-256',
              serverTimestamp: signedAt,
              baseVersion: baseChainVersionNumber,
              client: eventClient,
              geo: eventGeo,
              consent: eventConsent,
            },
            ...sentEvents,
          ],
        },
      },
      $set: {
        currentVersion: newVersionNumber,
        documentName: documentName,
        updatedAt: new Date(),
        status: allRecipientsSigned ? 'completed' : 'in_progress',
        "recipients.$[signer].status": 'signed',
        "recipients.$[signer].signedAt": signedAt,
        "recipients.$[signer].signedVersion": newVersionNumber,
      }
    };

    if (nextOrder !== null) {
      docUpdate.$set[`recipients.$[next].status`] = 'sent';
    }
    if (allRecipientsSigned) {
      docUpdate.$set.completedAt = signedAt;
      docUpdate.$set.finalizedAt = signedAt;

      const retention = await computeRetentionFields({
        document: existingDoc.toObject(),
        completionAt: signedAt,
      });
      const retentionUpdate = buildRetentionUpdatePayload({
        retention,
        docType: existingDoc.retention?.docType,
        jurisdiction: existingDoc.retention?.jurisdiction,
        governingLaw: existingDoc.retention?.governingLaw,
        customTriggerAt: existingDoc.retention?.customTriggerAt,
        evaluatedAt: new Date(),
      });
      Object.assign(docUpdate.$set, pruneUndefined(retentionUpdate));
    }

    const arrayFilters: Array<Record<string, unknown>> = [{ "signer.id": recipientId }];
    const emailUpdate = nextSigningEmailUpdate(existingDoc, nextInvitations.map((invitation) => ({
      recipient: invitation.recipient, signingToken: invitation.token,
    })), signedAt);
    Object.assign(docUpdate.$set, emailUpdate.$set);
    Object.assign(docUpdate.$push, emailUpdate.$push);
    nextInvitations.forEach((invitation, index) => {
      docUpdate.$set[`recipients.$[invitation${index}].signingTokenHash`] = invitation.tokenHash;
      arrayFilters.push({ [`invitation${index}.id`]: invitation.recipient.id, [`invitation${index}.status`]: 'pending' });
    });
    Object.assign(docUpdate.$set, documentIntegrationUpdate({ event: 'recipient_signed', documentId, orgId,
      createdAt: signedAt, metadata: { recipientId, version: newVersionNumber } }));
    if (allRecipientsSigned) Object.assign(docUpdate.$set, documentIntegrationUpdate({ event: 'document_finalized', documentId, orgId,
      createdAt: signedAt, metadata: { version: newVersionNumber, finalHash: hash } }));
    if (nextOrder !== null) {
      arrayFilters.push({ "next.order": nextOrder, "next.role": { $ne: 'viewer' }, "next.status": 'pending' });
    }

    // ⚠️ ATOMIC CHECK: Ensure base version hasn't changed (race condition protection)
    const updateResult = await DocumentModel.updateOne(
      { _id: documentId, currentVersion: baseVersion, updatedAt: existingDoc.updatedAt },
      docUpdate,
      { arrayFilters }
    );

    if (updateResult.matchedCount === 0) {
      await deleteSignedFieldRecords({
        documentId,
        version: newVersionNumber,
        recipientId,
        fieldIds: signedFieldIds,
      });
      return NextResponse.json({ message: 'Failed to save signing data, document state may have changed.' }, { status: 409 });
    }

    // See the parallel path: persist the source intent before the audit row so
    // the audit writer can link to it rather than enqueueing a duplicate event.
    await writeAuditEvent({
      userId,
      orgId,
      documentId: existingDoc._id,
      actor: recipientId,
      action: 'recipient_signed',
      ipAddress: ip,
      userAgent,
      createdAt: signedAt,
      metadata: { ipUnavailableReason, recipientOrder: recipient.order }
    });
    if (allRecipientsSigned) {
      await writeAuditEvent({
        userId,
        orgId,
        documentId: existingDoc._id,
        actor: recipientId,
        action: 'document_finalized',
        ipAddress: ip,
        userAgent,
        createdAt: signedAt,
        metadata: { ipUnavailableReason, finalHash: hash }
      });
    }

    if (nextOrder !== null && nextRecipientsToNotify.length > 0) {
      try {
        await processSigningEmailJobs({ documentId: String(documentId), limit: nextRecipientsToNotify.length });
      } catch (error) {
        console.error('Signing email processing deferred:', error);
      }
    }

    return NextResponse.json({ success: true, documentId, version: newVersionNumber, message: 'Document signed successfully.' });
  }

  return NextResponse.json({ message: 'Unsupported signing mode' }, { status: 400 });
}

async function handleMetadataUpdate(
  documentId: string,
  userId: string,
  orgId: string | null,
  userEmail: string | null,
  formData: FormData,
  fieldsReviewed: boolean,
  reviewedVersion: number | null
): Promise<NextResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existingDoc = await DocumentModel.findOne(
      buildDocumentWriteFilter({ userId, orgId, userEmail, documentId, minimumAccess: 'can_edit' })
    );
    if (!existingDoc) return NextResponse.json({ message: 'Document not found' }, { status: 404 });
    if (existingDoc.status === 'completed') {
      return NextResponse.json({ message: 'Completed documents are immutable. Create a new document to modify.' }, { status: 409 });
    }
    if (hasAnySignedRecipient(existingDoc)) {
      return NextResponse.json({ message: 'This document has partial signatures and is immutable. Create a new signing request to modify.' }, { status: 409 });
    }

    const currentVersionIndex = existingDoc.versions.findIndex((v: IVersionDoc) => v.version === existingDoc.currentVersion);
    if (currentVersionIndex === -1) return NextResponse.json({ message: 'Current version not found' }, { status: 404 });
    const currentVersionData = existingDoc.versions[currentVersionIndex];

    const sessionId = formData.get('sessionId') as string | null;
    const changeLog = (formData.get('changeLog') as string) || 'Metadata updated';
    const documentName = formData.get('documentName') as string | null;
    const fieldsData = formData.get('fields') as string | null;
    const recipientsData = formData.get('recipients') as string | null;
    const clearFieldsNeedReview =
      fieldsReviewed &&
      fieldsData !== null &&
      reviewedVersion === existingDoc.currentVersion &&
      existingDoc.templatePreparation?.fieldsNeedReview === true;
    if (
      fieldsReviewed &&
      existingDoc.templatePreparation?.fieldsNeedReview === true &&
      (fieldsData === null || reviewedVersion !== existingDoc.currentVersion)
    ) {
      return NextResponse.json({
        message: 'The document changed after it was reviewed. Reload and review the signing fields again.',
        code: 'DOCUMENT_FIELD_REVIEW_VERSION_MISMATCH',
      }, { status: 409 });
    }

    let fields: PreparedFieldInput[] = [];
    let recipients: IDocumentRecipient[] = [];

    if (fieldsData) {
      try {
        fields = parseJsonOrThrow<PreparedFieldInput[]>(fieldsData, 'fields');
        if (!Array.isArray(fields)) fields = [];
      } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : 'Invalid fields JSON' }, { status: 400 });
      }
    }

    if (recipientsData) {
      try {
        recipients = parseJsonOrThrow<IDocumentRecipient[]>(recipientsData, 'recipients');
        if (!Array.isArray(recipients)) recipients = [];
      } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : 'Invalid recipients JSON' }, { status: 400 });
      }
    }

    const limitsError = validatePayloadLimits(fields, recipients);
    if (limitsError) return NextResponse.json({ message: limitsError }, { status: 400 });

    const sanitizedFields = sanitizePreparedFields(fields);

    const sessionIdFinal = sessionId || existingDoc.currentSessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    const editHistoryItem = {
      sessionId: sessionIdFinal,
      fields: sanitizedFields,
      documentName: documentName || undefined,
      timestamp: new Date(),
      changeLog,
    };

    // If the current version is locked (e.g. Version 0 Original), we MUST NOT modify it.
    // Instead, we create a new Draft version (Version 1) that inherits the binary but has the new metadata.
    if (currentVersionData.locked) {
      if (!currentVersionData.hash || !currentVersionData.size) {
        console.error("Cannot create prepared version from original version because original is missing hash or size.", currentVersionData);
        return NextResponse.json({ message: 'Original document version is corrupted (missing hash/size), please re-upload.' }, { status: 400 });
      }
      const newVersionNumber = (existingDoc.currentVersion ?? 0) + 1;

      const { provider: sourceProvider, bucket, region } = getVersionStorageTarget(currentVersionData.storage);

      const sourceKey = currentVersionData.storage.key;
      const newKey = `documents/${userId}/${documentId}/prepared_${newVersionNumber}.pdf`;

      await copyObject({
        sourceBucket: bucket,
        sourceKey,
        destinationBucket: bucket,
        destinationKey: newKey,
        provider: sourceProvider,
        region,
      });

      const newStorage = buildStorageMetadata(sourceProvider, bucket, newKey, region);

      const newVersion = {
        version: newVersionNumber,
        derivedFromVersion: currentVersionData.version,
        label: 'prepared',
        storage: newStorage,
        hash: currentVersionData.hash,
        hashAlgo: currentVersionData.hashAlgo || 'SHA-256',
        size: currentVersionData.size,
        mimeType: currentVersionData.mimeType,
        locked: false,
        fields: sanitizedFields,
        documentName: documentName || existingDoc.documentName,
        status: 'draft',
        changeLog: 'Document prepared for signing',
        editHistory: [editHistoryItem],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const updateResult = await DocumentModel.updateOne(
        buildDocumentWriteFilter({
          userId,
          orgId,
          userEmail,
          documentId,
          minimumAccess: 'can_edit',
          extra: { currentVersion: existingDoc.currentVersion },
        }),
        [
          {
            $set: {
              versions: {
                $map: {
                  input: { $concatArrays: ['$versions', [newVersion]] },
                  as: 'v',
                  in: {
                    $cond: [
                      { $eq: ['$$v.label', 'prepared'] },
                      '$$v',
                      { $mergeObjects: ['$$v', { fields: [] }] }
                    ]
                  }
                }
              },
              currentVersion: newVersionNumber,
              documentName: documentName || existingDoc.documentName,
              recipients: recipients,
              currentSessionId: sessionIdFinal,
              ...(clearFieldsNeedReview
                ? { 'templatePreparation.fieldsNeedReview': false }
                : {}),
              updatedAt: new Date(),
            }
          }
        ]
      );

      if (updateResult.matchedCount === 0) {
        if (attempt < 2) continue;
        return NextResponse.json({ message: 'Concurrent update detected' }, { status: 409 });
      }

      return NextResponse.json({
        success: true,
        documentId: existingDoc._id,
        version: newVersionNumber,
        sessionId: sessionIdFinal,
        fileUrl: `/api/documents/${existingDoc._id}`,
        documentName: documentName || existingDoc.documentName,
        fieldsNeedReview: clearFieldsNeedReview
          ? false
          : existingDoc.templatePreparation?.fieldsNeedReview === true,
        message: 'New draft version created from locked original',
      });
    }

    const updatedDoc = await DocumentModel.findOneAndUpdate(
      buildDocumentWriteFilter({
        userId,
        orgId,
        userEmail,
        documentId,
        minimumAccess: 'can_edit',
        extra: { currentVersion: existingDoc.currentVersion },
      }),
      [
        {
          $set: {
            versions: {
              $map: {
                input: '$versions',
                as: 'v',
                in: {
                  $cond: [
                    { $eq: ['$$v.version', existingDoc.currentVersion] },
                    {
                      $mergeObjects: [
                        '$$v',
                        {
                          fields: sanitizedFields,
                          editHistory: {
                            $concatArrays: [
                              { $ifNull: ['$$v.editHistory', []] },
                              [editHistoryItem]
                            ]
                          }
                        }
                      ]
                    },
                    {
                      $cond: [
                        { $ne: ['$$v.label', 'prepared'] },
                        { $mergeObjects: ['$$v', { fields: [] }] },
                        '$$v'
                      ]
                    }
                  ]
                }
              }
            },
            updatedAt: new Date(),
            documentName: documentName || existingDoc.documentName,
            recipients: recipients,
            currentSessionId: sessionIdFinal,
            ...(clearFieldsNeedReview
              ? { 'templatePreparation.fieldsNeedReview': false }
              : {}),
          }
        }
      ],
      { new: true }
    );

    if (!updatedDoc) {
      const check = await DocumentModel.exists(
        buildDocumentWriteFilter({ userId, orgId, userEmail, documentId, minimumAccess: 'can_edit' })
      );
      if (check) {
        if (attempt < 2) continue;
        return NextResponse.json({ message: 'Concurrent update detected' }, { status: 409 });
      }
      return NextResponse.json({ message: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      documentId: updatedDoc._id,
      version: updatedDoc.currentVersion,
      sessionId: sessionIdFinal,
      fileUrl: `/api/documents/${updatedDoc._id}`,
      documentName: updatedDoc.documentName,
      fieldsNeedReview: updatedDoc.templatePreparation?.fieldsNeedReview === true,
      message: 'Metadata updated successfully',
    });
  }
  return NextResponse.json({ message: 'Concurrent update detected' }, { status: 409 });
}

async function handlePdfUpdate(
  documentId: string,
  userId: string,
  orgId: string | null,
  userEmail: string | null,
  formData: FormData,
  pdfBuffer: Buffer,
  fieldsReviewed: boolean,
  reviewedVersion: number | null
): Promise<NextResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existingDoc = await DocumentModel.findOne(
      buildDocumentWriteFilter({ userId, orgId, userEmail, documentId, minimumAccess: 'can_edit' })
    );
    if (!existingDoc) return NextResponse.json({ message: 'Document not found' }, { status: 404 });
    if (existingDoc.status === 'completed') {
      return NextResponse.json({ message: 'Completed documents are immutable. Create a new document to modify.' }, { status: 409 });
    }

    const currentVersionIndex = existingDoc.versions.findIndex((v: IVersionDoc) => v.version === existingDoc.currentVersion);
    if (currentVersionIndex === -1) return NextResponse.json({ message: 'Current version not found' }, { status: 404 });
    const currentVersionData = existingDoc.versions[currentVersionIndex];

    const documentName = (formData.get('documentName') as string) || existingDoc.documentName || 'document.pdf';
    const fieldsData = formData.get('fields') as string | null;
    const recipientsData = formData.get('recipients') as string | null;
    const sessionId = formData.get('sessionId') as string | null;
    const changeLog = (formData.get('changeLog') as string) || 'Document updated';
    const clearFieldsNeedReview =
      fieldsReviewed &&
      fieldsData !== null &&
      reviewedVersion === existingDoc.currentVersion &&
      existingDoc.templatePreparation?.fieldsNeedReview === true;
    if (
      fieldsReviewed &&
      existingDoc.templatePreparation?.fieldsNeedReview === true &&
      (fieldsData === null || reviewedVersion !== existingDoc.currentVersion)
    ) {
      return NextResponse.json({
        message: 'The document changed after it was reviewed. Reload and review the signing fields again.',
        code: 'DOCUMENT_FIELD_REVIEW_VERSION_MISMATCH',
      }, { status: 409 });
    }

    let fields: PreparedFieldInput[] = [];
    if (fieldsData) {
      try {
        fields = parseJsonOrThrow<PreparedFieldInput[]>(fieldsData, 'fields');
        if (!Array.isArray(fields)) fields = [];
      } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : 'Invalid fields JSON' }, { status: 400 });
      }
    }
    const sanitizedFields = sanitizePreparedFields(fields);
    let recipients: IDocumentRecipient[] = [];
    if (recipientsData) {
      try {
        recipients = parseJsonOrThrow<IDocumentRecipient[]>(recipientsData, 'recipients');
        if (!Array.isArray(recipients)) recipients = [];
      } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : 'Invalid recipients JSON' }, { status: 400 });
      }
    }
    const limitsError = validatePayloadLimits(sanitizedFields, recipients);
    if (limitsError) return NextResponse.json({ message: limitsError }, { status: 400 });

    const incomingSessionId = sessionId || existingDoc.currentSessionId || null;
    const hash = await sha256Buffer(pdfBuffer);
    const size = pdfBuffer.length;
    const mimeType = getPdfMime();

    const canOverwrite = (currentVersionData as { label?: string })?.label === 'prepared';

    // If same session and current version is a 'prepared' draft, overwrite it; else create a new PREPARED version
    if (
      incomingSessionId &&
      existingDoc.currentSessionId &&
      incomingSessionId === existingDoc.currentSessionId &&
      canOverwrite
    ) {
      const { provider, bucket, region } = getVersionStorageTarget(currentVersionData.storage);
      const key = currentVersionData.storage?.key || `documents/${userId}/${documentId}/${currentVersionData.version}.pdf`;
      const storage = buildStorageMetadata(provider, bucket, key, region);

      await putObjectStream({ bucket, key, body: pdfBuffer, contentType: mimeType, contentLength: size, provider });

      // Use updateOne to bypass "Locked version" validation in save() middleware
      const updateResult = await DocumentModel.updateOne(
        buildDocumentWriteFilter({
          userId,
          orgId,
          userEmail,
          documentId,
          minimumAccess: 'can_edit',
          extra: { currentVersion: existingDoc.currentVersion },
        }),
        [
          {
            $set: {
              versions: {
                $map: {
                  input: '$versions',
                  as: 'v',
                  in: {
                    $cond: [
                      { $eq: ['$$v.version', existingDoc.currentVersion] },
                      {
                        $mergeObjects: [
                          '$$v',
                          {
                            hash: hash,
                            hashAlgo: 'SHA-256',
                            size: size,
                            mimeType: mimeType,
                            fields: sanitizedFields,
                            updatedAt: new Date(),
                            documentName: documentName,
                            locked: false,
                            storage: storage,
                            pdfData: '$$REMOVE'
                          }
                        ]
                      },
                      {
                        $cond: [
                          { $ne: ['$$v.label', 'prepared'] },
                          { $mergeObjects: ['$$v', { fields: [] }] },
                          '$$v'
                        ]
                      }
                    ]
                  }
                }
              },
              documentName: documentName,
              recipients: recipients,
              ...(clearFieldsNeedReview
                ? { 'templatePreparation.fieldsNeedReview': false }
                : {}),
              updatedAt: new Date(),
            }
          }
        ]
      );

      if (updateResult.matchedCount === 0) {
        if (attempt < 2) continue;
        return NextResponse.json({ message: 'Concurrent update detected' }, { status: 409 });
      }

      return NextResponse.json({
        success: true,
        documentId: existingDoc._id,
        version: existingDoc.currentVersion,
        fileUrl: `/api/documents/${existingDoc._id}`,
        documentName: existingDoc.documentName,
        fieldsNeedReview: clearFieldsNeedReview
          ? false
          : existingDoc.templatePreparation?.fieldsNeedReview === true,
        message: `Current version ${existingDoc.currentVersion} updated (same session)`,
      });
    }

    const { provider, bucket, region } = getActiveStorageTarget();

    const newVersionNumber = (existingDoc.currentVersion ?? 0) + 1;
    const key = `documents/${userId}/${documentId}/prepared_${newVersionNumber}.pdf`;

    await putObjectStream({ bucket, key, body: pdfBuffer, contentType: mimeType, contentLength: size, provider });

    const newVersion = {
      version: newVersionNumber,
      derivedFromVersion: existingDoc.currentVersion,
      label: 'prepared',
      storage: buildStorageMetadata(provider, bucket, key, region),
      hash,
      hashAlgo: 'SHA-256',
      size,
      mimeType,
      locked: false,
      fields: sanitizedFields,
      documentName,
      status: 'draft',
      changeLog,
      editHistory: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updateResult = await DocumentModel.updateOne(
      buildDocumentWriteFilter({
        userId,
        orgId,
        userEmail,
        documentId,
        minimumAccess: 'can_edit',
        extra: { currentVersion: existingDoc.currentVersion },
      }),
      [
        {
          $set: {
            versions: {
              $map: {
                input: { $concatArrays: ['$versions', [newVersion]] },
                as: 'v',
                in: {
                  $cond: [
                    { $eq: ['$$v.label', 'prepared'] },
                    '$$v',
                    { $mergeObjects: ['$$v', { fields: [] }] }
                  ]
                }
              }
            },
            currentVersion: newVersionNumber,
            documentName: documentName,
            recipients: recipients,
            currentSessionId: incomingSessionId,
            ...(clearFieldsNeedReview
              ? { 'templatePreparation.fieldsNeedReview': false }
              : {}),
            updatedAt: new Date()
          }
        }
      ]
    );

    if (updateResult.matchedCount === 0) {
      if (attempt < 2) continue;
      return NextResponse.json({ message: 'Concurrent update detected' }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      documentId: existingDoc._id,
      version: newVersionNumber,
      fileUrl: `/api/documents/${existingDoc._id}`,
      documentName: documentName,
      fieldsNeedReview: clearFieldsNeedReview
        ? false
        : existingDoc.templatePreparation?.fieldsNeedReview === true,
      message: `New version ${newVersionNumber} created`,
    });
  }
  return NextResponse.json({ message: 'Concurrent update detected' }, { status: 409 });
}

async function handleNewDocument(
  userId: string,
  orgId: string | null,
  formData: FormData,
  pdfBuffer: Buffer,
  file: File,
  req: NextRequest
): Promise<NextResponse> {
  const documentName = (formData.get('documentName') as string) || file.name || 'document.pdf';
  const recipientsData = formData.get('recipients') as string | null;
  const signingMode = formData.get('signingMode') || 'parallel';
  const sessionId = formData.get('sessionId') as string | null;
  const docType = (formData.get('docType') as string | null) || undefined;
  const jurisdiction = (formData.get('jurisdiction') as string | null) || undefined;
  const governingLaw = (formData.get('governingLaw') as string | null) || undefined;
  const customTriggerRaw = formData.get('customTriggerAt') as string | null;
  const customTriggerAt = customTriggerRaw ? new Date(customTriggerRaw) : undefined;

  let recipients: IDocumentRecipient[] = [];
  if (recipientsData) {
    try {
      recipients = parseJsonOrThrow<IDocumentRecipient[]>(recipientsData, 'recipients');
      if (!Array.isArray(recipients)) recipients = [];
    } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : 'Invalid recipients JSON' }, { status: 400 });
    }
  }
  const limitsError = validatePayloadLimits([], recipients);
  if (limitsError) return NextResponse.json({ message: limitsError }, { status: 400 });

  const hash = await sha256Buffer(pdfBuffer);
  const size = pdfBuffer.length;
  const mimeType = getPdfMime();
  const initialSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  const { ip, ipUnavailableReason } = normalizeIp(req.headers.get('x-forwarded-for'));
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const newDocument = new DocumentModel({
    userId,
    documentName,
    originalFileName: file.name || documentName,
    currentVersion: 1, // Set current version to 1 as we are creating a prepared version
    currentSessionId: initialSessionId,
    versions: [],
    recipients,
    signingMode,
    signingEvents: [],
    auditTrailVersion: 1,
    status: 'draft',
    updatedAt: new Date(),
    createdAt: new Date(),
  });

  if (orgId) {
    newDocument.orgId = orgId as unknown as typeof newDocument.orgId;
  }

  newDocument.retention = {
    docType: docType?.trim() || undefined,
    jurisdiction: jurisdiction?.trim() || undefined,
    governingLaw: governingLaw?.trim() || undefined,
    customTriggerAt: customTriggerAt && !Number.isNaN(customTriggerAt.getTime()) ? customTriggerAt : undefined,
  };

  const retention = await computeRetentionFields({ document: newDocument.toObject() });
  applyRetentionToDocument(newDocument, retention, new Date());

  try {
    const { provider, bucket, region } = getActiveStorageTarget();

    // Version 0: Original
    const originalKey = `documents/${userId}/${newDocument._id}/original.pdf`;
    await putObjectStream({ bucket, key: originalKey, body: pdfBuffer, contentType: mimeType, contentLength: size, provider });

    const originalVersion = {
      version: 0,
      label: 'original' as const,
      storage: buildStorageMetadata(provider, bucket, originalKey, region),
      hash,
      hashAlgo: 'SHA-256',
      size,
      mimeType,
      locked: true,
      status: 'locked' as const,
      ingestionNote: 'Original upload',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    newDocument.versions.push(originalVersion);

    // Version 1: Prepared
    const preparedKey = `documents/${userId}/${newDocument._id}/prepared_1.pdf`;
    await copyObject({
      sourceBucket: bucket,
      sourceKey: originalKey,
      destinationBucket: bucket,
      destinationKey: preparedKey,
      provider,
      region,
    });

    const preparedVersion = {
      version: 1,
      label: 'prepared' as const,
      derivedFromVersion: 0,
      storage: buildStorageMetadata(provider, bucket, preparedKey, region),
      hash, // Hash is the same as original
      hashAlgo: 'SHA-256',
      size,
      mimeType,
      locked: false,
      fields: [],
      documentName,
      status: 'draft' as const,
      changeLog: 'Document prepared for signing',
      editHistory: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    newDocument.versions.push(preparedVersion);

    stageDocumentIntegrationEvent(newDocument, { event: 'document_created', metadata: { ipUnavailableReason } });
    await newDocument.save();

    await writeAuditEvent({
      userId,
      orgId,
      documentId: newDocument._id,
      actor: userId,
      action: 'document_created',
      ipAddress: ip,
      userAgent,
      metadata: { ipUnavailableReason }
    });

    const fileUrl = `/api/documents/${newDocument._id}`;
    return NextResponse.json({
      success: true,
      documentId: newDocument._id,
      version: 1, // Return current version
      sessionId: initialSessionId,
      fileUrl,
      documentName,
      message: 'Document created successfully'
    });
  } catch (error) {
    // If upload fails, delete the document to prevent "zombie" records
    console.error('Failed to create new document, cleaning up document:', newDocument._id, error);
    try {
      await DocumentModel.findByIdAndDelete(newDocument._id);
    } catch (cleanupError) {
      console.error('Failed to cleanup document:', cleanupError);
    }
    throw error;
  }
}

export const POST = withTrialWriteAccessFromAuthContext(async function POST(
  req: NextRequest,
  _context,
  authContext
): Promise<NextResponse> {
  try {
    const signingToken = req.headers.get('X-Signing-Token');
    const authorizedUserId: string | null = authContext?.userId || null;
    const orgId: string | null = authContext?.orgId || null;

    if (signingToken) {
      return NextResponse.json(
        { message: 'Signing must be completed via the /api/sign-document endpoint.' },
        { status: 409 }
      );
    }

    if (!authorizedUserId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Avoid buffering an obviously oversized multipart body before file-level
    // validation. The runtime/gateway must still enforce a limit for chunked
    // requests, which do not have a trustworthy Content-Length header.
    const contentLengthValue = req.headers.get('content-length');
    const contentLength = contentLengthValue && /^\d+$/.test(contentLengthValue)
      ? Number(contentLengthValue)
      : null;
    if (contentLength !== null && contentLength > MAX_UPLOAD_REQUEST_BYTES) {
      return NextResponse.json({
        message: `File too large. Maximum upload size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB.`,
      }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const documentId = formData.get('documentId') as string | null;
    const isMetadataOnly = formData.get('isMetadataOnly') === 'true';
    const fieldsReviewed = formData.get('fieldsReviewed') === 'true';
    const reviewedVersionRaw = formData.get('reviewedVersion');
    const reviewedVersionValue = typeof reviewedVersionRaw === 'string' && reviewedVersionRaw.trim()
      ? Number(reviewedVersionRaw)
      : Number.NaN;
    const reviewedVersion = Number.isInteger(reviewedVersionValue) && reviewedVersionValue >= 0
      ? reviewedVersionValue
      : null;
    const requester = documentId && mongoose.Types.ObjectId.isValid(authorizedUserId)
      ? await UserModel.findById(authorizedUserId).select('email').lean<{ email?: unknown } | null>()
      : null;
    const requesterEmail = typeof requester?.email === 'string' ? requester.email : null;

    let pdfBuffer: Buffer | null = null;
    if (file) {
      const metadataError = validatePdfUploadMetadata(file);
      if (metadataError) return NextResponse.json({ message: metadataError }, { status: 400 });
      const sourceType = getUploadSourceType(file.name);
      if (!sourceType) return NextResponse.json({ message: 'Unsupported file type' }, { status: 400 });

      const uploadedBuffer = Buffer.from(await file.arrayBuffer());
      if (uploadedBuffer.length === 0) return NextResponse.json({ message: 'File is empty' }, { status: 400 });
      // DOC/DOCX are container formats. A signature check alone accepts
      // malformed archives and decompression-bomb-shaped input before the
      // converter sees it, so use the bounded server-side validator.
      const bufferError = validateOfficeUploadBuffer(uploadedBuffer, sourceType);
      if (bufferError) return NextResponse.json({ message: bufferError }, { status: 400 });

      if (uploadedBuffer.length > MAX_UPLOAD_SIZE_BYTES) {
        return NextResponse.json({ message: `File too large. Maximum upload size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB.` }, { status: 413 });
      }

      if (shouldConvertToPdf(sourceType)) {
        try {
          pdfBuffer = await convertOfficeDocumentToPdf({
            inputBuffer: uploadedBuffer,
            originalFileName: file.name,
          });
          formData.set('documentName', toPreparedPdfFileName((formData.get('documentName') as string | null) || file.name));
        } catch (error) {
          // Converter errors can include file-system paths or provider details.
          // Keep those server-side and return a stable, actionable response.
          console.error('Failed to convert uploaded Word document to PDF', error);
          return NextResponse.json(
            {
              message: 'Unable to convert this Word document to PDF. Please try another file.',
              code: 'DOCUMENT_CONVERSION_FAILED',
            },
            { status: 422 }
          );
        }
      } else {
        pdfBuffer = uploadedBuffer;
      }

      if (pdfBuffer.length === 0) return NextResponse.json({ message: 'Converted file is empty' }, { status: 400 });
      if (pdfBuffer.length > MAX_UPLOAD_SIZE_BYTES) {
        return NextResponse.json({ message: `Converted PDF is too large. Maximum upload size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB.` }, { status: 413 });
      }
    }

    if (documentId) {
      if (signingToken && pdfBuffer) {
        return await handleSigningUpdate(documentId, authorizedUserId, orgId, formData, pdfBuffer, signingToken, req);
      } else if (isMetadataOnly) {
        return await handleMetadataUpdate(documentId, authorizedUserId, orgId, requesterEmail, formData, fieldsReviewed, reviewedVersion);
      } else if (pdfBuffer) {
        return await handlePdfUpdate(documentId, authorizedUserId, orgId, requesterEmail, formData, pdfBuffer, fieldsReviewed, reviewedVersion);
      } else {
        return NextResponse.json({ message: 'No file provided for update' }, { status: 400 });
      }
    } else if (pdfBuffer && file) {
      return await handleNewDocument(authorizedUserId, orgId, formData, pdfBuffer, file, req);
    } else {
      return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
    }
  } catch (error) {
    console.error('API Error in POST', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
});
