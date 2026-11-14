import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { sanitizeEditableTemplateContent } from '@/lib/template-content';
import { renderEditableTemplatePdf } from '@/lib/template-content-pdf';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import TemplateModel from '@/models/Template';
import connectDB from '@/utils/db';
import { toClientTemplate } from '@/lib/template-response';
import {
  deleteTemplateArtifacts,
  storeTemplateArtifact,
  type TemplateArtifact,
} from '@/lib/template-artifacts';

export const POST = withTrialWriteAccessFromAuthContext(async function POST(
  req: NextRequest,
  _context,
  authContext
) {
  let createdArtifacts: TemplateArtifact[] = [];

  try {
    await connectDB();
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const requestedName = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const name = requestedName.slice(0, 200) || 'Untitled template';
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
    const templateId = new mongoose.Types.ObjectId();
    const pdfArtifact = await storeTemplateArtifact({
      templateId: String(templateId),
      orgId: String(authContext.orgId),
      kind: 'pdf',
      data: pdf,
      contentType: 'application/pdf',
      extension: 'pdf',
    });
    createdArtifacts = [pdfArtifact];

    const template = new TemplateModel({
      _id: templateId,
      userId: authContext.userId,
      orgId: authContext.orgId,
      sharingScope: 'private',
      name,
      description: '',
      category: 'Other',
      jurisdiction: 'International',
      isSystemTemplate: false,
      templateFileUrl: `/api/templates/${templateId}`,
      artifacts: { pdf: pdfArtifact, source: pdfArtifact },
      fields: [],
      defaultSigners: [],
      editableContent,
      fieldLayoutStatus: 'current',
      layoutRevision: 1,
      fieldLayoutRevision: 1,
      fileSize: pdfArtifact.size,
      pageCount: 1,
      duplicateCount: 0,
      isActive: true,
      tags: [],
      deletedAt: null,
    });

    await template.save();
    createdArtifacts = [];

    return NextResponse.json({ success: true, template: toClientTemplate(template) }, { status: 201 });
  } catch (error) {
    if (createdArtifacts.length > 0) {
      try {
        await deleteTemplateArtifacts(createdArtifacts);
      } catch (cleanupError) {
        console.error('[SCRATCH TEMPLATE] Failed to remove the unfinished template artifact:', cleanupError);
      }
    }
    console.error('[SCRATCH TEMPLATE] Failed to create template:', error);
    return NextResponse.json({
      message: 'Unable to create a blank template. Please try again.',
      code: 'TEMPLATE_SCRATCH_CREATE_FAILED',
    }, { status: 500 });
  }
}, { requireCsrf: true, useSecurityHeaders: true });
