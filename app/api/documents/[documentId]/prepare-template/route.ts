import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

import { validateCsrfToken } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { sha256Buffer } from '@/lib/hash';
import { deleteObject, getRegion, getStorageBucketName, getStorageProvider, putObjectStream } from '@/lib/s3';
import { normalizeVariableKey } from '@/lib/template-content';
import { renderEditableTemplatePdf } from '@/lib/template-content-pdf';
import { sanitizeTemplateFields } from '@/lib/template-persistence';
import DocumentModel from '@/models/Document';
import TemplateModel, { type ITemplate } from '@/models/Template';
import connectDB from '@/utils/db';

type Context = { params: Promise<{ documentId: string }> };
const MAX_PREPARED_FIELDS = 500;

async function loadOwnedDocument(req: NextRequest, context: Context) {
  const auth = await getAuthContext(req);
  if (!auth?.userId || !auth.orgId) return { error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) };
  const { documentId } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(documentId)) return { error: NextResponse.json({ message: 'Invalid document ID' }, { status: 400 }) };
  await connectDB();
  const document = await DocumentModel.findOne({ _id: documentId, userId: auth.userId, orgId: auth.orgId });
  if (!document) return { error: NextResponse.json({ message: 'Document not found' }, { status: 404 }) };
  if (!document.templateId) return { error: NextResponse.json({ message: 'This document was not created from a template' }, { status: 404 }) };
  const template = await TemplateModel.findById(document.templateId);
  if (!template?.editableContent) return { error: NextResponse.json({ message: 'Template preparation is not required' }, { status: 404 }) };
  return { auth, document, template };
}

const templatePayload = (template: ITemplate) => ({
  _id: String(template._id), name: template.name, description: template.description, category: template.category,
  jurisdiction: template.jurisdiction, isSystemTemplate: false, sharingScope: 'private', userId: template.userId,
  templateFileUrl: template.templateFileUrl, pageCount: template.pageCount,
  editableContent: template.editableContent, fields: template.fields || [], defaultSigners: template.defaultSigners || [], createdAt: template.createdAt,
});

const preparedFields = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const plainFields = value.flatMap((field) => {
    if (!field || typeof field !== 'object') return [];
    const candidate = field as Record<string, unknown> & {
      toObject?: () => Record<string, unknown>;
    };
    const plain = candidate.toObject ? candidate.toObject() : { ...candidate };
    return [plain];
  });
  // Page geometry is needed to map a saved template field back onto the
  // regenerated PDF. Keep it, but only retain the known numeric properties.
  return sanitizeTemplateFields(plainFields);
};

export async function GET(req: NextRequest, context: Context) {
  const result = await loadOwnedDocument(req, context);
  if ('error' in result) return result.error;
  const definitions = result.template.editableContent?.variables || [];
  const savedValues = result.document.templatePreparation?.variableValues || {};
  const excludedVariableKeys = Array.isArray(result.document.templatePreparation?.excludedVariableKeys) ? result.document.templatePreparation.excludedVariableKeys : [];
  const excluded = new Set(excludedVariableKeys);
  const values = Object.fromEntries(definitions.map((variable: { key: string; defaultValue?: string }) => [variable.key, savedValues[variable.key] ?? variable.defaultValue ?? '']));
  const missingKeys = definitions.filter((variable: { key: string; required?: boolean }) => !excluded.has(variable.key) && variable.required && !String(values[variable.key] || '').trim()).map((variable: { key: string }) => variable.key);
  return NextResponse.json({
    required: missingKeys.length > 0,
    missingKeys,
    values,
    excludedVariableKeys,
    fieldsNeedReview: result.document.templatePreparation?.fieldsNeedReview === true,
    template: templatePayload(result.template),
  });
}

