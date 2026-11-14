import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { documentIntegrationUpdate } from '@/lib/integration-outbox-event';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';

import { getApiKeyContext, getApiRateLimitResponse } from '@/lib/api-key';
import { writeAuditEvent } from '@/lib/audit';
import { copyObject, deleteObject, getObjectStream, getRegion, getStorageBucketName, normalizeStorageProvider, streamToBuffer } from '@/lib/s3';
import type { StorageProvider } from '@/lib/s3';
import { getLatestPreparedVersion } from '@/lib/signing-utils';
import { getTrialWriteAccessDeniedResponse } from '@/lib/trial-access';
import DocumentModel from '@/models/Document';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const MEDIA_FIELD_TYPES = new Set(['signature', 'initials', 'stamp', 'image', 'live_photo']);
const MEDIA_DATA_URL = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/i;

type PreparedMediaField = {
  id: string;
  type: string;
  value?: string;
};

async function findUndecodableMediaField(
  fields: PreparedMediaField[]
): Promise<{ fieldId: string; message: string } | null> {
  const fieldsWithMedia = fields.filter(
    (field) => MEDIA_FIELD_TYPES.has(field.type) && typeof field.value === 'string' && field.value.trim()
  );
  if (fieldsWithMedia.length === 0) return null;

  const pdf = await PDFDocument.create();
  for (const field of fieldsWithMedia) {
    const match = MEDIA_DATA_URL.exec(field.value!);
    // The schema reports format errors before this helper is invoked.
    if (!match || match[2].length % 4 !== 0) {
      return { fieldId: field.id, message: 'Media field values must be PNG or JPEG data URLs.' };
    }

    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0 || bytes.toString('base64') !== match[2]) {
      return { fieldId: field.id, message: 'Media field values must contain valid base64 image data.' };
    }

    try {
      if (match[1].toLowerCase() === 'png') {
        await pdf.embedPng(bytes);
      } else {
        await pdf.embedJpg(bytes);
      }
    } catch {
      return { fieldId: field.id, message: 'Media field values must contain a decodable PNG or JPEG image.' };
    }
  }

  return null;
}

const FieldSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.enum(['signature', 'text', 'full_name', 'date', 'checkbox', 'radio', 'dropdown', 'image', 'initials', 'live_photo', 'stamp']),
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  pageNumber: z.number().int().positive().default(1),
  pageRect: z.object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    top: z.number().finite().optional(),
    right: z.number().finite().optional(),
    bottom: z.number().finite().optional(),
    left: z.number().finite().optional(),
  }).strict().nullable().optional(),
  recipientId: z.string().trim().min(1).max(120).nullable().optional(),
  required: z.boolean().default(true),
  value: z.string().max(100_000).optional(),
  placeholder: z.string().max(500).optional(),
  fieldOwner: z.enum(['me', 'recipients']).default('recipients'),
  settings: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((field, context) => {
  if (!MEDIA_FIELD_TYPES.has(field.type) || typeof field.value !== 'string' || !field.value.trim()) {
    return;
  }
  if (/^\s*https?:\/\//i.test(field.value)) {
    context.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'Remote URLs are not allowed for image-based field values.',
    });
  } else if (!MEDIA_DATA_URL.test(field.value) || field.value.split(',')[1].length % 4 !== 0) {
    context.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'Media field values must be PNG or JPEG data URLs.',
    });
  }
});

const BodySchema = z.object({ fields: z.array(FieldSchema).min(1).max(4000) }).strict();

