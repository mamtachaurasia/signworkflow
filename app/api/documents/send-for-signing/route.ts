import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import { stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';
import { createSigningEmailDelivery, getSigningEmailDeliverySummary, processSigningEmailJobs } from '@/lib/signing-email-jobs';
import { issueSigningToken } from '@/lib/signing-token';
import { consumeRateLimit } from '@/lib/rateLimit';
import {
  buildEventClient,
  buildEventConsent,
  buildEventGeo,
  getLatestPreparedVersion,
  getNextSequentialOrder,
  normalizeIp,
} from '@/lib/signing-utils';
import { copyObject, getRegion, getStorageBucketName, normalizeStorageProvider } from '@/lib/s3';
import { updateDocumentStatus } from '@/lib/statusLogic';
import connectDB from '@/utils/db';
import { authenticateRequest, enforceMfaForSensitiveAction } from '@/middleware/authMiddleware';
import DocumentModel, { IDocumentRecipient } from '@/models/Document';
import TeamModel from '@/models/Team';
import { getOrgContextForUser, getRequestedOrgId } from '@/lib/orgs';
import { getEffectiveUserSettingsByUserId } from '@/lib/org-settings-server';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { getTrialWriteAccessDeniedResponse } from '@/lib/trial-access';
import { isAdminRole } from '@/lib/role-utils';
import { buildDocumentWriteFilter } from '@/lib/document-sharing';
import { getMissingRequiredVariableLabels, sanitizeEditableTemplateContent } from '@/lib/template-content';
import { createRecipientDocumentSentNotifications } from '@/lib/notifications';
import UserModel from '@/models/Users';
import {
  validateRoleFieldRestrictions,
  validateSenderFieldValues,
  validateSignerFieldAssignments,
  validateUniqueRecipients,
} from '@/lib/signing-request-validation';

const DocumentIdRegex = /^[a-f\d]{24}$/i;
const SEND_CLAIM_STALE_MS = 5 * 60 * 1000;
export const maxDuration = 300;

const RecipientSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1).max(200),
    role: z.enum(['signer', 'approver', 'viewer']),
    color: z.string().trim().max(40).optional(),
    order: z.number().int().positive().max(1000).optional(),
    isCC: z.boolean().optional(),
    sendReminders: z.boolean().optional(),
    reminderDays: z.number().int().min(1).max(30).optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    captureGpsLocation: z.boolean().optional(),
  })
  .passthrough();

const FieldTypeSchema = z.enum([
  'signature',
  'text',
  'full_name',
  'date',
  'checkbox',
  'radio',
  'dropdown',
  'image',
  'initials',
  'live_photo',
  'stamp',
]);

const FieldRectSchema = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().finite().positive().optional(),
    height: z.number().finite().positive().optional(),
    top: z.number().finite().optional(),
    right: z.number().finite().optional(),
    bottom: z.number().finite().optional(),
    left: z.number().finite().optional(),
  })
  .partial();

const PreparedFieldSchema = z.object({
  id: z.string().trim().min(1).max(120),
  repeatGroupId: z.string().trim().min(1).max(120).optional(),
  repeatSourceId: z.string().trim().min(1).max(120).optional(),
  type: FieldTypeSchema,
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  pageNumber: z.number().int().positive().optional(),
  recipientId: z.string().trim().min(1).max(120).nullable().optional(),
  required: z.boolean().optional(),
  value: z.string().optional(),
  placeholder: z.string().max(500).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  mimeType: z.string().max(120).optional(),
  pageRect: FieldRectSchema.nullable().optional(),
  fieldOwner: z.enum(['me', 'recipients']).optional(),
});

const PaymentRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    amount: z.number().positive().max(1_000_000).optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    description: z.string().trim().max(300).optional(),
    paymentLinkUrl: z.string().trim().url().max(2000).optional(),
    })
    .superRefine((paymentRequest, context) => {
      if (!paymentRequest.enabled) return;
      if (typeof paymentRequest.amount !== 'number') {
        context.addIssue({ code: 'custom', path: ['amount'], message: 'Payment amount is required.' });
      }
      if (!paymentRequest.paymentLinkUrl) {
        context.addIssue({ code: 'custom', path: ['paymentLinkUrl'], message: 'Payment link is required.' });
      } else {
        const protocol = new URL(paymentRequest.paymentLinkUrl).protocol;
        if (protocol !== 'https:' && protocol !== 'http:') {
          context.addIssue({
            code: 'custom',
            path: ['paymentLinkUrl'],
            message: 'Payment link must use HTTP or HTTPS.',
          });
        }
      }
    })
  .optional();

const SendForSigningBodySchema = z.object({
  documentId: z.string().trim().regex(DocumentIdRegex),
  recipients: z.array(RecipientSchema).min(1).max(200),
  fields: z.array(PreparedFieldSchema).max(4000).optional(),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().max(2000).optional(),
  signingMode: z.enum(['parallel', 'sequential']).optional(),
  teamId: z.string().trim().regex(DocumentIdRegex).nullable().optional(),
  paymentRequest: PaymentRequestSchema,
});

type RequestRecipient = {
  id: string;
  email: string;
  name: string;
  role: 'signer' | 'approver' | 'viewer';
  color?: string;
  order?: number;
  isCC?: boolean;
};

type EmailFailure = {
  id: string;
  email: string;
  reason: string;
};

type FallbackVersion = {
  [key: string]: unknown;
  version?: number;
  label?: string;
  storage?: {
    provider?: string;
    bucket?: string;
    key?: string;
    region?: string;
    url?: string;
  };
  hash?: string;
  hashAlgo?: string;
  size?: number;
  mimeType?: string;
  fields?: unknown[];
};

function getFieldValidationError(
  recipients: RequestRecipient[],
  fields: unknown[] | undefined
): string | null {
  const roleFieldRestrictionError = validateRoleFieldRestrictions(recipients, fields);
  if (roleFieldRestrictionError) return roleFieldRestrictionError;

  const signerFieldAssignmentError = validateSignerFieldAssignments(recipients, fields);
  if (signerFieldAssignmentError) return signerFieldAssignmentError;

  return validateSenderFieldValues(fields);
}

function validateSequentialOrders(recipients: RequestRecipient[]): string | null {
  const ordered = recipients.filter((r) => r.role !== 'viewer');
  if (ordered.length === 0) return 'At least one non-viewer recipient is required for sequential signing.';
  if (ordered.some((r) => typeof r.order !== 'number')) return 'Order is required for sequential signing.';
  const sorted = [...ordered].sort((a,b)=>(a.order ?? 0)-(b.order ?? 0));
  for (let i=0;i<sorted.length;i++){
    if (sorted[i].order !== i+1) return 'Sequential signing order must be contiguous starting from 1.';
  }
  return null;
}
export const runtime = 'nodejs';

export async function OPTIONS(req: NextRequest) {
  return withSecurityHeaders(req, new NextResponse(null, { status: 204 }));
}

