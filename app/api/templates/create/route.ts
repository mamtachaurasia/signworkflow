import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import TemplateModel, { type ITemplate } from '@/models/Template';
import DocumentModel from '@/models/Document';
import type { IVersionDoc } from '@/models/Document';
import mongoose, { type HydratedDocument } from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { getRegion, getStorageBucketName, type StorageProvider } from '@/lib/s3';
import { getLatestPreparedVersion } from '@/lib/signing-utils';
import {
    sanitizeTemplateDefaultSigners,
    sanitizeTemplateFields,
    sanitizeTemplateTags,
} from '@/lib/template-persistence';
import { canManageTemplate, normalizeTemplateSharingScope } from '@/lib/template-access';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import type { EditableTemplateContent } from '@/types/template-content';
import { isTemplateCategory } from '@/config/template-categories';
import { getTemplateLayoutState } from '@/lib/template-layout';
import { toClientTemplate } from '@/lib/template-response';
import {
    clearLegacyTemplateFilePath,
    deleteTemplateArtifacts,
    getTemplatePdfArtifact,
    isTemplateArtifact,
    readTemplateStorageBuffer,
    sameTemplateArtifact,
    storeTemplateArtifact,
    TEMPLATE_ARTIFACT_MAX_BYTES,
    type TemplateArtifact,
} from '@/lib/template-artifacts';

type TemplateSaveMode = 'create' | 'update';

function resolveDocumentVersionStorage(value: unknown): {
    provider: StorageProvider;
    bucket: string;
    region: string;
    key: string;
} | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as { provider?: unknown; bucket?: unknown; region?: unknown; key?: unknown };
    if ((source.provider !== 's3' && source.provider !== 'r2') || typeof source.key !== 'string' || !source.key.trim()) {
        return null;
    }

    const provider = source.provider;
    const bucket = typeof source.bucket === 'string' && source.bucket.trim()
        ? source.bucket.trim()
        : getStorageBucketName(provider);
    if (!bucket) return null;
    const region = typeof source.region === 'string' && source.region.trim()
        ? source.region.trim()
        : getRegion(provider);

    return { provider, bucket, region, key: source.key.trim() };
}

function getSaveMode(value: unknown): TemplateSaveMode | null {
    if (value === undefined || value === null || value === 'create') return 'create';
    return value === 'update' ? 'update' : null;
}