type VersionShape = {
  version: number;
  label?: string;
  locked?: boolean;
  fields?: unknown[];
  hash?: string;
  hashAlgo?: string;
  size?: number;
  mimeType?: string;
  updatedAt?: Date;
  storage?: { provider?: string; bucket?: string; key?: string; region?: string; url?: string };
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  let copiedObject: { bucket: string; key: string; region: string; provider: StorageProvider } | null = null;
  try {
    const apiKey = await getApiKeyContext(req);
    if (!apiKey) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
    const rateLimitResponse = getApiRateLimitResponse(apiKey);
    if (rateLimitResponse) return rateLimitResponse;
    if (!apiKey.scopes.includes('documents:write')) return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    const trialDenied = await getTrialWriteAccessDeniedResponse({ orgId: apiKey.orgId });
    if (trialDenied) return trialDenied;
    const { documentId } = await params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) return NextResponse.json({ error: 'invalid_document_id' }, { status: 400 });
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request', details: parsed.error.flatten() }, { status: 400 });
    const invalidMedia = await findUndecodableMediaField(parsed.data.fields);
    if (invalidMedia) {
      return NextResponse.json({
        error: 'invalid_request',
        details: {
          formErrors: [],
          fieldErrors: { fields: [`${invalidMedia.fieldId}: ${invalidMedia.message}`] },
        },
      }, { status: 400 });
    }
    const fieldIds = new Set(parsed.data.fields.map((field) => field.id));
    if (fieldIds.size !== parsed.data.fields.length) return NextResponse.json({ error: 'duplicate_field_id' }, { status: 400 });
    if (parsed.data.fields.some((field) => field.fieldOwner === 'recipients' && !field.recipientId)) {
      return NextResponse.json({ error: 'recipient_id_required' }, { status: 400 });
    }

    await connectDB();
    const document = await DocumentModel.findOne({ _id: documentId, orgId: apiKey.orgId, deletedAt: null });
    if (!document) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!['draft', 'saved'].includes(document.status)) return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    const sourceCurrentVersion = document.currentVersion;
    const sourceUpdatedAt = document.updatedAt;
    const versions = (Array.isArray(document.versions) ? document.versions : []) as VersionShape[];
    let prepared = getLatestPreparedVersion(versions);
    if (prepared?.locked) return NextResponse.json({ error: 'prepared_version_locked' }, { status: 409 });

    const source = prepared
      || versions.find((version) => version.version === document.currentVersion)
      || versions.find((version) => version.label === 'original')
      || versions[versions.length - 1];
    if (!source?.storage?.key) return NextResponse.json({ error: 'source_version_unavailable' }, { status: 409 });
    const sourceProvider = normalizeStorageProvider(source.storage.provider);
    const sourceBucket = source.storage.bucket || getStorageBucketName(sourceProvider);
    if (!sourceBucket) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
    const sourceRegion = source.storage.region || getRegion(sourceProvider);
    const sourcePdf = await streamToBuffer(await getObjectStream({
      bucket: sourceBucket,
      key: source.storage.key,
      region: sourceRegion,
      provider: sourceProvider,
    }));
    const pageCount = (await PDFDocument.load(new Uint8Array(sourcePdf))).getPageCount();
    const outOfRangeField = parsed.data.fields.find((field) => field.pageNumber > pageCount);
    if (outOfRangeField) {
      return NextResponse.json({
        error: 'page_number_out_of_range',
        fieldId: outOfRangeField.id,
        pageNumber: outOfRangeField.pageNumber,
        pageCount,
      }, { status: 400 });
    }

    if (!prepared) {
      const versionNumber = (document.currentVersion ?? 0) + 1;
      const key = `documents/${apiKey.userId}/${document._id}/prepared_${versionNumber}.pdf`;
      await copyObject({
        sourceBucket,
        sourceKey: source.storage.key,
        destinationBucket: sourceBucket,
        destinationKey: key,
        region: sourceRegion,
        provider: sourceProvider,
      });
      copiedObject = {
        bucket: sourceBucket,
        key,
        region: sourceRegion,
        provider: sourceProvider,
      };
      const now = new Date();
      prepared = {
        version: versionNumber,
        label: 'prepared',
        storage: {
          provider: sourceProvider,
          bucket: sourceBucket,
          key,
          region: sourceRegion,
          url: `${sourceProvider}://${sourceBucket}/${key}`,
        },
        hash: source.hash,
        hashAlgo: source.hashAlgo || 'SHA-256',
        size: source.size,
        mimeType: source.mimeType || 'application/pdf',
        locked: false,
        fields: parsed.data.fields,
      };
      document.versions.push({
        ...prepared,
        derivedFromVersion: source.version,
        documentName: document.documentName,
        status: 'draft',
        changeLog: 'Fields prepared through the public API',
        editHistory: [],
        createdAt: now,
        updatedAt: now,
      } as never);
      document.currentVersion = versionNumber;
    } else {
      prepared.fields = parsed.data.fields;
      prepared.updatedAt = new Date();
    }
    const updatedAt = new Date();
    const persistence = await DocumentModel.updateOne({
      _id: document._id,
      orgId: apiKey.orgId,
      deletedAt: null,
      status: { $in: ['draft', 'saved'] },
      currentVersion: sourceCurrentVersion,
      updatedAt: sourceUpdatedAt,
      $or: [
        { sendDispatch: { $exists: false } },
        { sendDispatch: null },
        { 'sendDispatch.status': 'failed' },
      ],
    }, {
      $set: {
        versions: document.versions,
        currentVersion: document.currentVersion,
        updatedAt,
        ...documentIntegrationUpdate({ event: 'document_prepared', documentId: document._id, orgId: apiKey.orgId,
          metadata: { source: 'api', fieldCount: parsed.data.fields.length, version: prepared.version }, createdAt: updatedAt }),
      },
    });
    if (persistence.modifiedCount !== 1) {
      if (copiedObject) {
        await deleteObject(copiedObject).catch(() => undefined);
        copiedObject = null;
      }
      return NextResponse.json({ error: 'preparation_conflict' }, { status: 409 });
    }
    document.updatedAt = updatedAt;
    copiedObject = null;
    await writeAuditEvent({
      userId: apiKey.userId,
      orgId: apiKey.orgId,
      actor: apiKey.userId,
      documentId: document._id,
      action: 'document_prepared',
      metadata: { source: 'api', fieldCount: parsed.data.fields.length, version: prepared.version },
    });
    return NextResponse.json({ data: { id: String(document._id), version: prepared.version, fieldCount: parsed.data.fields.length, status: document.status } });
  } catch (error) {
    if (copiedObject) {
      await deleteObject(copiedObject).catch(() => undefined);
    }
    console.error('[API DOCUMENT PREPARE] Failed:', error);
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