// POST - Send a document for signing
export async function POST(req: NextRequest) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        { message: 'HTTPS is required for authentication endpoints.' },
        { status: 400 }
      )
    );
  }

  const rateLimit = await consumeRateLimit({
    key: ipAddress,
    namespace: 'documents:send-for-signing:ip',
    limit: 120,
    windowSeconds: 15 * 60,
  });

  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { message: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return withSecurityHeaders(req, response);
  }

  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed', reason: 'csrf_mismatch' }, { status: 403 })
    );
  }

  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return withSecurityHeaders(req, auth.response);
  }

  const mfaCheck = enforceMfaForSensitiveAction(auth.context, req.headers.get('x-mfa-code'));
  if (!mfaCheck.ok) {
    return withSecurityHeaders(req, mfaCheck.response);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
    );
  }

  const parsed = SendForSigningBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Validation failed',
          errors: parsed.error.issues.map((issue: { message: string }) => issue.message),
        },
        { status: 400 }
      )
    );
  }

  const {
    documentId,
    recipients: parsedRecipients,
    fields: requestFields,
    subject,
    message,
    signingMode: reqSigningMode,
    teamId: requestedTeamId,
    paymentRequest,
  } = parsed.data;
  const recipients = parsedRecipients as RequestRecipient[];
  const uniqueRecipientError = validateUniqueRecipients(recipients);
  if (uniqueRecipientError) {
    return withSecurityHeaders(req, NextResponse.json({ message: uniqueRecipientError }, { status: 400 }));
  }
  // Validate submitted fields before loading the document to fail malformed requests early.
  // When fields are omitted, the prepared version remains the source of truth and is
  // validated after it has been resolved below.
  if (Array.isArray(requestFields)) {
    const requestFieldValidationError = getFieldValidationError(recipients, requestFields);
    if (requestFieldValidationError) {
      return withSecurityHeaders(req, NextResponse.json({ message: requestFieldValidationError }, { status: 400 }));
    }
  }
  const userId = String(auth.context.user._id);
  const orgContext = await getOrgContextForUser(userId, getRequestedOrgId(req));
  const orgId = orgContext?.orgId ?? null;
  const orgRole = orgContext?.orgRole ?? null;

  const deniedResponse = await getTrialWriteAccessDeniedResponse({ orgId, req });
  if (deniedResponse) {
    return deniedResponse;
  }

  if (paymentRequest?.enabled) {
    const paymentRequestGuard = await getPlanGateForOrgFeature({
      orgId,
      feature: 'payment_requests',
    });
    if (!paymentRequestGuard.allowed) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: paymentRequestGuard.message }, { status: paymentRequestGuard.status })
      );
    }
  }

  const userSettings = await getEffectiveUserSettingsByUserId(userId, orgId);
  let auditTeamId: string | null = null;
  let activeSendClaim: { documentId: unknown; claimId: string } | null = null;

  try {
    await connectDB();
    const authUserEmail =
      typeof (auth.context.user as { email?: unknown }).email === 'string'
        ? (auth.context.user as { email: string }).email
        : null;
    const requester = !authUserEmail && mongoose.Types.ObjectId.isValid(userId)
      ? await UserModel.findById(userId)
          .select('email')
          .lean<{ email?: unknown } | null>()
      : null;
    const requesterEmail = authUserEmail || (typeof requester?.email === 'string' ? requester.email : null);

    const document = await DocumentModel.findOne(
      buildDocumentWriteFilter({
        userId,
        orgId,
        userEmail: requesterEmail,
        documentId,
        minimumAccess: 'can_send',
        extra: { _id: documentId },
      })
    );

    if (!document) {
      return withSecurityHeaders(req, NextResponse.json({ message: 'Document not found' }, { status: 404 }));
    }
    if (document.status === 'completed') {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          { message: 'Completed documents are immutable. Create a new document to modify.' },
          { status: 409 }
        )
      );
    }
    const hasPreviouslyDispatchedRecipient = Array.isArray(document.recipients) && document.recipients.some(
      (recipient: IDocumentRecipient) =>
        recipient.status === 'sent' ||
        recipient.status === 'viewed' ||
        recipient.status === 'signed' ||
        recipient.status === 'approved'
    );
    const hasPreviouslySentVersion = Array.isArray(document.versions) && document.versions.some(
      (version: FallbackVersion) => Boolean((version as FallbackVersion & { sentAt?: unknown }).sentAt)
    );
    if (
      (document.status !== 'draft' && document.status !== 'saved') ||
      hasPreviouslyDispatchedRecipient ||
      hasPreviouslySentVersion
    ) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: 'This document has already been sent or is no longer sendable. Create a new envelope to send it again.',
            code: 'DOCUMENT_ALREADY_SENT',
          },
          { status: 409 }
        )
      );
    }
    const missingRequiredVariableLabels = getMissingRequiredVariableLabels(
      document.editableContent
        ? sanitizeEditableTemplateContent(document.editableContent)
        : undefined
    );
    if (missingRequiredVariableLabels.length > 0) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: `Complete required smart variables before sending this envelope: ${missingRequiredVariableLabels.join(', ')}.`,
            code: 'DOCUMENT_TEMPLATE_PREPARATION_REQUIRED',
          },
          { status: 409 }
        )
      );
    }
    if (document.templatePreparation?.completed === false) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: 'Complete the template details before sending this envelope.',
            code: 'DOCUMENT_TEMPLATE_PREPARATION_REQUIRED',
          },
          { status: 409 }
        )
      );
    }
    if (document.templatePreparation?.fieldsNeedReview === true) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: 'Review the signing field placement and save the document before sending.',
            code: 'DOCUMENT_FIELDS_NEED_REVIEW',
          },
          { status: 409 }
        )
      );
    }

    let resolvedTeamId: string | null | undefined;
    if (requestedTeamId === null) {
      resolvedTeamId = null;
    } else if (typeof requestedTeamId === 'string' && requestedTeamId.trim().length > 0) {
      if (!orgId) {
        return withSecurityHeaders(
          req,
          NextResponse.json(
            { message: 'Team routing requires a Business or higher workspace plan.' },
            { status: 400 }
          )
        );
      }
      const team = await TeamModel.findOne({ _id: requestedTeamId, orgId })
        .select('memberIds')
        .lean<{ _id: { toString(): string }; memberIds?: Array<{ toString(): string }> } | null>();
      if (!team) {
        return withSecurityHeaders(req, NextResponse.json({ message: 'Team not found' }, { status: 404 }));
      }
      const isAdmin = isAdminRole(orgRole);
      const isMember = Array.isArray(team.memberIds)
        ? team.memberIds.some((memberId) => String(memberId) === userId)
        : false;
      if (!isAdmin && !isMember) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'You do not have access to assign this team.' }, { status: 403 })
        );
      }
      resolvedTeamId = String(team._id);
    }

    if (resolvedTeamId !== undefined) {
      document.teamId = resolvedTeamId ? (resolvedTeamId as unknown as typeof document.teamId) : null;
    }
    auditTeamId = resolvedTeamId ?? (document.teamId ? String(document.teamId) : null);

    let preparedVersion = getLatestPreparedVersion(document.versions || []) as FallbackVersion | null;
    if (!preparedVersion) {
      const versions = Array.isArray(document.versions) ? (document.versions as FallbackVersion[]) : [];
      const fallbackVersion =
        versions.find((v) => v?.version === document.currentVersion) ||
        versions.find((v) => v?.label === 'original') ||
        versions[versions.length - 1];

      if (!fallbackVersion || !fallbackVersion.storage?.key) {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Prepared version not found' }, { status: 400 })
        );
      }
      if (fallbackVersion.storage.provider !== 's3') {
        return withSecurityHeaders(
          req,
          NextResponse.json({ message: 'Source document storage provider is unsupported.' }, { status: 400 })
        );
      }

      const sourceProvider = normalizeStorageProvider(fallbackVersion.storage?.provider);
      const bucket = fallbackVersion.storage.bucket || getStorageBucketName(sourceProvider);
      if (!bucket) {
        return withSecurityHeaders(req, NextResponse.json({ message: 'Storage bucket is not configured.' }, { status: 500 }));
      }

      const preparedVersionNumber = (document.currentVersion ?? 0) + 1;
      const preparedKey = `documents/${userId}/${document._id}/prepared_${preparedVersionNumber}.pdf`;
      await copyObject({
        sourceBucket: bucket,
        sourceKey: fallbackVersion.storage.key,
        destinationBucket: bucket,
        destinationKey: preparedKey,
        region: fallbackVersion.storage.region || getRegion(sourceProvider),
        provider: sourceProvider,
      });

      preparedVersion = {
        version: preparedVersionNumber,
        label: 'prepared',
        derivedFromVersion: fallbackVersion.version,
        storage: {
          provider: sourceProvider,
          bucket,
          key: preparedKey,
          region: fallbackVersion.storage.region || getRegion(sourceProvider),
          url: `${sourceProvider}://${bucket}/${preparedKey}`,
        },
        hash: fallbackVersion.hash,
        hashAlgo: fallbackVersion.hashAlgo || 'SHA-256',
        size: fallbackVersion.size,
        mimeType: fallbackVersion.mimeType,
        locked: false,
        fields: Array.isArray(fallbackVersion.fields) ? fallbackVersion.fields : [],
        documentName: document.documentName,
        status: 'draft',
        changeLog: 'Document prepared for signing',
        editHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      document.versions.push(preparedVersion);
      document.currentVersion = preparedVersionNumber;
    }

    if (!preparedVersion) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Prepared version not found' }, { status: 400 })
      );
    }

    // A caller may omit `fields`, in which case this route sends the fields saved
    // on the prepared version. Validate the exact set that will be sent, rather
    // than trusting persisted values or only validating the request body.
    const effectiveFields =
      Array.isArray(requestFields) && requestFields.length > 0
        ? requestFields
        : Array.isArray(preparedVersion.fields)
          ? preparedVersion.fields
          : [];
    const effectiveFieldValidationError = getFieldValidationError(recipients, effectiveFields);
    if (effectiveFieldValidationError) {
      return withSecurityHeaders(req, NextResponse.json({ message: effectiveFieldValidationError }, { status: 400 }));
    }

    const sentAt = new Date();
    if (Array.isArray(requestFields) && requestFields.length > 0) {
      preparedVersion.fields = requestFields;
      preparedVersion.updatedAt = sentAt;
    }
    preparedVersion.locked = true;
    preparedVersion.sentAt = sentAt;

    const signingMode =
      reqSigningMode || document.signingMode || userSettings.defaultSigningMode || 'parallel';
    document.signingMode = signingMode;
    document.paymentRequest =
      paymentRequest?.enabled && paymentRequest.paymentLinkUrl
        ? {
            enabled: true,
            provider: 'external_link',
            amount: paymentRequest.amount,
            currency: (paymentRequest.currency || 'INR').toUpperCase(),
            description: paymentRequest.description || '',
            paymentLinkUrl: paymentRequest.paymentLinkUrl,
            status: 'pending',
            requestedAt: sentAt,
            paidAt: null,
          }
        : undefined;

    let nextOrder: number | null = null;
    if (signingMode === 'sequential') {
      const sequentialOrderError = validateSequentialOrders(recipients);
      if (sequentialOrderError) {
        return withSecurityHeaders(req, NextResponse.json({ message: sequentialOrderError }, { status: 400 }));
      }
      nextOrder = getNextSequentialOrder(recipients);
    }

    // Claim the draft atomically before issuing tokens or creating send events.
    // The stale window allows recovery if a worker exits before it can mark the
    // claim failed/completed, while concurrent requests can never both proceed.
    const claimId = randomUUID();
    const claimedAt = new Date();
    const staleBefore = new Date(claimedAt.getTime() - SEND_CLAIM_STALE_MS);
    const claimResult = await DocumentModel.updateOne(
      {
        _id: document._id,
        status: { $in: ['draft', 'saved'] },
        $or: [
          { sendDispatch: { $exists: false } },
          { sendDispatch: null },
          { 'sendDispatch.status': 'failed' },
          { 'sendDispatch.status': 'processing', 'sendDispatch.claimedAt': { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          sendDispatch: {
            claimId,
            status: 'processing',
            claimedAt,
          },
        },
      }
    );
    if (claimResult.modifiedCount !== 1) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: 'This envelope is already being sent or has already been sent.',
            code: 'DOCUMENT_SEND_ALREADY_CLAIMED',
          },
          { status: 409 }
        )
      );
    }
    activeSendClaim = { documentId: document._id, claimId };

    document.signingEvents ??= [];
    document.auditTrailVersion ??= 1;
    const { ip, ipUnavailableReason } = normalizeIp(ipAddress);
    const recipientTokensById = new Map<string, string>();

    const fallbackExpiry =
      userSettings.defaultExpirationDays > 0
        ? new Date(Date.now() + userSettings.defaultExpirationDays * 24 * 60 * 60 * 1000)
        : undefined;

    document.recipients = recipients.map((r) => {
      let status: 'sent' | 'pending' = 'sent';
      if (signingMode === 'sequential' && r.role !== 'viewer' && r.order !== nextOrder) {
        status = 'pending';
      }

      const rawRecipient = r as RequestRecipient & {
        sendReminders?: boolean;
        reminderDays?: number;
        expiresAt?: string | Date | null;
        captureGpsLocation?: boolean;
      };
      const sendReminders =
        typeof rawRecipient.sendReminders === 'boolean'
          ? rawRecipient.sendReminders
          : userSettings.autoReminders;
      const reminderDays = sendReminders
        ? typeof rawRecipient.reminderDays === 'number'
          ? rawRecipient.reminderDays
          : userSettings.reminderIntervalDays
        : undefined;
      const expiresAt =
        rawRecipient.expiresAt != null
          ? new Date(rawRecipient.expiresAt)
          : fallbackExpiry;

      const nextRecipient: IDocumentRecipient = {
        ...(r as IDocumentRecipient),
        signingToken: undefined,
        signingTokenHash: undefined,
        status,
        signedAt: null,
        signedVersion: null,
        sendReminders,
        reminderDays,
        expiresAt,
        captureGpsLocation:
          typeof rawRecipient.captureGpsLocation === 'boolean' ? rawRecipient.captureGpsLocation : false,
      };

      if (status === 'sent') {
        const issuedSigningToken = issueSigningToken();
        nextRecipient.signingTokenHash = issuedSigningToken.tokenHash;
        recipientTokensById.set(r.id, issuedSigningToken.token);
      }

      return nextRecipient;
    });

    const baseVersion = preparedVersion.version;
    const targetVersion = signingMode === 'sequential' ? document.currentVersion + 1 : undefined;

    for (const recipient of document.recipients) {
      if (recipient.status === 'sent') {
        document.signingEvents.push({
          recipientId: recipient.id,
          action: 'sent',
          sentAt,
          serverTimestamp: sentAt,
          baseVersion,
          targetVersion,
          order: recipient.order,
          ip,
          ipUnavailableReason,
          userAgent,
          client: buildEventClient({ ip, userAgent, recipient }),
          geo: buildEventGeo(recipient),
          consent: buildEventConsent(recipient),
        });
      }
    }

    updateDocumentStatus(document);
    document.sendDispatch = {
      claimId,
      status: 'processing',
      claimedAt,
      subject: subject ?? userSettings.inviteSubject,
      message: message ?? userSettings.inviteMessage,
      deliveries: [...recipientTokensById].map(([recipientId, token]) => createSigningEmailDelivery(recipientId, token, sentAt)),
    };
    document.$where = { 'sendDispatch.claimId': claimId, 'sendDispatch.status': 'processing', status: { $in: ['draft', 'saved'] }, deletedAt: null };
    stageDocumentIntegrationEvent(document, { event: 'document.send_for_signing.success', createdAt: sentAt,
      metadata: { recipientCount: document.recipients.length } });
    await document.save();
    activeSendClaim = null;

    const recipientsToNotify = document.recipients.filter(
      (recipient: IDocumentRecipient) => recipient.status === 'sent' || recipient.role === 'viewer'
    );
    const emailFailures: EmailFailure[] = [];

    try {
      await createRecipientDocumentSentNotifications({
        senderUserId: userId,
        orgId,
        documentId: document._id,
        documentName: document.documentName,
        recipients: recipientsToNotify.map((recipient: IDocumentRecipient) => {
          const signingToken = recipientTokensById.get(recipient.id);
          return {
            id: recipient.id,
            email: recipient.email,
            name: recipient.name,
            role: recipient.role,
            signingUrl: signingToken
              ? `/sign/${encodeURIComponent(signingToken)}?recipient=${encodeURIComponent(recipient.id)}`
              : null,
          };
        }),
      });
    } catch (notificationError) {
      console.error('Failed to create recipient signing request notifications:', notificationError);
    }

    await processSigningEmailJobs({ documentId: String(document._id), orgId, limit: recipientsToNotify.length });
    const delivery = await getSigningEmailDeliverySummary(String(document._id), orgId);
    emailFailures.push(...delivery.failures.map((failure) => ({
      ...failure,
      email: recipientsToNotify.find((recipient: IDocumentRecipient) => recipient.id === failure.id)?.email || '',
    })));

    if (emailFailures.length > 0) {
      const uniqueFailureReasons = [...new Set(emailFailures.map((failure) => failure.reason).filter(Boolean))];
      try {
        await writeAuditEvent({
          userId,
          orgId,
          documentId: String(document._id),
          action: 'document.send_for_signing.email_delivery_issue',
          ipAddress,
          userAgent,
          metadata: {
            documentId: String(document._id),
            teamId: auditTeamId,
            attempted: recipientsToNotify.length,
            failed: emailFailures.length,
            reasons: uniqueFailureReasons,
            failures: emailFailures,
            sessionId: auth.context.sessionId,
          },
        });
      } catch (auditError) {
        // Sending is already committed. Audit persistence is best effort here
        // and must not produce a response that encourages a duplicate send.
        console.error('Failed to audit signing email delivery issue', auditError);
      }
    }

    try {
      await writeAuditEvent({
        userId,
        orgId,
        documentId: String(document._id),
        action: 'document.send_for_signing.success',
        ipAddress,
        userAgent,
        metadata: {
          documentId: String(document._id),
          teamId: auditTeamId,
          recipientCount: recipients.length,
          signingMode: document.signingMode,
          emailDelivery: {
            attempted: recipientsToNotify.length,
            delivered: delivery.completed,
            pending: delivery.pending,
            failed: emailFailures.length,
          },
          sessionId: auth.context.sessionId,
        },
      });
    } catch (auditError) {
      console.error('Failed to audit successful signing dispatch', auditError);
    }

    const notificationMessage =
      delivery.pending > 0
        ? 'Document sent for signing; notification emails are queued for delivery.'
        : emailFailures.length === 0
        ? 'Document sent for signing'
        : emailFailures.length === recipientsToNotify.length
          ? `Document sent, but no notification emails could be delivered.${emailFailures[0]?.reason ? ` ${emailFailures[0].reason}` : ''}`
          : `Document sent, but ${emailFailures.length} notification email(s) failed.`;

    return withSecurityHeaders(
      req,
      NextResponse.json({
        message: notificationMessage,
        signingMode: document.signingMode,
        emailDelivery: {
          attempted: recipientsToNotify.length,
          delivered: delivery.completed,
          pending: delivery.pending,
          failed: emailFailures.length,
          failedRecipients: emailFailures.map(({ id, email, reason }) => ({ id, email, reason })),
        },
      })
    );
  } catch (error) {
    if (activeSendClaim) {
      try {
        await DocumentModel.updateOne(
          {
            _id: activeSendClaim.documentId,
            'sendDispatch.claimId': activeSendClaim.claimId,
            'sendDispatch.status': 'processing',
          },
          {
            $set: {
              'sendDispatch.status': 'failed',
              'sendDispatch.failedAt': new Date(),
            },
          }
        );
      } catch (claimReleaseError) {
        console.error('Failed to release document send claim', claimReleaseError);
      }
    }
    try {
      await writeAuditEvent({
        userId,
        orgId,
        documentId,
        action: 'document.send_for_signing.failed',
        ipAddress,
        userAgent,
        metadata: {
          documentId,
          teamId: auditTeamId,
          reason: error instanceof Error ? error.message : 'unknown_error',
        },
      });
    } catch (auditError) {
      console.error('Failed to audit signing dispatch failure', auditError);
    }

    console.error('API Error in POST /api/documents/send-for-signing', error);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal Server Error' }, { status: 500 })
    );
  }
}