export const POST = withTrialWriteAccessFromAuthContext(async function POST(req: NextRequest, _context, authContext) {
    let createdArtifacts: TemplateArtifact[] = [];

    try {
        await connectDB();
        if (!authContext?.userId || !authContext.orgId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = authContext.userId;
        const orgId = authContext.orgId;

        const body = await req.json();
        const {
            name,
            description,
            category,
            fields,
            defaultSigners,
            tags,
            documentId,
            sharingScope: rawSharingScope,
            saveMode: rawSaveMode,
            existingTemplateId,
            replaceConfirmation,
            metadata: rawMetadata,
        } = body;
        const saveMode = getSaveMode(rawSaveMode);

        if (!saveMode) {
            return NextResponse.json({ message: 'Invalid template save mode' }, { status: 400 });
        }
        if (typeof documentId !== 'string' || !mongoose.Types.ObjectId.isValid(documentId)) {
            return NextResponse.json({ message: 'A valid document ID is required' }, { status: 400 });
        }

        let existingTemplate: HydratedDocument<ITemplate> | null = null;
        if (saveMode === 'update') {
            if (replaceConfirmation !== true) {
                return NextResponse.json({ message: 'Confirm replacement before updating a template' }, { status: 400 });
            }
            if (typeof existingTemplateId !== 'string' || !mongoose.Types.ObjectId.isValid(existingTemplateId)) {
                return NextResponse.json({ message: 'Select an existing template to update' }, { status: 400 });
            }
            existingTemplate = await TemplateModel.findById(existingTemplateId);
            if (!existingTemplate) {
                return NextResponse.json({ message: 'The selected template no longer exists' }, { status: 404 });
            }
            if (!canManageTemplate(existingTemplate, { userId, orgId, orgRole: authContext.orgRole })) {
                return NextResponse.json({ message: 'You do not have permission to update this template' }, { status: 403 });
            }
            if (existingTemplate.isActive === false || existingTemplate.deletedAt) {
                return NextResponse.json({
                    message: 'Restore this template before replacing it.',
                }, { status: 409 });
            }
        }

        let templateName: string;
        let templateDescription: string;
        let templateCategory: string;
        let templateTags: unknown;
        if (saveMode === 'create') {
            if (typeof name !== 'string' || !name.trim()) {
                return NextResponse.json({ message: 'A template name is required' }, { status: 400 });
            }
            if (typeof category !== 'string' || !isTemplateCategory(category)) {
                return NextResponse.json({ message: 'Invalid template category' }, { status: 400 });
            }
            templateName = name.trim().slice(0, 200);
            templateDescription = typeof description === 'string' ? description.trim().slice(0, 2_000) : '';
            templateCategory = category;
            templateTags = tags;
        } else if (rawMetadata === undefined) {
            // Content replacement deliberately preserves template identity and
            // library metadata unless the user explicitly edits it.
            templateName = existingTemplate!.name;
            templateDescription = existingTemplate!.description || '';
            templateCategory = existingTemplate!.category;
            templateTags = existingTemplate!.tags || [];
        } else {
            if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
                return NextResponse.json({ message: 'Invalid template metadata' }, { status: 400 });
            }
            const metadata = rawMetadata as Record<string, unknown>;
            if (typeof metadata.name !== 'string' || !metadata.name.trim()) {
                return NextResponse.json({ message: 'A template name is required' }, { status: 400 });
            }
            if (typeof metadata.category !== 'string' || !isTemplateCategory(metadata.category)) {
                return NextResponse.json({ message: 'Invalid template category' }, { status: 400 });
            }
            templateName = metadata.name.trim().slice(0, 200);
            templateDescription = typeof metadata.description === 'string'
                ? metadata.description.trim().slice(0, 2_000)
                : '';
            templateCategory = metadata.category;
            templateTags = metadata.tags;
        }

        const requestedSharingScope = normalizeTemplateSharingScope(rawSharingScope);
        if (saveMode === 'create' && requestedSharingScope === 'workspace') {
            const sharingGuard = await getPlanGateForOrgFeature({
                orgId,
                feature: 'template_collaboration',
            });
            if (!sharingGuard.allowed) {
                return NextResponse.json({ message: sharingGuard.message }, { status: sharingGuard.status });
            }
        }

        const originalDoc = await DocumentModel.findOne({
            _id: documentId,
            userId,
            orgId,
        }).lean<{
            userId: { toString(): string };
            orgId?: { toString(): string };
            versions?: IVersionDoc[];
            currentVersion?: number;
            fields?: unknown[];
            recipients?: unknown[];
            templateId?: unknown;
            templatePreparation?: { variableValues?: Record<string, string>; excludedVariableKeys?: string[] };
        } | null>();
        if (!originalDoc) {
            return NextResponse.json({ message: 'Original document not found' }, { status: 404 });
        }

        if (originalDoc.userId.toString() !== userId || (originalDoc.orgId && originalDoc.orgId.toString() !== orgId)) {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        const sourceTemplate = originalDoc.templateId
            ? await TemplateModel.findById(originalDoc.templateId).select('editableContent').lean<{ editableContent?: EditableTemplateContent } | null>()
            : null;
        const excludedVariableKeys = new Set(originalDoc.templatePreparation?.excludedVariableKeys || []);
        const removeExcludedTokens = (value: string) => value.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (token, key: string) => excludedVariableKeys.has(key.toLowerCase()) ? '' : token);
        const reusableContent = sourceTemplate?.editableContent
            ? {
                ...sourceTemplate.editableContent,
                blocks: sourceTemplate.editableContent.blocks.map((block) => ({
                    ...block,
                    text: removeExcludedTokens(block.text),
                    html: block.html ? removeExcludedTokens(block.html) : undefined,
                    table: block.table ? { rows: block.table.rows.map((row) => row.map(removeExcludedTokens)) } : undefined,
                })),
                variables: sourceTemplate.editableContent.variables.filter((variable) => !excludedVariableKeys.has(variable.key)).map((variable) => ({
                    ...variable,
                    defaultValue: originalDoc.templatePreparation?.variableValues?.[variable.key] ?? variable.defaultValue ?? '',
                })),
            }
            : undefined;

        const preparedVersion = getLatestPreparedVersion(originalDoc.versions || []);
        const currentVersion =
            originalDoc.versions?.find((version: IVersionDoc) => version?.version === originalDoc.currentVersion) || null;
        const fallbackOriginal = originalDoc.versions?.find((version: IVersionDoc) => version?.label === 'original') || null;
        const sourceVersion = preparedVersion || currentVersion || fallbackOriginal || originalDoc.versions?.[0];
        if (!sourceVersion) {
            return NextResponse.json({ message: 'Original document version not found' }, { status: 400 });
        }

        const sourceStorage = resolveDocumentVersionStorage(sourceVersion.storage);
        if (!sourceStorage) {
            return NextResponse.json({
                message: 'The original document is not available in object storage. Please upload it again before saving it as a template.',
                code: 'DOCUMENT_ARTIFACT_UNAVAILABLE',
            }, { status: 422 });
        }

        // Document versions already live in S3/R2. Read the trusted current
        // version directly and write a new immutable template artifact; never
        // stage the copy in the application filesystem.
        const sourcePdf = await readTemplateStorageBuffer(sourceStorage);
        const actualFileSize = sourcePdf.length;
        if (actualFileSize > TEMPLATE_ARTIFACT_MAX_BYTES) {
            return NextResponse.json({
                message: 'The document is too large to save as a template. Templates must be 25 MB or smaller.',
                code: 'TEMPLATE_ARTIFACT_TOO_LARGE',
            }, { status: 413 });
        }
        const copiedPdf = await PDFDocument.load(sourcePdf);
        const actualPageCount = copiedPdf.getPageCount();
        if (actualPageCount < 1) {
            return NextResponse.json({ message: 'The original document PDF is invalid.' }, { status: 400 });
        }

        const templateSharingScope = existingTemplate
            ? normalizeTemplateSharingScope(existingTemplate.sharingScope)
            : requestedSharingScope;
        const layoutRevision = existingTemplate
            ? getTemplateLayoutState(existingTemplate).layoutRevision + 1
            : 1;
        const template = existingTemplate || new TemplateModel({
            _id: new mongoose.Types.ObjectId(),
            userId,
            orgId,
            sharingScope: requestedSharingScope,
            isSystemTemplate: false,
        });
        const previousPdfArtifact = getTemplatePdfArtifact(template);
        const previousSourceArtifact = isTemplateArtifact(template.artifacts?.source)
            ? template.artifacts.source
            : null;
        const pdfArtifact = await storeTemplateArtifact({
            templateId: String(template._id),
            orgId: String(template.orgId || orgId),
            kind: 'pdf',
            data: sourcePdf,
            contentType: 'application/pdf',
            extension: 'pdf',
            originalFileName: typeof sourceVersion.documentName === 'string'
                ? sourceVersion.documentName
                : undefined,
        });
        createdArtifacts = [pdfArtifact];

        Object.assign(template, {
            userId: existingTemplate ? existingTemplate.userId : userId,
            orgId: existingTemplate ? existingTemplate.orgId : orgId,
            sharingScope: templateSharingScope,
            name: templateName,
            description: templateDescription,
            category: templateCategory,
            isSystemTemplate: false,
            templateFileUrl: `/api/templates/${template._id}`,
            artifacts: { pdf: pdfArtifact, source: pdfArtifact },
            fields: sanitizeTemplateFields(fields ?? originalDoc.fields),
            fieldLayoutStatus: 'current',
            layoutRevision,
            fieldLayoutRevision: layoutRevision,
            defaultSigners:
                defaultSigners !== undefined
                    ? sanitizeTemplateDefaultSigners(defaultSigners)
                    : sanitizeTemplateDefaultSigners(originalDoc.recipients),
            // A non-editable source document must not leave stale rich content on an updated template.
            editableContent: reusableContent,
            pageCount: actualPageCount,
            fileSize: actualFileSize,
            tags: sanitizeTemplateTags(templateTags),
            isActive: true,
            deletedAt: null,
        });
        // A legacy local path must never survive a storage-native save.
        clearLegacyTemplateFilePath(template);
        await template.save();
        createdArtifacts = [];

        // Replacement is durable before obsolete artifacts are removed. This
        // preserves the old template if either the object write or DB save fails.
        const staleArtifacts = [previousPdfArtifact, previousSourceArtifact].filter(
            (artifact): artifact is TemplateArtifact => {
                if (!artifact || sameTemplateArtifact(artifact, pdfArtifact)) return false;
                // The document version can legitimately reference the same
                // immutable object as an older template. Never remove a
                // document-owned source object while replacing the template.
                return artifact.storage.provider !== sourceStorage.provider ||
                    artifact.storage.bucket !== sourceStorage.bucket ||
                    artifact.storage.region !== sourceStorage.region ||
                    artifact.storage.key !== sourceStorage.key;
            }
        );
        if (staleArtifacts.length > 0) {
            try {
                await deleteTemplateArtifacts(staleArtifacts);
            } catch (cleanupError) {
                console.warn('[CREATE TEMPLATE] Saved template but could not remove previous object artifacts:', cleanupError);
            }
        }

        return NextResponse.json({
            message: saveMode === 'update' ? 'Template updated successfully' : 'Template created successfully',
            action: saveMode,
            template: toClientTemplate(template),
        }, { status: saveMode === 'update' ? 200 : 201 });

    } catch (error) {
        if (createdArtifacts.length > 0) {
            try {
                await deleteTemplateArtifacts(createdArtifacts);
            } catch (cleanupError) {
                console.error('[CREATE TEMPLATE] Failed to remove template artifacts after an error:', cleanupError);
            }
        }
        console.error('[CREATE TEMPLATE] Failed to save template:', error);
        return NextResponse.json({
            message: 'Unable to save this template. Please try again.',
            code: 'TEMPLATE_SAVE_FAILED',
        }, { status: 500 });
    }
}, { requireCsrf: true, useSecurityHeaders: true });
