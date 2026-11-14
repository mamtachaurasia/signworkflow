import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { PDFDocument } from 'pdf-lib';

import connectDB from '@/utils/db';
import Template from '@/models/Template';
import { canReadTemplate } from '@/lib/template-access';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import { sanitizeEditableTemplateContent } from '@/lib/template-content';
import { renderEditableTemplatePdf } from '@/lib/template-content-pdf';
import {
  sanitizeTemplateDefaultSigners,
  sanitizeTemplateFields,
  sanitizeTemplateTags,
} from '@/lib/template-persistence';
import { getTemplateLayoutState } from '@/lib/template-layout';
import { toClientTemplate } from '@/lib/template-response';
import {
  copyTemplateArtifact,
  deleteTemplateArtifacts,
  getTemplatePdfArtifact,
  isTemplateArtifact,
  sameTemplateArtifact,
  storeTemplateArtifact,
  TEMPLATE_ARTIFACT_MAX_BYTES,
  type TemplateArtifact,
  type TemplateArtifacts,
} from '@/lib/template-artifacts';

function extensionForArtifact(artifact: TemplateArtifact): string {
  if (artifact.contentType === 'application/msword') return 'doc';
  if (artifact.contentType.includes('openxmlformats-officedocument.wordprocessingml')) return 'docx';
  return 'pdf';
}

