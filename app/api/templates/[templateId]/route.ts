import { NextRequest, NextResponse } from 'next/server';
import { isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import TemplateModel from '@/models/Template';
import mongoose from 'mongoose';
import connectDB from '@/utils/db';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import {
  sanitizeTemplateDefaultSigners,
  sanitizeTemplateFields,
  sanitizeTemplateTags,
} from '@/lib/template-persistence';
import { isTemplateCategory } from '@/config/template-categories';
import {
  canManageTemplate,
  canReadTemplate,
  normalizeTemplateSharingScope,
} from '@/lib/template-access';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import { getTemplateLayoutState } from '@/lib/template-layout';
import {
  deleteTemplateArtifacts,
  getTemplateArtifactStream,
  getTemplatePdfArtifact,
  isTemplateArtifact,
} from '@/lib/template-artifacts';

type RouteContext = {
  params: Promise<{ templateId: string }>
}

function pdfFilename(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  const safe = name.replace(/[\r\n"\\]/g, '').slice(0, 180) || 'template';
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await connectDB();
    const contextAuth = await getAuthContext(req);
    const userId = contextAuth?.userId;
    const orgId = contextAuth?.orgId;
    const orgRole = contextAuth?.orgRole;
    const { templateId: paramTemplateId } = await context.params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format'); // Check if JSON format is requested

    if (!paramTemplateId || !mongoose.Types.ObjectId.isValid(paramTemplateId)) {
      return NextResponse.json({ message: 'Invalid template ID' }, { status: 400 });
    }

    const template = await TemplateModel.findById(paramTemplateId);

    if (!template) {
      return NextResponse.json({ message: 'Template not found' }, { status: 404 });
    }

    // Authorization: User must be the owner of a non-system template
    // System templates can be accessed by anyone (already duplicated to user's own editable version)
    if (!canReadTemplate(template, { userId, orgId, orgRole })) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // If JSON format is requested, return template data as JSON
    if (format === 'json' || req.headers.get('accept')?.includes('application/json')) {
      const layoutState = getTemplateLayoutState(template);
      return NextResponse.json({
        success: true,
        template: {
          _id: template._id,
          templateId: template._id,
          name: template.name,
          description: template.description,
          category: template.category,
          jurisdiction: template.jurisdiction || 'International',
          isSystemTemplate: template.isSystemTemplate,
          templateFileUrl: template.templateFileUrl,
          thumbnailUrl: template.thumbnailUrl,
          pageCount: template.pageCount,
          tags: template.tags,
          createdAt: template.createdAt,
          duplicateCount: template.duplicateCount,
          fields: template.fields,
          defaultSigners: template.defaultSigners,
          sharingScope: template.sharingScope || 'private',
          ...layoutState,
        },
      });
    }

    // Never proxy through a local path (or a recursive internal HTTP request).
    // The object reference is deliberately opaque to clients.
    const pdfArtifact = getTemplatePdfArtifact(template);
    if (!pdfArtifact) {
      return NextResponse.json({ message: 'Template artifact is unavailable. Please contact support.' }, { status: 404 });
    }

    try {
      const stream = await getTemplateArtifactStream(pdfArtifact);
      return new NextResponse(stream as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': pdfArtifact.contentType || 'application/pdf',
          'Content-Length': String(pdfArtifact.size),
          'Content-Disposition': `inline; filename="${pdfFilename(template.name)}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        return NextResponse.json({ message: 'Template artifact is unavailable. Please contact support.' }, { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    console.error('API Error in GET', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
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
    await connectDB();
    const contextAuth = await getAuthContext(req);
    if (!contextAuth?.userId || !contextAuth.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = contextAuth.userId;
    const orgId = contextAuth.orgId;

    const { templateId: paramTemplateId } = await context.params;

    if (!paramTemplateId || !mongoose.Types.ObjectId.isValid(paramTemplateId)) {
      return NextResponse.json({ message: 'Invalid template ID' }, { status: 400 });
    }

    const template = await TemplateModel.findById(paramTemplateId);

    if (!template) {
      return NextResponse.json({ message: 'Template not found' }, { status: 404 });
    }

    // Authorization: User must be the owner of the template, and it cannot be a system template
    if (template.isSystemTemplate) {
      return NextResponse.json({ message: 'Cannot delete system templates' }, { status: 403 });
    }

    if (!canManageTemplate(template, { userId, orgId, orgRole: contextAuth.orgRole })) {
      return NextResponse.json({ message: 'Forbidden: You can only delete templates you manage' }, { status: 403 });
    }

    const deleteResult = await TemplateModel.deleteOne({ _id: paramTemplateId, isSystemTemplate: false });
    if (!deleteResult.deletedCount) {
      return NextResponse.json({ message: 'Template not found or already deleted' }, { status: 404 });
    }

    // Match the previous best-effort cleanup behavior without making the
    // database operation depend on an object-store transient. Objects are
    // immutable and refs may share the same PDF/source key, so the helper
    // deduplicates before deleting.
    const artifacts = [
      getTemplatePdfArtifact(template),
      isTemplateArtifact(template.artifacts?.source) ? template.artifacts.source : null,
    ];
    try {
      await deleteTemplateArtifacts(artifacts);
    } catch (cleanupError) {
      console.error(`[DELETE TEMPLATE] Template ${paramTemplateId} was deleted but object cleanup failed:`, cleanupError);
    }

    console.log(`[DELETE TEMPLATE] Successfully deleted template ${paramTemplateId}`);

    return NextResponse.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('[DELETE TEMPLATE] API Error in DELETE', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

export const PUT = withTrialWriteAccessFromAuthContext(async function PUT(
  req: NextRequest,
  context: RouteContext,
  authContext
) {
  try {
    await connectDB();
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = authContext.userId;
    const orgId = authContext.orgId;

    const { templateId: paramTemplateId } = await context.params;
    if (!paramTemplateId || !mongoose.Types.ObjectId.isValid(paramTemplateId)) {
      return NextResponse.json({ message: 'Invalid template ID' }, { status: 400 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const template = await TemplateModel.findById(paramTemplateId);
    if (!template) {
      return NextResponse.json({ message: 'Template not found' }, { status: 404 });
    }
    if (template.isSystemTemplate) {
      return NextResponse.json({ message: 'Cannot edit system templates. Duplicate first.' }, { status: 403 });
    }
    if (!canManageTemplate(template, { userId, orgId, orgRole: authContext.orgRole })) {
      return NextResponse.json({ message: 'Forbidden: You can only edit templates you manage' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        return NextResponse.json({ message: 'Template name is required' }, { status: 400 });
      }
      if (name.length > 200) {
        return NextResponse.json({ message: 'Template name must be 200 characters or fewer' }, { status: 400 });
      }
      updates.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
      updates.description = typeof payload.description === 'string' ? payload.description.trim() : '';
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'category')) {
      const category = typeof payload.category === 'string' ? payload.category : '';
      if (!isTemplateCategory(category)) {
        return NextResponse.json({ message: 'Invalid template category' }, { status: 400 });
      }
      updates.category = category;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'tags')) {
      updates.tags = sanitizeTemplateTags(payload.tags);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'fields')) {
      updates.fields = sanitizeTemplateFields(payload.fields);
      const layoutState = getTemplateLayoutState(template);
      updates.fieldLayoutStatus = 'current';
      updates.layoutRevision = layoutState.layoutRevision;
      updates.fieldLayoutRevision = layoutState.layoutRevision;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'defaultSigners')) {
      updates.defaultSigners = sanitizeTemplateDefaultSigners(payload.defaultSigners);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'sharingScope')) {
      const sharingScope = normalizeTemplateSharingScope(payload.sharingScope);
      if (sharingScope === 'workspace') {
        const sharingGuard = await getPlanGateForOrgFeature({
          orgId,
          feature: 'template_collaboration',
        });
        if (!sharingGuard.allowed) {
          return NextResponse.json({ message: sharingGuard.message }, { status: sharingGuard.status });
        }
      }
      updates.sharingScope = sharingScope;
    }

    Object.assign(template, updates);
    await template.save();
    const layoutState = getTemplateLayoutState(template);

    return NextResponse.json({
      success: true,
      template: {
        _id: template._id,
        templateId: template._id,
        name: template.name,
        description: template.description,
        category: template.category,
        jurisdiction: template.jurisdiction || 'International',
        isSystemTemplate: template.isSystemTemplate,
        templateFileUrl: template.templateFileUrl,
        thumbnailUrl: template.thumbnailUrl,
        pageCount: template.pageCount,
        tags: template.tags,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        duplicateCount: template.duplicateCount,
        fields: template.fields,
        defaultSigners: template.defaultSigners,
        sharingScope: template.sharingScope || 'private',
        ...layoutState,
      },
    });
  } catch (error) {
    console.error('[UPDATE TEMPLATE] API Error in PUT', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}, { requireCsrf: true, useSecurityHeaders: true });
