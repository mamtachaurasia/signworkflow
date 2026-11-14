import { NextRequest, NextResponse } from 'next/server';

import { createDocumentFromTemplateRecord } from '@/lib/template-documents';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import TemplateModel, { type ITemplate } from '@/models/Template';
import connectDB from '@/utils/db';

const SAMPLE_TEMPLATE_TAG = 'curated-slug:professional-mutual-nda';

/**
 * A predictable demo is more useful than choosing a random template. The
 * curated Mutual NDA always has two signing roles and the matching fields.
 */
export const POST = withTrialWriteAccessFromAuthContext(async function POST(
  _req: NextRequest,
  _context,
  authContext
) {
  if (!authContext?.userId || authContext.userId.startsWith('guest_')) {
    return NextResponse.json({ message: 'Please sign in to create a sample contract.' }, { status: 401 });
  }

  try {
    await connectDB();
    const template = await TemplateModel.findOne({
      isSystemTemplate: true,
      isActive: { $ne: false },
      deletedAt: null,
      tags: SAMPLE_TEMPLATE_TAG,
    }).lean<ITemplate | null>();

    if (!template || !Array.isArray(template.fields) || template.fields.length === 0) {
      return NextResponse.json({
        message: 'The sample contract is not ready yet. Please try again shortly.',
        code: 'SAMPLE_TEMPLATE_UNAVAILABLE',
      }, { status: 503 });
    }

    const result = await createDocumentFromTemplateRecord({
      template,
      ownerId: authContext.userId,
      orgId: authContext.orgId,
      documentName: 'Sample Mutual NDA',
      // Keep the prepared system-template PDF intact. Its variable panel stays
      // available in the Builder, while fields are immediately visible.
      deferPreparation: true,
    });

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      sessionId: result.sessionId,
      documentName: 'Sample Mutual NDA',
      fields: result.fields,
      recipients: result.recipients,
    }, { status: 201 });
  } catch (error) {
    console.error('[SAMPLE DOCUMENT] Failed to create demo contract:', error);
    return NextResponse.json({
      message: 'Unable to create a sample contract. Please try again.',
      code: 'SAMPLE_DOCUMENT_CREATE_FAILED',
    }, { status: 500 });
  }
}, { requireCsrf: true, useSecurityHeaders: true });