async function createDuplicateArtifacts(args: {
  template: {
    _id?: string;
    orgId?: unknown;
    artifacts?: Partial<TemplateArtifacts> | null;
    editableContent?: unknown;
    pageCount?: number;
  };
  targetTemplateId: string;
  targetOrgId: string;
}): Promise<{ artifacts: TemplateArtifacts; created: TemplateArtifact[]; pageCount?: number }> {
  const sourcePdf = getTemplatePdfArtifact(args.template);
  const sourceOriginal = isTemplateArtifact(args.template.artifacts?.source)
    ? args.template.artifacts.source
    : null;
  const created: TemplateArtifact[] = [];

  try {
    if (sourcePdf) {
      if (sourcePdf.size > TEMPLATE_ARTIFACT_MAX_BYTES) {
        throw new Error('TEMPLATE_SOURCE_TOO_LARGE');
      }
      const pdf = await copyTemplateArtifact({
        templateId: args.targetTemplateId,
        orgId: args.targetOrgId,
        kind: 'pdf',
        extension: 'pdf',
        source: sourcePdf,
      });
      created.push(pdf);
      let source = pdf;
      if (sourceOriginal && !sameTemplateArtifact(sourceOriginal, sourcePdf)) {
        if (sourceOriginal.size > TEMPLATE_ARTIFACT_MAX_BYTES) {
          throw new Error('TEMPLATE_SOURCE_TOO_LARGE');
        }
        source = await copyTemplateArtifact({
          templateId: args.targetTemplateId,
          orgId: args.targetOrgId,
          kind: 'source',
          extension: extensionForArtifact(sourceOriginal),
          source: sourceOriginal,
        });
        created.push(source);
      }
      return { artifacts: { pdf, source }, created, pageCount: args.template.pageCount };
    }

    // An editable template can recover from an old record that has not yet had
    // its PDF artifact migrated. This renders a new durable object without any
    // filesystem fallback.
    if (!args.template.editableContent) {
      throw new Error('TEMPLATE_SOURCE_UNAVAILABLE');
    }
    const editableContent = sanitizeEditableTemplateContent(args.template.editableContent);
    if (editableContent.blocks.length === 0) {
      throw new Error('TEMPLATE_SOURCE_UNAVAILABLE');
    }
    const renderedPdf = await renderEditableTemplatePdf(editableContent);
    if (renderedPdf.length > TEMPLATE_ARTIFACT_MAX_BYTES) {
      throw new Error('TEMPLATE_SOURCE_TOO_LARGE');
    }
    const pageCount = (await PDFDocument.load(renderedPdf)).getPageCount();
    const pdf = await storeTemplateArtifact({
      templateId: args.targetTemplateId,
      orgId: args.targetOrgId,
      kind: 'pdf',
      data: renderedPdf,
      contentType: 'application/pdf',
      extension: 'pdf',
    });
    created.push(pdf);
    return { artifacts: { pdf, source: pdf }, created, pageCount };
  } catch (error) {
    if (created.length > 0) {
      try {
        await deleteTemplateArtifacts(created);
      } catch (cleanupError) {
        console.error('[DUPLICATE TEMPLATE] Failed to remove partially copied object artifacts:', cleanupError);
      }
    }
    throw error;
  }
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
    const body = await req.json().catch(() => null);
    const templateId = body?.templateId;

    if (typeof templateId !== 'string' || !mongoose.Types.ObjectId.isValid(templateId)) {
      return NextResponse.json({ message: 'A valid template ID is required' }, { status: 400 });
    }

    const originalTemplate = await Template.findById(templateId);
    if (!originalTemplate) {
      return NextResponse.json({ message: 'Template not found' }, { status: 404 });
    }
    if (!canReadTemplate(originalTemplate, { userId, orgId, orgRole: authContext.orgRole })) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const newTemplateId = new mongoose.Types.ObjectId();
    const duplicated = await createDuplicateArtifacts({
      template: originalTemplate,
      targetTemplateId: String(newTemplateId),
      targetOrgId: String(orgId),
    });
    createdArtifacts = duplicated.created;

    const layoutState = getTemplateLayoutState(originalTemplate);
    const newTemplate = new Template({
      _id: newTemplateId,
      userId,
      orgId,
      sharingScope: 'private',
      name: `${originalTemplate.name} (Copy)`,
      description: originalTemplate.description,
      category: originalTemplate.category,
      jurisdiction: originalTemplate.jurisdiction,
      isSystemTemplate: false,
      templateFileUrl: `/api/templates/${newTemplateId}`,
      thumbnailUrl: originalTemplate.thumbnailUrl,
      artifacts: duplicated.artifacts,
      fields: sanitizeTemplateFields(originalTemplate.fields),
      defaultSigners: sanitizeTemplateDefaultSigners(originalTemplate.defaultSigners),
      editableContent: originalTemplate.editableContent
        ? sanitizeEditableTemplateContent(originalTemplate.editableContent)
        : undefined,
      ...layoutState,
      fileSize: duplicated.artifacts.pdf.size,
      pageCount: duplicated.pageCount || originalTemplate.pageCount,
      duplicateCount: 0,
      isActive: true,
      tags: sanitizeTemplateTags(originalTemplate.tags),
      deletedAt: null,
    });

    await newTemplate.save();
    createdArtifacts = [];

    return NextResponse.json({
      message: 'Template duplicated successfully',
      template: toClientTemplate(newTemplate),
    }, { status: 201 });
  } catch (error) {
    if (createdArtifacts.length > 0) {
      try {
        await deleteTemplateArtifacts(createdArtifacts);
      } catch (cleanupError) {
        console.error('[DUPLICATE TEMPLATE] Failed to remove unfinished object artifacts:', cleanupError);
      }
    }
    if (error instanceof Error && error.message === 'TEMPLATE_SOURCE_UNAVAILABLE') {
      return NextResponse.json({
        message: 'This template no longer has a source artifact available to copy.',
        code: 'TEMPLATE_SOURCE_UNAVAILABLE',
      }, { status: 422 });
    }
    if (error instanceof Error && error.message === 'TEMPLATE_SOURCE_TOO_LARGE') {
      return NextResponse.json({
        message: 'This template is too large to copy. Templates must be 25 MB or smaller.',
        code: 'TEMPLATE_SOURCE_TOO_LARGE',
      }, { status: 413 });
    }
    console.error('[DUPLICATE TEMPLATE] Failed to create template copy:', error);
    return NextResponse.json({
      message: 'Unable to create a template copy. Please try again.',
      code: 'TEMPLATE_DUPLICATION_FAILED',
    }, { status: 500 });
  }
}, { requireCsrf: true, useSecurityHeaders: true });
