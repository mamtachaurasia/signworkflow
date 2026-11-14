import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { PDFDocument } from 'pdf-lib';

import { isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { canManageTemplate } from '@/lib/template-access';
import { sanitizeEditableTemplateContent } from '@/lib/template-content';
import { renderEditableTemplatePdf } from '@/lib/template-content-pdf';
import TemplateModel from '@/models/Template';
import connectDB from '@/utils/db';
import { sanitizeTemplateDefaultSigners } from '@/lib/template-persistence';
import { getTemplateLayoutState } from '@/lib/template-layout';
import { toClientTemplate } from '@/lib/template-response';
import {
  clearLegacyTemplateFilePath,
  deleteTemplateArtifacts,
  getTemplatePdfArtifact,
  isTemplateArtifact,
  sameTemplateArtifact,
  storeTemplateArtifact,
  type TemplateArtifact,
} from '@/lib/template-artifacts';

type RouteContext = { params: Promise<{ templateId: string }> };

async function getManagedTemplate(req: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(req);
  if (!auth?.userId || !auth.orgId) return { error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) };
  const { templateId } = await context.params;
  if (!mongoose.Types.ObjectId.isValid(templateId)) return { error: NextResponse.json({ message: 'Invalid template ID' }, { status: 400 }) };
  await connectDB();
  const template = await TemplateModel.findById(templateId);
  if (!template) return { error: NextResponse.json({ message: 'Template not found' }, { status: 404 }) };
  if (!canManageTemplate(template, auth)) return { error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }) };
  return { auth, template };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const result = await getManagedTemplate(req, context);
  if ('error' in result) return result.error;
  const layoutState = getTemplateLayoutState(result.template);
  return NextResponse.json({
    success: true,
    template: {
      _id: result.template._id,
      name: result.template.name,
      editableContent: result.template.editableContent || null,
      defaultSigners: result.template.defaultSigners || [],
      ...layoutState,
    },
  });
}

export async function PUT(req: NextRequest, context: RouteContext) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for this action.' }, { status: 400 })
    );
  }
  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed', reason: 'csrf_mismatch' }, { status: 403 })
    );
  }
  const result = await getManagedTemplate(req, context);
  if ('error' in result) return result.error;
  let createdPdfArtifact: TemplateArtifact | null = null;

  try {
    const payload = await req.json().catch(() => null);
    const content = sanitizeEditableTemplateContent(payload?.editableContent);
    if (content.blocks.length === 0) {
      return NextResponse.json({ message: 'Template content cannot be empty' }, { status: 400 });
    }

    const previousContent = result.template.editableContent
      ? sanitizeEditableTemplateContent(result.template.editableContent)
      : null;
    const contentChanged = !previousContent || JSON.stringify(previousContent) !== JSON.stringify(content);
    const previousLayoutState = getTemplateLayoutState(result.template);
    const previousPdfArtifact = getTemplatePdfArtifact(result.template);
    const previousSourceArtifact = isTemplateArtifact(result.template.artifacts?.source)
      ? result.template.artifacts.source
      : null;

    const pdf = await renderEditableTemplatePdf(content);
    const pdfArtifact = await storeTemplateArtifact({
      templateId: String(result.template._id),
      orgId: String(result.template.orgId || result.auth.orgId),
      kind: 'pdf',
      data: pdf,
      contentType: 'application/pdf',
      extension: 'pdf',
    });
    createdPdfArtifact = pdfArtifact;
    const sourceArtifact = previousSourceArtifact || pdfArtifact;

    result.template.editableContent = content;
    if (typeof payload?.name === 'string' && payload.name.trim()) {
      result.template.name = payload.name.trim().slice(0, 200);
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'defaultSigners')) {
      result.template.defaultSigners = sanitizeTemplateDefaultSigners(payload?.defaultSigners);
    }
    result.template.artifacts = { pdf: pdfArtifact, source: sourceArtifact };
    // This route is also a migration path for editable templates that predate
    // object storage. Do not leave a stale local-path reference behind.
    clearLegacyTemplateFilePath(result.template);
    result.template.fileSize = pdfArtifact.size;
    result.template.pageCount = (await PDFDocument.load(pdf)).getPageCount();
    result.template.templateFileUrl = `/api/templates/${result.template._id}`;
    if (contentChanged) {
      const nextLayoutRevision = previousLayoutState.layoutRevision + 1;
      result.template.layoutRevision = nextLayoutRevision;
      if (Array.isArray(result.template.fields) && result.template.fields.length > 0) {
        // Content reflow can move every overlay. Preserve the user's work, but do
        // not allow the template to be used until those coordinates are reviewed.
        result.template.fieldLayoutStatus = 'needs_review';
        result.template.fieldLayoutRevision = previousLayoutState.fieldLayoutRevision;
      } else {
        result.template.fieldLayoutStatus = 'current';
        result.template.fieldLayoutRevision = nextLayoutRevision;
      }
    } else {
      Object.assign(result.template, previousLayoutState);
    }
    await result.template.save();
    createdPdfArtifact = null;

    // Old PDF bytes are removed only after Mongo points at the new immutable
    // object. Keep the original source artifact when it intentionally shares
    // the old PDF object.
    if (
      previousPdfArtifact &&
      !sameTemplateArtifact(previousPdfArtifact, pdfArtifact) &&
      !sameTemplateArtifact(previousPdfArtifact, sourceArtifact)
    ) {
      try {
        await deleteTemplateArtifacts([previousPdfArtifact]);
      } catch (cleanupError) {
        console.error('[TEMPLATE CONTENT] Saved content but could not remove previous PDF artifact:', cleanupError);
      }
    }

    return NextResponse.json({ success: true, template: toClientTemplate(result.template) });
  } catch (error) {
    if (createdPdfArtifact) {
      try {
        await deleteTemplateArtifacts([createdPdfArtifact]);
      } catch (cleanupError) {
        console.error('[TEMPLATE CONTENT] Failed to remove unfinished PDF artifact:', cleanupError);
      }
    }
    console.error('[TEMPLATE CONTENT] Failed to save editable template content:', error);
    return NextResponse.json({ message: 'Unable to save template content. Please try again.' }, { status: 500 });
  }
}
