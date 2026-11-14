import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth-context';
import { hasAnySignedRecipient } from '@/lib/document-guards';
import { buildDocumentWriteFilter, normalizeShareEmail } from '@/lib/document-sharing';
import { sha256Buffer } from '@/lib/hash';
import {
  deleteObject,
  getRegion,
  getStorageBucketName,
  getStorageProvider,
  putObjectStream,
} from '@/lib/s3';
import { getMissingRequiredVariableLabels, sanitizeEditableTemplateContent } from '@/lib/template-content';
import { renderEditableTemplatePdf } from '@/lib/template-content-pdf';
import { sanitizeTemplateFields } from '@/lib/template-persistence';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import DocumentModel from '@/models/Document';
import UserModel from '@/models/Users';
import type { IDocumentVersion } from '@/types/types';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';
const MAX_DOCUMENT_FIELDS = 500;

type RouteContext = { params: Promise<{ documentId: string }> };
type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;
type StoredObject = {
  bucket: string;
  key: string;
  region: string;
  provider: ReturnType<typeof getStorageProvider>;
};

async function getRequesterEmail(userId: string): Promise<string | null> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  const user = await UserModel.findById(userId)
    .select('email')
    .lean<{ email?: unknown } | null>();
  return normalizeShareEmail(user?.email);
}

async function loadEditableDocument(auth: AuthContext, documentId: string) {
  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    return { error: NextResponse.json({ message: 'Invalid document ID' }, { status: 400 }) };
  }

  await connectDB();
  const requesterEmail = await getRequesterEmail(auth.userId);
  const document = await DocumentModel.findOne(buildDocumentWriteFilter({
    userId: auth.userId,
    orgId: auth.orgId,
    userEmail: requesterEmail,
    documentId,
    minimumAccess: 'can_edit',
  }));

  if (!document) {
    return { error: NextResponse.json({ message: 'Document not found' }, { status: 404 }) };
  }
  if (!document.editableContent) {
    return {
      error: NextResponse.json({
        message: 'This document does not have editable source content.',
        code: 'DOCUMENT_CONTENT_NOT_EDITABLE',
      }, { status: 409 }),
    };
  }

  return { document, requesterEmail };
}

function documentContentPayload(args: {
  documentId: string;
  documentName: string;
  editableContent: unknown;
  currentVersion: number;
  fieldsNeedReview: boolean;
}) {
  return {
    _id: args.documentId,
    name: args.documentName,
    editableContent: sanitizeEditableTemplateContent(args.editableContent),
    currentVersion: args.currentVersion,
    fieldsNeedReview: args.fieldsNeedReview,
    fileUrl: `/api/documents/${encodeURIComponent(args.documentId)}?version=${args.currentVersion}`,
  };
}

function persistedFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  const plainFields = value.map((field) => {
    const candidate = field as Record<string, unknown> & {
      toObject?: () => Record<string, unknown>;
    };
    return typeof candidate?.toObject === 'function' ? candidate.toObject() : { ...candidate };
  });
  return sanitizeTemplateFields(plainFields);
}

