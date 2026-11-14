import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-context';
import TemplateModel from '@/models/Template';
import mongoose from 'mongoose';
import { normalizeTemplateDefaultSigners } from '@/lib/template-signers';
import connectDB from '@/utils/db';
import { canReadTemplate } from '@/lib/template-access';
import { getTemplateLayoutState } from '@/lib/template-layout';

// GET - Load a template with its fields
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const context = await getAuthContext(req);
    const userId = context?.userId;
    const orgId = context?.orgId;
    const orgRole = context?.orgRole;
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get('id');
    if (!templateId) {
      return NextResponse.json({ message: 'Template ID missing' }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return NextResponse.json({ message: 'Template not found by ID' }, { status: 404 });
    }

    const template = await TemplateModel.findById(templateId);

    if (!template) {
      return NextResponse.json({ message: 'Template not found by ID' }, { status: 404 });
    }

    if (!canReadTemplate(template, { userId, orgId, orgRole })) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    
    // For now, templates don't have versions like documents.
    // We assume fields are directly on the template object.
    const fields = template.fields || [];
    const defaultSigners = normalizeTemplateDefaultSigners(
      template.defaultSigners || [],
      fields,
      template._id.toString()
    );

    const responseTemplate = {
      _id: template._id,
      templateId: template._id, // Add templateId for consistency
      name: template.name,
      fields: fields,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      isSystemTemplate: template.isSystemTemplate,
      jurisdiction: template.jurisdiction || 'International',
      sharingScope: template.sharingScope || 'private',
      userId: template.userId,
      orgId: template.orgId,
      category: template.category,
      description: template.description,
      defaultSigners,
      pageCount: template.pageCount,
      fileSize: template.fileSize,
      tags: template.tags,
      editableContent: template.editableContent || null,
      templateFileUrl: template.templateFileUrl,
      thumbnailUrl: template.thumbnailUrl,
      ...getTemplateLayoutState(template),
    };

    return NextResponse.json({ success: true, template: responseTemplate });
  } catch (error) {
    console.error('API Error in GET', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
