import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import DocumentModel, { IDocumentRecipient } from '@/models/Document';
import SignatureModel from '@/models/Signature';
import { getLatestPreparedVersion } from '@/lib/signing-utils';
import { sanitizeRecipients } from '@/lib/recipient-sanitizer';
import { normalizeFields } from '@/lib/field-normalization';
import { recipientMatchesSigningToken } from '@/lib/signing-token';
import type { DocumentField } from '@/types/types';
import mongoose from 'mongoose';
import connectDB from '@/utils/db';
import { canReadDocument, resolveDocumentReadScope } from '@/lib/document-access';
import UserModel from '@/models/Users';
import { getDocumentShareForEmail, getDocumentShareForToken } from '@/lib/document-sharing';

type SignedFieldRecord = {
  fieldId?: string;
  version?: number;
  signedAt?: Date | string;
  fieldValue?: string;
};

// GET - Load a document with its fields and recipients
export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext(req, { allowGuest: true });
    const userId = context?.userId ?? null;
    const orgId = context?.orgId ?? null;
    const { searchParams } = new URL(req.url);
    const signingToken = searchParams.get('token') || req.headers.get('X-Signing-Token');
    const shareToken = searchParams.get('shareToken') || req.headers.get('X-Document-Share-Token');

    const documentId = searchParams.get('id');

    if (!documentId) {
      return NextResponse.json({ message: 'Document ID missing' }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return NextResponse.json({ message: 'Document not found by ID' }, { status: 404 });
    }

    await connectDB();
    const document = await DocumentModel.findById(documentId);

    if (!document) {
      return NextResponse.json({ message: 'Document not found by ID' }, { status: 404 });
    }

    let authorized = false;
    let hasOrgWideReadAccess = false;
    let accessibleTeamIds: string[] = [];
    let requesterEmail: string | null = null;
    const tokenShare = getDocumentShareForToken(document.sharedWith, shareToken);

    const tokenRecipient = signingToken && Array.isArray(document.recipients)
      ? document.recipients.find((r: IDocumentRecipient) =>
          recipientMatchesSigningToken(r, signingToken)
        )
      : null;
    const hasSigningTokenAccess = Boolean(tokenRecipient);
    if (hasSigningTokenAccess) {
      authorized = true;
    }
    if (tokenShare) {
      authorized = true;
    }

    const docOrgId = document.orgId ? String(document.orgId) : null;
    const docTeamId = document.teamId ? String(document.teamId) : null;
    const docOwnerId = String(document.userId ?? '');
    const isOwner = Boolean(userId && docOwnerId === userId && (!docOrgId || docOrgId === orgId));
    const isGuestOwner = Boolean(userId && typeof userId === 'string' && userId.startsWith('guest_') && docOwnerId === userId);
    let isTeamMemberRequester = false;

    if (userId && typeof userId === 'string' && !userId.startsWith('guest_')) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const requester = await UserModel.findById(userId)
          .select('email')
          .lean<{ email?: unknown } | null>();
        requesterEmail = typeof requester?.email === 'string' ? requester.email : null;
      }
      const readScope = await resolveDocumentReadScope(userId, orgId, context?.orgRole);
      hasOrgWideReadAccess = docOrgId ? docOrgId === orgId && readScope.hasOrgWideReadAccess : false;
      accessibleTeamIds = docOrgId && docOrgId === orgId ? readScope.accessibleTeamIds : [];
      isTeamMemberRequester = Boolean(docTeamId && accessibleTeamIds.includes(docTeamId));
    }

    if (
      canReadDocument({
        userId,
        orgId,
        orgRole: context?.orgRole,
        documentUserId: docOwnerId,
        documentOrgId: docOrgId,
        documentTeamId: docTeamId,
        requesterEmail,
        sharedWith: document.sharedWith,
        accessibleTeamIds,
      })
    ) {
      authorized = true;
    }

    if (!authorized) {
      return NextResponse.json(
        { message: userId ? 'Forbidden' : 'Unauthorized' },
        { status: userId ? 403 : 401 }
      );
    }

    // Get the current version's fields
    const preparedVersion = getLatestPreparedVersion(document.versions || []);
    const hasIndependentDocumentAccess = Boolean(
      isOwner || isGuestOwner || hasOrgWideReadAccess || isTeamMemberRequester
    );
    const isRestrictedSigningTokenAccess = Boolean(hasSigningTokenAccess && !hasIndependentDocumentAccess);
    const isRestrictedShareTokenAccess = Boolean(tokenShare && !hasIndependentDocumentAccess);

    if (isRestrictedSigningTokenAccess || isRestrictedShareTokenAccess) {
      if (document.deletedAt) {
        return NextResponse.json({ message: 'Document has been trashed.' }, { status: 410 });
      }
      if (document.status === 'voided') {
        return NextResponse.json({ message: 'Document has been voided.' }, { status: 409 });
      }
      if (document.status === 'cancelled') {
        return NextResponse.json({ message: 'This signing request was cancelled.' }, { status: 409 });
      }
      const isRejectedRecipientAccess = isRestrictedSigningTokenAccess
        ? (tokenRecipient as IDocumentRecipient | null)?.status === 'rejected'
        : false;
      if (document.status === 'rejected' && !isRejectedRecipientAccess) {
        return NextResponse.json({ message: 'This signing request was rejected.' }, { status: 409 });
      }
      if (!preparedVersion) {
        return NextResponse.json({ message: 'Prepared version not found' }, { status: 404 });
      }
      if (preparedVersion.expiresAt && new Date() > new Date(preparedVersion.expiresAt)) {
        return NextResponse.json({ message: 'Signing link has expired' }, { status: 410 });
      }
    }

    let fields = normalizeFields(Array.isArray(preparedVersion?.fields) ? preparedVersion?.fields : []);

    const hasSignedRecipients = Array.isArray(document.recipients)
      ? document.recipients.some((r: IDocumentRecipient) => ['signed', 'approved'].includes(r.status))
      : false;
    const hasSigningEvents = Array.isArray(document.signingEvents) && document.signingEvents.length > 0;

    if (hasSignedRecipients || hasSigningEvents) {
      const allowedRecipientIds = signingToken
        ? document.recipients
            .filter((r: IDocumentRecipient) => recipientMatchesSigningToken(r, signingToken))
            .map((r: IDocumentRecipient) => r.id)
        : document.recipients.map((r: IDocumentRecipient) => r.id);

      if (allowedRecipientIds.length > 0) {
        const signedFieldRecords = await SignatureModel.find({
          documentId: document._id,
          recipientId: { $in: allowedRecipientIds },
        }).lean();

        const fieldValueMap = new Map<string, { value: string; version: number; signedAt: number }>();
        for (const record of signedFieldRecords) {
          const typedRecord = record as SignedFieldRecord;
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
          fields = fields.map((field: DocumentField) => {
            const signedValue = fieldValueMap.get(String(field?.id ?? ''));
            if (!signedValue) return field;
            return { ...field, value: signedValue.value };
          });
        }
      }
    }

    // Return document with fields from current version
    const safeRecipients = sanitizeRecipients(document.recipients || []);
    const requesterEmailShare = getDocumentShareForEmail(document.sharedWith, requesterEmail);
    const canEditSource = Boolean(isOwner || requesterEmailShare?.access === 'can_edit');
    const responseDoc = {
      _id: document._id,
      documentId: document._id, // Add documentId for consistency
      documentName: document.documentName,
      originalFileName: document.originalFileName,
      currentVersion: document.currentVersion,
      hasEditableContent: canEditSource && Boolean(document.editableContent),
      derivedFromDocumentId: document.derivedFromDocumentId ?? null,
      derivedFromVersion: document.derivedFromVersion ?? null,
      recipients: safeRecipients,
      status: document.status,
      fields: fields, // Fields from current version
      templatePreparation: {
        fieldsNeedReview: document.templatePreparation?.fieldsNeedReview === true,
      },
      signingEvents: document.signingEvents ?? [],
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      teamId: docTeamId,
      shareAccess: requesterEmailShare?.access ?? (tokenShare ? 'can_view' : null),
      retention: hasOrgWideReadAccess ? (document.retention ?? null) : null,
      legalHold: hasOrgWideReadAccess ? (document.legalHold ?? null) : null,
    };

    return NextResponse.json({ success: true, document: responseDoc });
  } catch (error) {
    console.error('API Error in GET /api/documents/load', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