async function removeUnfinishedObject(object: StoredObject | null) {
  if (!object) return;
  try {
    await deleteObject(object);
  } catch (cleanupError) {
    console.error('[DOCUMENT CONTENT] Failed to remove an unfinished PDF object:', cleanupError);
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(req);
  if (!auth?.userId || auth.userId.startsWith('guest_')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { documentId } = await context.params;
  const result = await loadEditableDocument(auth, documentId);
  if ('error' in result) return result.error;

  return NextResponse.json({
    success: true,
    document: documentContentPayload({
      documentId: String(result.document._id),
      documentName: result.document.documentName,
      editableContent: result.document.editableContent,
      currentVersion: result.document.currentVersion,
      fieldsNeedReview: result.document.templatePreparation?.fieldsNeedReview === true,
    }),
  });
}

export const PUT = withTrialWriteAccessFromAuthContext(async function PUT(
  req: NextRequest,
  context: RouteContext,
  authContext
): Promise<NextResponse> {
  if (!authContext?.userId || authContext.userId.startsWith('guest_')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { documentId } = await context.params;
  const result = await loadEditableDocument(authContext, documentId);
  if ('error' in result) {
    return result.error ?? NextResponse.json({ message: 'Document not found' }, { status: 404 });
  }

  const document = result.document;
  if (!['draft', 'saved'].includes(String(document.status))) {
    return NextResponse.json({
      message: 'Only a draft document can be edited.',
      code: 'DOCUMENT_CONTENT_LOCKED',
    }, { status: 409 });
  }
  if (hasAnySignedRecipient(document)) {
    return NextResponse.json({
      message: 'This document has signatures and can no longer be edited.',
      code: 'DOCUMENT_CONTENT_LOCKED',
    }, { status: 409 });
  }

  const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
  const baseVersion = payload?.baseVersion;
  if (!Number.isInteger(baseVersion) || (baseVersion as number) < 0) {
    return NextResponse.json({ message: 'A valid baseVersion is required.' }, { status: 400 });
  }
  if (baseVersion !== document.currentVersion) {
    return NextResponse.json({
      message: 'The document changed while you were editing. Reload and try again.',
      code: 'DOCUMENT_CONTENT_CONFLICT',
    }, { status: 409 });
  }

  const hasSubmittedFields = Object.prototype.hasOwnProperty.call(payload || {}, 'fields');
  if (hasSubmittedFields && !Array.isArray(payload?.fields)) {
    return NextResponse.json({ message: 'Field configuration must be a list.' }, { status: 400 });
  }
  if (Array.isArray(payload?.fields) && payload.fields.length > MAX_DOCUMENT_FIELDS) {
    return NextResponse.json({ message: `Too many fields. Maximum allowed is ${MAX_DOCUMENT_FIELDS}.` }, { status: 400 });
  }

  const editableContent = sanitizeEditableTemplateContent(payload?.editableContent);
  if (editableContent.blocks.length === 0) {
    return NextResponse.json({ message: 'Document content cannot be empty.' }, { status: 400 });
  }
  const variablesComplete = getMissingRequiredVariableLabels(editableContent).length === 0;

  const requestedName = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const documentName = requestedName.slice(0, 200) || document.documentName;
  const previousContent = sanitizeEditableTemplateContent(document.editableContent);
  const contentChanged = JSON.stringify(previousContent) !== JSON.stringify(editableContent);
  const nameChanged = documentName !== document.documentName;
  const fieldsNeedReviewBeforeSave = document.templatePreparation?.fieldsNeedReview === true;

  if (!contentChanged && !nameChanged) {
    return NextResponse.json({
      success: true,
      preparedVersion: document.currentVersion,
      document: documentContentPayload({
        documentId: String(document._id),
        documentName: document.documentName,
        editableContent: previousContent,
        currentVersion: document.currentVersion,
        fieldsNeedReview: fieldsNeedReviewBeforeSave,
      }),
    });
  }

  // A title change does not affect the rendered pages or field coordinates.
  // Keep it a small CAS update instead of creating a redundant PDF version.
  if (!contentChanged) {
    const updateResult = await DocumentModel.updateOne(
      buildDocumentWriteFilter({
        userId: authContext.userId,
        orgId: authContext.orgId,
        userEmail: result.requesterEmail,
        documentId,
        minimumAccess: 'can_edit',
        extra: { currentVersion: document.currentVersion, status: { $in: ['draft', 'saved'] } },
      }),
      { $set: { documentName, updatedAt: new Date() } }
    );
    if (updateResult.matchedCount === 0) {
      return NextResponse.json({
        message: 'The document changed while you were editing. Reload and try again.',
        code: 'DOCUMENT_CONTENT_CONFLICT',
      }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      preparedVersion: document.currentVersion,
      document: documentContentPayload({
        documentId: String(document._id),
        documentName,
        editableContent,
        currentVersion: document.currentVersion,
        fieldsNeedReview: fieldsNeedReviewBeforeSave,
      }),
    });
  }

  const versions: IDocumentVersion[] = Array.isArray(document.versions) ? document.versions : [];
  const currentVersion = versions.find((version) => version.version === document.currentVersion);
  if (!currentVersion || currentVersion.label !== 'prepared' || currentVersion.locked) {
    return NextResponse.json({
      message: 'The editable draft version is unavailable.',
      code: 'DOCUMENT_CONTENT_VERSION_UNAVAILABLE',
    }, { status: 409 });
  }

  const fields = hasSubmittedFields
    ? persistedFields(payload?.fields)
    : persistedFields(currentVersion.fields);
  const fieldsNeedReview = fieldsNeedReviewBeforeSave || (contentChanged && fields.length > 0);
  let uploadedObject: StoredObject | null = null;

  try {
    const pdf = await renderEditableTemplatePdf(editableContent);
    const hash = await sha256Buffer(pdf);
    const provider = getStorageProvider();
    const bucket = getStorageBucketName(provider);
    if (!bucket) {
      return NextResponse.json({ message: 'Storage bucket is not configured.' }, { status: 500 });
    }

    const region = getRegion(provider);
    const nextVersion = document.currentVersion + 1;
    const ownerId = String(document.userId);
    const key = `documents/${ownerId}/${document._id}/authored-prepared-${nextVersion}-${randomUUID()}.pdf`;
    uploadedObject = { provider, bucket, region, key };

    await putObjectStream({
      bucket,
      key,
      body: pdf,
      contentType: 'application/pdf',
      contentLength: pdf.length,
      provider,
    });

    const now = new Date();
    const preparedVersion = {
      version: nextVersion,
      label: 'prepared',
      derivedFromVersion: document.currentVersion,
      storage: {
        provider,
        bucket,
        region,
        key,
        url: `${provider}://${bucket}/${key}`,
      },
      hash,
      hashAlgo: 'SHA-256',
      size: pdf.length,
      mimeType: 'application/pdf',
      locked: false,
      fields,
      documentName,
      status: 'draft',
      changeLog: contentChanged ? 'Document content updated' : 'Document name updated',
      editHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    const updateResult = await DocumentModel.updateOne(
      buildDocumentWriteFilter({
        userId: authContext.userId,
        orgId: authContext.orgId,
        userEmail: result.requesterEmail,
        documentId,
        minimumAccess: 'can_edit',
        extra: {
          currentVersion: document.currentVersion,
          status: { $in: ['draft', 'saved'] },
        },
      }),
      {
        $push: { versions: preparedVersion },
        $set: {
          currentVersion: nextVersion,
          editableContent,
          documentName,
          'templatePreparation.completed': variablesComplete,
          'templatePreparation.fieldsNeedReview': fieldsNeedReview,
          updatedAt: now,
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      await removeUnfinishedObject(uploadedObject);
      uploadedObject = null;
      return NextResponse.json({
        message: 'The document changed while you were editing. Reload and try again.',
        code: 'DOCUMENT_CONTENT_CONFLICT',
      }, { status: 409 });
    }

    uploadedObject = null;
    return NextResponse.json({
      success: true,
      preparedVersion: nextVersion,
      fields,
      document: documentContentPayload({
        documentId: String(document._id),
        documentName,
        editableContent,
        currentVersion: nextVersion,
        fieldsNeedReview,
      }),
    });
  } catch (error) {
    await removeUnfinishedObject(uploadedObject);
    console.error('[DOCUMENT CONTENT] Failed to save editable document content:', error);
    return NextResponse.json({
      message: 'Unable to save document content. Please try again.',
      code: 'DOCUMENT_CONTENT_SAVE_FAILED',
    }, { status: 500 });
  }
}, { requireCsrf: true, useSecurityHeaders: true });
