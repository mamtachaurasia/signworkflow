import { NextRequest, NextResponse } from 'next/server';
import { stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';
import connectDB from '@/utils/db';
import DocumentModel from '@/models/Document';
import type { IDocumentRecipient } from '@/models/Document';
import type { DocumentField, FieldOwner } from '@/types/types';
import { mergeFieldsIntoPdfServer } from '@/lib/pdf';
import { getObjectStream, putObjectStream, getStorageBucketName, normalizeStorageProvider } from '@/lib/s3';
import { sha256Buffer } from '@/lib/hash';
import {
    buildEventClient,
    buildEventConsent,
    buildEventGeo,
    buildSignedBySnapshot,
    getLatestPreparedVersion,
    getLatestSignedVersion,
    isRecipientTurn,
    normalizeIp,
} from '@/lib/signing-utils';
import { sanitizeRecipient, sanitizeRecipients } from '@/lib/recipient-sanitizer';
import { processSigningEmailJobs, stageNextSigningEmails } from '@/lib/signing-email-jobs';
import { applySigningAction } from '@/lib/signing-actions';
import {
    buildSigningTokenLookup,
    recipientMatchesSigningToken,
    type RecipientTokenShape,
} from '@/lib/signing-token';
import { buildSignedFieldRecords, deleteSignedFieldRecords, upsertSignedFieldRecords } from '@/lib/signed-fields';
import SignatureModel from '@/models/Signature';
import { normalizeFieldOwner, normalizeFields } from '@/lib/field-normalization';
import { getEffectiveFieldValue, supportsReadOnlySetting, validateFieldValue } from '@/lib/field-rules';
import { applyRetentionToDocument, computeRetentionFields } from '@/lib/retention';
import { hasAcceptedEsignDisclosure } from '@/lib/esign-disclosure';
import { createDocumentEventNotification } from '@/lib/notifications';
import { consumeRateLimit } from '@/lib/rateLimit';
import { getClientIp, getUserAgent } from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';

type LooseField = Partial<DocumentField> & {
    id?: string;
    fieldId?: string;
    recipientId?: string | null;
    value?: unknown;
    fieldOwner?: FieldOwner | string;
};

type SignatureRecord = {
    fieldId?: string;
    version?: number;
    signedAt?: Date | string;
    fieldValue?: string;
};

export async function POST(req: NextRequest) {
    try {
        const requesterIp = getClientIp(req);
        const rateLimit = await consumeRateLimit({
            key: requesterIp,
            namespace: 'documents:sign-document:ip',
            limit: 10,
            windowSeconds: 60,
        });
        if (!rateLimit.allowed) {
            const response = NextResponse.json({ success: false, message: 'Too many signing attempts. Please retry shortly.' }, { status: 429 });
            response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
            return response;
        }
        await connectDB();
        const { token: rawToken, fields, location, device, consent } = await req.json();
        const token = typeof rawToken === 'string' ? rawToken.trim() : '';

        if (!token)
            return NextResponse.json({ success: false, message: 'Token is required' }, { status: 400 });

        // 🔑 Find document by token (bulletproof)
        const document = await DocumentModel.findOne(buildSigningTokenLookup(token));
        if (!document)
            return NextResponse.json({ success: false, message: 'Invalid or expired signing link' }, { status: 404 });
        if (document.deletedAt) {
            return NextResponse.json({ success: false, message: 'Document has been trashed.' }, { status: 410 });
        }
        if (document.status === 'completed' || document.status === 'voided' || document.status === 'rejected' || document.status === 'cancelled') {
            const message =
                document.status === 'rejected'
                    ? 'This signing request was rejected.'
                    : document.status === 'cancelled'
                        ? 'This signing request was cancelled.'
                    : 'Document is not available for signing.';
            return NextResponse.json({ success: false, message }, { status: 409 });
        }

        const recipient = document.recipients.find((candidate: RecipientTokenShape) =>
            recipientMatchesSigningToken(candidate, token)
        );
        if (!recipient)
            return NextResponse.json({ success: false, message: 'Recipient not found' }, { status: 404 });

        if (!hasAcceptedEsignDisclosure(recipient.consent)) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'You must accept the Electronic Record and Signature Disclosure before signing.',
                    reason: 'esign_consent_required',
                },
                { status: 403 }
            );
        }

        // ⚠️ SEQUENTIAL SIGNING: Only allow signing if it's this recipient's turn
        if (document.signingMode === 'sequential') {
            if (!isRecipientTurn(recipient, document.recipients)) {
                return NextResponse.json({ success: false, message: 'Not your turn to sign' }, { status: 403 });
            }
        }

        const preparedVersion = getLatestPreparedVersion(document.versions || []);
        if (!preparedVersion) return NextResponse.json({ success: false, message: 'Prepared version not found' }, { status: 404 });
        const latestSignedVersion = getLatestSignedVersion(document.versions || []);

        // Check expiry
        if (preparedVersion.expiresAt && new Date() > new Date(preparedVersion.expiresAt))
            return NextResponse.json({ success: false, message: 'Signing link has expired' }, { status: 410 });

        // ✅ Idempotency: skip if already signed/approved
        if (['signed', 'approved'].includes(recipient.status))
            return NextResponse.json({ success: true, message: 'Document already signed' });

        // ⚠️ GENERATE NEW SIGNED PDF (IMMUTABILITY RULE)
        const baseVersionSource = latestSignedVersion ?? preparedVersion;
        const baseVersionNumber = baseVersionSource.version;
        if (document.currentVersion !== baseVersionNumber) {
            return NextResponse.json({ success: false, message: 'Signing base version is stale. Please refresh.' }, { status: 409 });
        }
        const newVersionNumber = (document.currentVersion ?? baseVersionNumber) + 1;
        const recipientsAfterSign = document.recipients.map((r: IDocumentRecipient) =>
          r.id === recipient.id ? { ...r, status: 'signed' } : r
        );
        const allRecipientsSigned = recipientsAfterSign.every((r: IDocumentRecipient) => r.status === 'signed');
        const newVersionLabel = allRecipientsSigned ? 'signed_final' : `signed_by_order_${recipient.order}`;
        const signedAt = new Date();
        const { ip, ipUnavailableReason } = normalizeIp(requesterIp);
        const userAgent = req.headers.get('user-agent') ?? undefined;
        const signedRecipientIds = new Set(
            document.recipients
                .filter((r: IDocumentRecipient) => r?.status === 'signed' || r?.status === 'approved')
                .map((r: IDocumentRecipient) => r.id)
        );
        const hasForbiddenForeignValues = (fields || []).some((field: LooseField) => {
            const owner = normalizeFieldOwner(field);
            if (owner === 'me') return false;
            const value = field?.value;
            const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
            if (!hasValue) return false;
            if (field?.recipientId === recipient.id) return false;
            // Allow previously signed recipients' values to remain visible
            return !signedRecipientIds.has(field?.recipientId);
        });
        if (hasForbiddenForeignValues) {
            return NextResponse.json({ success: false, message: 'Fields include values for other recipients.' }, { status: 400 });
        }
        const preparedFields = normalizeFields(Array.isArray(preparedVersion?.fields) ? preparedVersion.fields : []);
        const incomingValueMap = new Map<string, unknown>();
        (fields || []).forEach((field: LooseField) => {
            const fieldId = String(field?.id ?? field?.fieldId ?? '');
            if (!fieldId) return;
            incomingValueMap.set(fieldId, field?.value);
        });
        const recipientFields = preparedFields
            .filter((field) => {
                const owner = normalizeFieldOwner(field);
                if (owner === 'me') return false;
                return field?.recipientId === recipient.id;
            })
            .map((field) => {
                const fieldId = String(field?.id ?? field?.fieldId ?? '');
                const incomingValue = fieldId ? incomingValueMap.get(fieldId) : undefined;
                const isReadOnly =
                    supportsReadOnlySetting({ type: String(field?.type ?? '') }) &&
                    field?.settings?.readOnly === true;
                const rawValue = isReadOnly
                    ? field?.value ?? ''
                    : incomingValue ?? field?.value ?? '';
                return {
                    ...field,
                    value: getEffectiveFieldValue({
                        type: String(field?.type ?? ''),
                        required: field?.required !== false,
                        value: rawValue,
                        settings: field?.settings,
                    }),
                };
            });
        const firstInvalidRecipientField = recipientFields.find((field) => {
            const validation = validateFieldValue({
                type: String(field?.type ?? ''),
                required: field?.required !== false,
                value: field?.value,
                settings: field?.settings,
            });
            return !validation.valid;
        });
        if (firstInvalidRecipientField) {
            const validation = validateFieldValue({
                type: String(firstInvalidRecipientField?.type ?? ''),
                required: firstInvalidRecipientField?.required !== false,
                value: firstInvalidRecipientField?.value,
                settings: firstInvalidRecipientField?.settings,
            });
            return NextResponse.json(
                {
                    success: false,
                    message: validation.reason || `Invalid value for field ${String(firstInvalidRecipientField?.id ?? '')}.`,
                },
                { status: 400 }
            );
        }
        const ownerFields = preparedFields
            .filter((field) => normalizeFieldOwner(field) === 'me')
            .map((field) => ({
                ...field,
                value: getEffectiveFieldValue({
                    type: String(field?.type ?? ''),
                    required: field?.required !== false,
                    value: field?.value ?? '',
                    settings: field?.settings,
                }),
            }));
        const firstInvalidOwnerField = ownerFields.find((field) => {
            const validation = validateFieldValue({
                type: String(field?.type ?? ''),
                required: field?.required !== false,
                value: field?.value,
                settings: field?.settings,
            });
            return !validation.valid;
        });
        if (firstInvalidOwnerField) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Document contains invalid sender field values. Ask the sender to correct the document before signing.',
                },
                { status: 400 }
            );
        }
        const ownerPrefilledFields = ownerFields
            .filter((field) => {
                const value = field?.value;
                return value !== undefined && value !== null && String(value).trim() !== '';
            });
        const fieldsToRenderOnPdf = [...ownerPrefilledFields, ...recipientFields];
        if (recipientFields.length === 0) {
            return NextResponse.json({ success: false, message: 'No signable fields assigned to this recipient.' }, { status: 400 });
        }

        const eventFields = await Promise.all(
            recipientFields.map(async (field) => ({
                fieldId: String(field.id),
                fieldHash: await sha256Buffer(Buffer.from(`${String(field.id)}:${field.value ?? ''}`)),
            }))
        );
        const fieldsHash = await sha256Buffer(Buffer.from(JSON.stringify(eventFields)));
        try {
            const storage = baseVersionSource.storage;
            if (!storage?.key || !storage?.region) {
                return NextResponse.json({ success: false, message: 'Signed base PDF is missing storage metadata.' }, { status: 500 });
            }
            const storageProvider = normalizeStorageProvider((storage as { provider?: string } | undefined)?.provider);
            const bucket = storage.bucket || getStorageBucketName(storageProvider);
            if (!bucket) throw new Error('Storage bucket is not configured');

            // 1️⃣ Load base PDF from the configured object store
            const basePdfStream = await getObjectStream({
                bucket,
                key: storage.key,
                region: storage.region,
                provider: storageProvider
            });

            // 2️⃣ Merge fields into PDF (server-side PDF generation)
            const mergedPdfBuffer = await mergeFieldsIntoPdfServer(basePdfStream, fieldsToRenderOnPdf);

            // 3️⃣ Upload signed PDF to the same object store provider
            const signedPdfKey = `documents/${document.userId}/${document._id}/signed_${newVersionNumber}_${recipient.id}.pdf`;
            const signedPdfHash = await sha256Buffer(mergedPdfBuffer);
            const signedPdfSize = mergedPdfBuffer.length;

            await putObjectStream({
                bucket,
                key: signedPdfKey,
                body: mergedPdfBuffer,
                contentType: 'application/pdf',
                contentLength: signedPdfSize,
                provider: storageProvider,
            });

            // 4️⃣ Persist signed field values (immutable snapshot)
            const { records: signedFieldRecords, fieldIds } = await buildSignedFieldRecords({
                documentId: document._id,
                version: newVersionNumber,
                recipientId: recipient.id,
                fields: recipientFields,
                eventFields,
                signedAt,
                ip,
                ipUnavailableReason,
                userAgent,
            });
            await upsertSignedFieldRecords(signedFieldRecords);

            const signedBySnapshot = buildSignedBySnapshot(
                document.recipients.map((currentRecipient: IDocumentRecipient) =>
                    currentRecipient.id === recipient.id
                        ? {
                            id: currentRecipient.id,
                            role: currentRecipient.role,
                            order: currentRecipient.order,
                            status: 'signed',
                            signedVersion: newVersionNumber,
                        }
                        : {
                            id: currentRecipient.id,
                            role: currentRecipient.role,
                            order: currentRecipient.order,
                            status: currentRecipient.status,
                            signedVersion: currentRecipient.signedVersion,
                        }
                ),
                newVersionNumber
            );

            // 6️⃣ Create new immutable version object
            const newVersion = {
                version: newVersionNumber,
                label: newVersionLabel,
                derivedFromVersion: baseVersionNumber,
                signedBy: signedBySnapshot,
                storage: {
                    provider: storageProvider,
                    bucket,
                    key: signedPdfKey,
                    region: storage.region,
                    url: `${storageProvider}://${bucket}/${signedPdfKey}`
                },
                hash: signedPdfHash,
                hashAlgo: 'SHA-256',
                size: signedPdfSize,
                mimeType: 'application/pdf',
                locked: true,
                documentName: preparedVersion.documentName || document.documentName,
                status: 'final',
                changeLog: `Signed by ${recipient.name} (order: ${recipient.order})`,
                changeMeta: {
                    action: 'signed',
                    actorId: recipient.id,
                    actorRole: recipient.role,
                    signingMode: document.signingMode,
                    baseVersion: baseVersionNumber,
                    derivedFromVersion: baseVersionNumber,
                    signedAt,
                    source: 'server',
                },
                renderedBy: 'server',
                pdfSignedAt: signedAt,
                editHistory: [],
                createdAt: signedAt,
                updatedAt: signedAt
            };

            // 7️⃣ Push new version and update currentVersion
            document.versions.push(newVersion);
            document.currentVersion = newVersionNumber;

            const { nextRecipientsToNotify } = applySigningAction({
                document,
                recipient,
                action: 'signed',
                actionAt: signedAt,
                version: newVersionNumber,
                baseVersion: baseVersionNumber,
                fields: eventFields,
                fieldsHash,
                fieldsHashAlgo: 'SHA-256',
                location,
                device,
                consent,
                ip,
                ipUnavailableReason,
                userAgent,
            });
            stageNextSigningEmails(document, nextRecipientsToNotify, signedAt);

            if (document.status === 'completed') {
                const retention = await computeRetentionFields({
                    document: document.toObject(),
                    completionAt: signedAt,
                });
                applyRetentionToDocument(document, retention, new Date());
            }

            // 🔟 Save everything to database (rollback signed field snapshot on failure)
            stageDocumentIntegrationEvent(document, { event: 'recipient_signed', createdAt: signedAt,
                metadata: { recipientId: recipient.id, version: newVersionNumber, signedPdfHash } });
            if (document.status === 'completed') {
                stageDocumentIntegrationEvent(document, { event: 'document_finalized', createdAt: signedAt,
                    metadata: { version: newVersionNumber, finalHash: signedPdfHash } });
            }
            try {
                await document.save();
            } catch (err) {
                await deleteSignedFieldRecords({
                    documentId: document._id,
                    version: newVersionNumber,
                    recipientId: recipient.id,
                    fieldIds,
                });
                throw err;
            }

            await writeAuditEvent({
                userId: document.userId,
                orgId: document.orgId,
                documentId: document._id,
                actor: recipient.id,
                action: 'recipient_signed',
                ipAddress: ip,
                userAgent: getUserAgent(req),
                metadata: {
                    recipientId: recipient.id,
                    recipientOrder: recipient.order,
                    version: newVersionNumber,
                    signedPdfHash,
                },
            });
            if (document.status === 'completed') {
                await writeAuditEvent({
                    userId: document.userId,
                    orgId: document.orgId,
                    documentId: document._id,
                    actor: recipient.id,
                    action: 'document_finalized',
                    ipAddress: ip,
                    userAgent: getUserAgent(req),
                    metadata: {
                        version: newVersionNumber,
                        finalHash: signedPdfHash,
                    },
                });
            }

            try {
                await createDocumentEventNotification({
                    type: 'document.signed',
                    ownerUserId: document.userId,
                    orgId: document.orgId ? String(document.orgId) : null,
                    documentId: document._id,
                    documentName: document.documentName,
                    recipient,
                    actionAt: signedAt,
                    metadata: {
                        version: newVersionNumber,
                    },
                });

                if (document.status === 'completed') {
                    await createDocumentEventNotification({
                        type: 'document.completed',
                        ownerUserId: document.userId,
                        orgId: document.orgId ? String(document.orgId) : null,
                        documentId: document._id,
                        documentName: document.documentName,
                        recipient,
                        actionAt: signedAt,
                        metadata: {
                            version: newVersionNumber,
                        },
                    });
                }
            } catch (err) {
                console.error('Failed to create sender notification:', err);
            }

            if (nextRecipientsToNotify.length > 0) {
                try {
                    await processSigningEmailJobs({ documentId: String(document._id), limit: nextRecipientsToNotify.length });
                } catch (err) {
                    // The atomic signing save already persisted the invitations;
                    // cron can recover even if this request or its audit fails.
                    console.error('Signing email processing deferred:', err);
                }
            }

            return NextResponse.json({
                success: true,
                message: 'Document signed successfully',
                version: newVersionNumber,
                documentId: document._id
            });

        } catch (pdfErr) {
            console.error('Error generating signed PDF:', pdfErr);
            return NextResponse.json({
                success: false,
                message: 'Failed to generate signed PDF: ' + (pdfErr instanceof Error ? pdfErr.message : 'Unknown error')
            }, { status: 500 });
        }

    } catch (err) {
        console.error('Error in sign-document POST:', err);
        return NextResponse.json({ success: false, message: 'Failed to sign document' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const requesterIp = getClientIp(req);
        await connectDB();
        const token = req.nextUrl.searchParams.get('token')?.trim() || '';
        const recipientId = req.nextUrl.searchParams.get('recipient');

        if (!token) return NextResponse.json({ success: false, message: 'Token is required' }, { status: 400 });
        if (!recipientId) return NextResponse.json({ success: false, message: 'Recipient ID is required' }, { status: 400 });

        // Don't use .lean() to ensure we get fresh data from DB
        const document = await DocumentModel.findOne(buildSigningTokenLookup(token));
        if (!document) return NextResponse.json({ success: false, message: 'Invalid or expired signing link' }, { status: 404 });
        if (document.deletedAt) {
            return NextResponse.json({ success: false, message: 'Document has been trashed.' }, { status: 410 });
        }
        if (document.status === 'voided') {
            return NextResponse.json({ success: false, message: 'Document has been voided.' }, { status: 409 });
        }
        if (document.status === 'cancelled') {
            return NextResponse.json({ success: false, message: 'This signing request was cancelled.' }, { status: 409 });
        }

        const preparedVersion = getLatestPreparedVersion(document.versions || []);
        if (!preparedVersion) return NextResponse.json({ success: false, message: 'Prepared version not found' }, { status: 404 });

        // verify expiry
        if (preparedVersion.expiresAt && new Date() > new Date(preparedVersion.expiresAt)) {
            return NextResponse.json({ success: false, message: 'Signing link has expired' }, { status: 410 });
        }
        const recipient = document.recipients.find((candidate: RecipientTokenShape) =>
            recipientMatchesSigningToken(candidate, token)
        );
        if (!recipient) return NextResponse.json({ success: false, message: 'Recipient not found' }, { status: 404 });
        if (document.status === 'rejected' && recipient.status !== 'rejected') {
            return NextResponse.json({ success: false, message: 'This signing request was rejected.' }, { status: 409 });
        }

        if (!recipient.viewedAt && (recipient.status === 'pending' || recipient.status === 'sent')) {
            const viewedAt = new Date();
            const { ip, ipUnavailableReason } = normalizeIp(requesterIp);
            const userAgent = req.headers.get('user-agent') ?? undefined;

            recipient.viewedAt = viewedAt;
            recipient.status = 'viewed';
            document.signingEvents ??= [];
            document.signingEvents.push({
                recipientId: recipient.id,
                action: 'viewed',
                serverTimestamp: viewedAt,
                ip,
                ipUnavailableReason,
                userAgent,
                order: recipient.order,
                client: buildEventClient({ ip, userAgent, recipient }),
                geo: buildEventGeo(recipient),
                consent: buildEventConsent(recipient),
            });

            try {
                await document.save();
                await createDocumentEventNotification({
                    type: 'document.viewed',
                    ownerUserId: document.userId,
                    orgId: document.orgId ? String(document.orgId) : null,
                    documentId: document._id,
                    documentName: document.documentName,
                    recipient,
                    actionAt: viewedAt,
                });
            } catch (err) {
                console.error('Failed to record viewed notification:', err);
            }
        }


        let fields = normalizeFields(Array.isArray(preparedVersion?.fields) ? preparedVersion.fields : []);

        // No per-field privacy enforcement (feature removed)

        const signedRecipientIds = document.recipients
            .filter((r: IDocumentRecipient) => r?.status === 'signed' || r?.status === 'approved')
            .map((r: IDocumentRecipient) => r.id)
            .filter(Boolean);
        const allowedRecipientIds =
            signedRecipientIds.length > 0 ? signedRecipientIds : (recipient?.id ? [recipient.id] : []);

        if (allowedRecipientIds.length > 0) {
            const signedFieldRecords = await SignatureModel.find({
                documentId: document._id,
                recipientId: { $in: allowedRecipientIds },
            }).lean();

            if (signedFieldRecords.length > 0) {
                const fieldValueMap = new Map<string, { value: string; version: number; signedAt: number }>();
                for (const record of signedFieldRecords) {
                    const typedRecord = record as SignatureRecord;
                    const fieldId = String(typedRecord.fieldId ?? '');
                    if (!fieldId) continue;
                    const version = typeof typedRecord.version === 'number' ? typedRecord.version : -1;
                    const signedAt = typedRecord.signedAt ? new Date(typedRecord.signedAt).getTime() : 0;
                    const existing = fieldValueMap.get(fieldId);
                    if (!existing || version > existing.version || (version === existing.version && signedAt > existing.signedAt)) {
                        fieldValueMap.set(fieldId, {
                            value: String(typedRecord.fieldValue ?? ''),
                            version,
                            signedAt,
                        });
                    }
                }

                if (fieldValueMap.size > 0) {
                    fields = fields.map((field: LooseField) => {
                        const fieldId = String(field?.id ?? '');
                        if (!fieldId) return field;
                        const signedValue = fieldValueMap.get(fieldId);
                        if (!signedValue) return field;
                        return { ...field, value: signedValue.value };
                    });
                }
            }
        }

        const safeRecipients = sanitizeRecipients(document.recipients || []);
        const safeCurrentRecipient = sanitizeRecipient(recipient);

        return NextResponse.json({
            success: true,
            document: {
                id: document._id.toString(),
                name: document?.documentName || 'Untitled Document',
                fileUrl: `/api/documents/${document._id}?token=${token}`,
                fields,
                recipients: safeRecipients,
                currentRecipientId: recipient.id,
                currentRecipient: safeCurrentRecipient,
                status: document.status,
                signingMode: document.signingMode,
                paymentRequest: document.paymentRequest ?? null,
            },
        });
    } catch (_err) {
        console.error('Error in sign-document:', _err);
        return NextResponse.json({ success: false, message: 'Failed to load document' }, { status: 500 });
    }
}