export async function POST(req: NextRequest, context: Context) {
  if (!validateCsrfToken(req)) return NextResponse.json({ message: 'CSRF validation failed' }, { status: 403 });
  const result = await loadOwnedDocument(req, context);
  if ('error' in result) return result.error;
  if (result.document.status !== 'draft' && result.document.status !== 'saved') return NextResponse.json({ message: 'Only a draft agreement can be prepared' }, { status: 409 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const definitions = result.template.editableContent?.variables || [];
  const allowed = new Map(definitions.map((variable: { key: string }) => [variable.key, variable]));
  const values = Object.fromEntries(Object.entries(body.variableValues && typeof body.variableValues === 'object' ? body.variableValues : {}).flatMap(([rawKey, rawValue]) => {
    const key = normalizeVariableKey(rawKey); if (!allowed.has(key) || typeof rawValue !== 'string') return []; return [[key, rawValue.trim().slice(0, 2000)]];
  }));
  const excludedVariableKeys = Array.from(new Set((Array.isArray(body.excludedVariableKeys) ? body.excludedVariableKeys : []).map((key: unknown) => normalizeVariableKey(String(key))).filter((key: string) => allowed.has(key))));
  const excluded = new Set(excludedVariableKeys);
  // A single space removes an excluded token; an empty string intentionally leaves
  // an incomplete {{variable}} placeholder visible in the generated agreement.
  const resolvedValues = Object.fromEntries(definitions.map((variable: { key: string; defaultValue?: string }) => [variable.key, excluded.has(variable.key) ? ' ' : values[variable.key] ?? variable.defaultValue ?? '']));
  const missingKeys = definitions.filter((variable: { key: string; required?: boolean }) => !excluded.has(variable.key) && variable.required && !String(resolvedValues[variable.key] || '').trim()).map((variable: { key: string }) => variable.key);

  // Applying variables regenerates the PDF. Accept the Builder's current field
  // snapshot with this explicit user action so a field that was just placed or
  // moved is not lost merely because it has not gone through the normal Save
  // action yet. When omitted, preserve the persisted current-version snapshot
  // for backwards compatibility.
  const hasSubmittedFields = Object.prototype.hasOwnProperty.call(body, 'fields');
  if (hasSubmittedFields && !Array.isArray(body.fields)) {
    return NextResponse.json({ message: 'Field configuration must be a list.' }, { status: 400 });
  }
  if (Array.isArray(body.fields) && body.fields.length > MAX_PREPARED_FIELDS) {
    return NextResponse.json({ message: `Too many fields. Maximum allowed is ${MAX_PREPARED_FIELDS}.` }, { status: 400 });
  }

  const previousValues = result.document.templatePreparation?.variableValues || {};
  const previousExcluded = new Set(Array.isArray(result.document.templatePreparation?.excludedVariableKeys) ? result.document.templatePreparation.excludedVariableKeys : []);
  const exclusionsChanged = excludedVariableKeys.length !== previousExcluded.size || excludedVariableKeys.some((key) => !previousExcluded.has(key));
  const changed = exclusionsChanged || definitions.some((variable: { key: string; defaultValue?: string }) => String(resolvedValues[variable.key] || '') !== String(previousValues[variable.key] ?? variable.defaultValue ?? ''));
  const currentVersion = result.document.versions.find((version: { version?: number }) => version.version === result.document.currentVersion);
  const currentVersionHasFieldConfiguration = Boolean(currentVersion && Array.isArray(currentVersion.fields));
  const fields = preparedFields(
    hasSubmittedFields
      ? body.fields
      : currentVersionHasFieldConfiguration
        ? currentVersion?.fields
        : result.template.fields
  );
  const fieldsNeedReview =
    result.document.templatePreparation?.fieldsNeedReview === true ||
    (changed && fields.length > 0);
  const baseVersion = result.document.currentVersion;
  const templatePreparation = {
    completed: missingKeys.length === 0,
    variableValues: resolvedValues,
    excludedVariableKeys,
    completedAt: missingKeys.length === 0 ? new Date() : undefined,
    fieldsNeedReview,
  };
  let nextPreparedVersion: Record<string, unknown> | null = null;
  let nextPreparedVersionNumber: number | null = null;
  let uploadedPreparedObject: {
    bucket: string;
    key: string;
    provider: ReturnType<typeof getStorageProvider>;
  } | null = null;
  const cleanupUploadedPreparedObject = async () => {
    if (!uploadedPreparedObject) return;
    try {
      await deleteObject(uploadedPreparedObject);
    } catch (cleanupError) {
      console.error('Failed to clean up a conflicting prepared template PDF:', cleanupError);
    }
    uploadedPreparedObject = null;
  };

  try {
    if (changed) {
      const pdf = await renderEditableTemplatePdf(result.template.editableContent, resolvedValues);
      const provider = getStorageProvider(); const bucket = getStorageBucketName(provider);
      if (!bucket) return NextResponse.json({ message: 'Storage bucket is not configured' }, { status: 500 });
      const nextVersion = (baseVersion || 0) + 1;
      const key = `documents/${result.auth.userId}/${result.document._id}/template-prepared-${nextVersion}-${randomUUID()}.pdf`;
      await putObjectStream({ bucket, key, body: pdf, contentType: 'application/pdf', contentLength: pdf.length, provider });
      uploadedPreparedObject = { bucket, key, provider };
      nextPreparedVersionNumber = nextVersion;
      nextPreparedVersion = { version: nextVersion, label: 'prepared', derivedFromVersion: baseVersion, storage: { provider, bucket, key, region: getRegion(provider), url: `${provider}://${bucket}/${key}` }, hash: await sha256Buffer(pdf), hashAlgo: 'SHA-256', size: pdf.length, mimeType: 'application/pdf', locked: false, fields, documentName: result.document.documentName, status: 'draft', changeLog: 'Applied template variables before sending', editHistory: [], createdAt: new Date(), updatedAt: new Date() };
    }
    const updateResult = await DocumentModel.updateOne(
      {
        _id: result.document._id,
        userId: result.auth.userId,
        orgId: result.auth.orgId,
        currentVersion: baseVersion,
        status: { $in: ['draft', 'saved'] },
      },
      nextPreparedVersion
        ? {
            $push: { versions: nextPreparedVersion },
            $set: {
              currentVersion: nextPreparedVersion.version,
              templatePreparation,
            },
          }
        : { $set: { templatePreparation } }
    );
    if (updateResult.matchedCount === 0) {
      await cleanupUploadedPreparedObject();
      return NextResponse.json({
        message: 'The document changed while template values were being applied. Reload and try again.',
        code: 'DOCUMENT_PREPARATION_CONFLICT',
      }, { status: 409 });
    }
  } catch (error) {
    await cleanupUploadedPreparedObject();
    throw error;
  }
  return NextResponse.json({
    success: true,
    complete: missingKeys.length === 0,
    missingKeys,
    values: resolvedValues,
    excludedVariableKeys,
    requiresFieldReview: fieldsNeedReview,
    fieldsNeedReview,
    fields,
    recipients: result.document.recipients,
    preparedVersion: nextPreparedVersionNumber ?? baseVersion,
  });
}
