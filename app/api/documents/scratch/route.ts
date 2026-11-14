import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { writeAuditEvent } from '@/lib/audit';
import { stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';
import { sha256Buffer } from '@/lib/hash';
import { applyRetentionToDocument, computeRetentionFields } from '@/lib/retention';
import {
  copyObject,
  deleteObject,
  getRegion,
  getStorageBucketName,
  getStorageProvider,
  putObjectStream,
} from '@/lib/s3';
import { normalizeIp } from '@/lib/signing-utils';
import { sanitizeEditableTemplateContent } from '@/lib/template-content';
import { renderEditableTemplatePdf } from '@/lib/template-content-pdf';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import DocumentModel from '@/models/Document';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

type StoredObject = {
  bucket: string;
  key: string;
  region: string;
  provider: ReturnType<typeof getStorageProvider>;
};

function storageReference(object: StoredObject) {
  return {
    provider: object.provider,
    bucket: object.bucket,
    key: object.key,
    region: object.region,
    url: `${object.provider}://${object.bucket}/${object.key}`,
  };
}

async function removeUnfinishedObjects(objects: StoredObject[]) {
  for (const object of objects) {
    try {
      await deleteObject(object);
    } catch (cleanupError) {
      console.error('[SCRATCH DOCUMENT] Failed to remove an unfinished document object:', cleanupError);
    }
  }
}

export const POST = withTrialWriteAccessFromAuthContext(async function POST(
  req: NextRequest,
  _context,
  authContext
) {
  const storedObjects: StoredObject[] = [];

  try {
    if (!authContext?.userId || authContext.userId.startsWith('guest_')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const payload = await req.json().catch(() => ({}));
    const requestedName = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const documentName = requestedName.slice(0, 200) || 'Untitled document';
    const originalFileName = /\.pdf$/i.test(documentName)
      ? documentName
      : `${documentName}.pdf`;
    const editableContent = sanitizeEditableTemplateContent({
      version: 1,
      blocks: [{
        id: 'initial-paragraph',
        type: 'paragraph',
        text: '',
        html: '',
      }],
      variables: [],
    });
    const pdf = await renderEditableTemplatePdf(editableContent);
    const hash = await sha256Buffer(pdf);
    const now = new Date();
    const documentId = new mongoose.Types.ObjectId();
    const sessionId = `session_${randomUUID()}`;

    const provider = getStorageProvider();
    const bucket = getStorageBucketName(provider);
    if (!bucket) {
      return NextResponse.json({ message: 'Storage bucket is not configured.' }, { status: 500 });
    }
    const region = getRegion(provider);
    const originalObject: StoredObject = {
      provider,
      bucket,
      region,
      key: `documents/${authContext.userId}/${documentId}/original.pdf`,
    };
    const preparedObject: StoredObject = {
      provider,
      bucket,
      region,
      key: `documents/${authContext.userId}/${documentId}/prepared_1.pdf`,
    };

    const originalVersion = {
      version: 0,
      label: 'original' as const,
      storage: storageReference(originalObject),
      hash,
      hashAlgo: 'SHA-256',
      size: pdf.length,
      mimeType: 'application/pdf',
      locked: true,
      status: 'locked' as const,
      ingestionNote: 'Created in the document writer',
      createdAt: now,
      updatedAt: now,
    };
    const preparedVersion = {
      version: 1,
      label: 'prepared' as const,
      derivedFromVersion: 0,
      storage: storageReference(preparedObject),
      hash,
      hashAlgo: 'SHA-256',
      size: pdf.length,
      mimeType: 'application/pdf',
      locked: false,
      fields: [],
      documentName,
      status: 'draft' as const,
      changeLog: 'Document ready for editing',
      editHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    const document = new DocumentModel({
      _id: documentId,
      userId: authContext.userId,
      ...(authContext.orgId ? { orgId: authContext.orgId } : {}),
      documentName,
      originalFileName,
      currentVersion: 1,
      currentSessionId: sessionId,
      signingMode: 'parallel',
      versions: [originalVersion, preparedVersion],
      recipients: [],
      signingEvents: [],
      auditTrailVersion: 1,
      status: 'draft',
      isTemplate: false,
      editableContent,
      templatePreparation: {
        completed: true,
        variableValues: {},
        fieldsNeedReview: false,
      },
      createdAt: now,
      updatedAt: now,
    });

    const retention = await computeRetentionFields({ document: document.toObject() });
    applyRetentionToDocument(document, retention, now);

    await putObjectStream({
      bucket,
      key: originalObject.key,
      body: pdf,
      contentType: 'application/pdf',
      contentLength: pdf.length,
      provider,
    });
    storedObjects.push(originalObject);

    await copyObject({
      sourceBucket: bucket,
      sourceKey: originalObject.key,
      destinationBucket: bucket,
      destinationKey: preparedObject.key,
      region,
      provider,
    });
    storedObjects.push(preparedObject);

    stageDocumentIntegrationEvent(document, { event: 'document_created', createdAt: now, metadata: { source: 'document_writer' } });
    await document.save();
    storedObjects.length = 0;

    const { ip, ipUnavailableReason } = normalizeIp(req.headers.get('x-forwarded-for'));
    try {
      await writeAuditEvent({
        userId: authContext.userId,
        orgId: authContext.orgId,
        documentId: document._id,
        actor: authContext.userId,
        action: 'document_created',
        ipAddress: ip,
        userAgent: req.headers.get('user-agent') || 'unknown',
        metadata: { ipUnavailableReason, source: 'document_writer' },
      });
    } catch (auditError) {
      // The document and its storage objects are already durable. Do not turn an
      // audit-service failure into a broken document response.
      console.error('[SCRATCH DOCUMENT] Failed to record document creation:', auditError);
    }

    return NextResponse.json({
      success: true,
      documentId: String(document._id),
      sessionId,
      document: {
        _id: String(document._id),
        name: documentName,
        editableContent,
        currentVersion: 1,
        fieldsNeedReview: false,
        fileUrl: `/api/documents/${document._id}?version=1`,
      },
    }, { status: 201 });
  } catch (error) {
    await removeUnfinishedObjects(storedObjects.reverse());
    console.error('[SCRATCH DOCUMENT] Failed to create document:', error);
    return NextResponse.json({
      message: 'Unable to create a blank document. Please try again.',
      code: 'DOCUMENT_SCRATCH_CREATE_FAILED',
    }, { status: 500 });
  }
}, { requireCsrf: true, useSecurityHeaders: true });
