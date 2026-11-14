import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/utils/db';
import TemplateModel from '@/models/Template';
import mongoose from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import { normalizeTemplateSharingScope } from '@/lib/template-access';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import { isTemplateCategory } from '@/config/template-categories';
import { sanitizeTemplateTags } from '@/lib/template-persistence';
import { convertOfficeDocumentToPdf } from '@/lib/document-conversion';
import {
  getUploadSourceType,
  shouldConvertToPdf,
  validatePdfUploadBuffer,
  validatePdfUploadMetadata,
} from '@/lib/pdf-upload-validation';
import { validateOfficeUploadBuffer } from '@/lib/office-upload-validation.server';
import { toClientTemplate } from '@/lib/template-response';
import {
  deleteTemplateArtifacts,
  storeTemplateArtifact,
  type TemplateArtifact,
} from '@/lib/template-artifacts';

export const runtime = 'nodejs';

const MAX_TEMPLATE_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TEMPLATE_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const MAX_TEMPLATE_REQUEST_BYTES =
  MAX_TEMPLATE_UPLOAD_BYTES + MAX_TEMPLATE_MULTIPART_OVERHEAD_BYTES;
const TEMPLATE_FILE_TYPE_ERROR =
  'Only PDF, DOC, or DOCX files can be uploaded as templates.';
const WORD_CONVERSION_ERROR_MESSAGE =
  'Word document conversion is temporarily unavailable. Please try again later or upload a PDF.';
const WORD_CONVERSION_ERROR_CODE = 'TEMPLATE_WORD_CONVERSION_FAILED';

function getSourceContentType(sourceType: 'pdf' | 'doc' | 'docx'): string {
  if (sourceType === 'doc') return 'application/msword';
  if (sourceType === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/pdf';
}

export const POST = withTrialWriteAccessFromAuthContext(async function POST(req: NextRequest, _context, authContext) {
  let createdArtifacts: TemplateArtifact[] = [];

  try {
    await connectDB();
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = authContext.userId;

    // Reject the common oversized multipart path before Next parses/buffers it.
    // The gateway/runtime must also enforce a body limit for chunked requests,
    // which intentionally have no trustworthy Content-Length header.
    const contentLengthValue = req.headers.get('content-length');
    const contentLength = contentLengthValue && /^\d+$/.test(contentLengthValue)
      ? Number(contentLengthValue)
      : null;
    if (contentLength !== null && contentLength > MAX_TEMPLATE_REQUEST_BYTES) {
      return NextResponse.json({ message: 'File must be 25 MB or smaller' }, { status: 413 });
    }

    const formData = await req.formData();
    const fileEntry = formData.get('file');
    const file = fileEntry && typeof fileEntry !== 'string' ? fileEntry : null;
    const rawName = formData.get('name');
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const rawDescription = formData.get('description');
    const description = typeof rawDescription === 'string' ? rawDescription.trim().slice(0, 2_000) : '';
    const rawCategory = formData.get('category');
    const category = typeof rawCategory === 'string' ? rawCategory.trim() : '';
    const rawTags = formData.get('tags');
    const tags = typeof rawTags === 'string' ? rawTags : '';
    const sharingScope = normalizeTemplateSharingScope(formData.get('sharingScope'));

    // Validate required fields
    if (!file) {
      return NextResponse.json({ message: 'File is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ message: 'Template name is required' }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json({ message: 'Template name must be 200 characters or fewer' }, { status: 400 });
    }

    if (!category) {
      return NextResponse.json({ message: 'Category is required' }, { status: 400 });
    }
    if (!isTemplateCategory(category)) {
      return NextResponse.json({ message: 'Invalid template category' }, { status: 400 });
    }

    const metadataError = validatePdfUploadMetadata(file);
    const sourceType = getUploadSourceType(file.name);
    if (metadataError || !sourceType) {
      return NextResponse.json({ message: TEMPLATE_FILE_TYPE_ERROR }, { status: 400 });
    }
    if (file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
      return NextResponse.json({ message: 'File must be 25 MB or smaller' }, { status: 413 });
    }

    if (sharingScope === 'workspace') {
      const sharingGuard = await getPlanGateForOrgFeature({
        orgId: authContext.orgId,
        feature: 'template_collaboration',
      });
      if (!sharingGuard.allowed) {
        return NextResponse.json({ message: sharingGuard.message }, { status: sharingGuard.status });
      }
    }

    const uploadedBuffer = Buffer.from(await file.arrayBuffer());

    if (uploadedBuffer.length === 0) {
      return NextResponse.json({ message: 'File is empty' }, { status: 400 });
    }
    if (uploadedBuffer.length > MAX_TEMPLATE_UPLOAD_BYTES) {
      return NextResponse.json({ message: 'File must be 25 MB or smaller' }, { status: 413 });
    }

    const bufferError = validateOfficeUploadBuffer(uploadedBuffer, sourceType);
    if (bufferError) {
      return NextResponse.json({
        message: sourceType === 'pdf'
          ? 'The uploaded file is not a valid PDF'
          : TEMPLATE_FILE_TYPE_ERROR,
      }, { status: 400 });
    }

    let pdfBuffer: Buffer = uploadedBuffer;
    if (shouldConvertToPdf(sourceType)) {
      try {
        pdfBuffer = await convertOfficeDocumentToPdf({
          inputBuffer: uploadedBuffer,
          originalFileName: file.name,
        });
      } catch (error) {
        // Converter errors can include provider responses, local binary paths, or
        // temporary-file locations. Keep those details server-side and expose a
        // stable, actionable response to the client.
        console.error('Template Word document conversion failed:', error);
        return NextResponse.json({
          message: WORD_CONVERSION_ERROR_MESSAGE,
          code: WORD_CONVERSION_ERROR_CODE,
        }, { status: 422 });
      }
    }

    if (pdfBuffer.length === 0) {
      return NextResponse.json({ message: 'Converted file is empty' }, { status: 400 });
    }
    if (pdfBuffer.length > MAX_TEMPLATE_UPLOAD_BYTES) {
      return NextResponse.json({ message: 'Converted PDF must be 25 MB or smaller' }, { status: 413 });
    }
    if (validatePdfUploadBuffer(pdfBuffer, 'pdf')) {
      return NextResponse.json({ message: 'The converted document is not a valid PDF' }, { status: 400 });
    }

    let pageCount: number;
    try {
      pageCount = (await PDFDocument.load(pdfBuffer)).getPageCount();
    } catch {
      return NextResponse.json({
        message: sourceType === 'pdf'
          ? 'The uploaded file is not a valid PDF'
          : 'The converted document is not a valid PDF',
      }, { status: 400 });
    }
    if (pageCount < 1) {
      return NextResponse.json({ message: 'PDF must contain at least one page' }, { status: 400 });
    }

    const parsedTags = sanitizeTemplateTags(tags ? tags.split(',') : []);
    const templateId = new mongoose.Types.ObjectId();
    const artifactOwner = {
      templateId: String(templateId),
      orgId: String(authContext.orgId),
    };
    const pdfArtifact = await storeTemplateArtifact({
      ...artifactOwner,
      kind: 'pdf',
      data: pdfBuffer,
      contentType: 'application/pdf',
      extension: 'pdf',
      originalFileName: sourceType === 'pdf' ? file.name : undefined,
    });
    createdArtifacts = [pdfArtifact];
    const sourceArtifact = sourceType === 'pdf'
      ? pdfArtifact
      : await storeTemplateArtifact({
          ...artifactOwner,
          kind: 'source',
          data: uploadedBuffer,
          contentType: getSourceContentType(sourceType),
          extension: sourceType,
          originalFileName: file.name,
        });
    if (sourceArtifact !== pdfArtifact) createdArtifacts.push(sourceArtifact);

    const newTemplate = new TemplateModel({
      _id: templateId,
      userId,
      orgId: authContext.orgId,
      sharingScope,
      name,
      description,
      category,
      isSystemTemplate: false,
      templateFileUrl: `/api/templates/${templateId}`,
      artifacts: {
        pdf: pdfArtifact,
        source: sourceArtifact,
      },
      fields: [],
      defaultSigners: [],
      fieldLayoutStatus: 'current',
      layoutRevision: 1,
      fieldLayoutRevision: 1,
      pageCount,
      fileSize: pdfArtifact.size,
      tags: parsedTags,
      isActive: true,
    });

    await newTemplate.save();
    createdArtifacts = [];

    return NextResponse.json(
      {
        message: 'Template uploaded successfully',
        template: toClientTemplate(newTemplate),
      },
      { status: 201 }
    );
  } catch (error) {
    if (createdArtifacts.length > 0) {
      try {
        await deleteTemplateArtifacts(createdArtifacts);
      } catch (cleanupError) {
        console.error('Error removing failed template artifacts:', cleanupError);
      }
    }
    console.error('Error uploading template:', error);
    return NextResponse.json(
      {
        message: 'An internal server error occurred',
        code: 'TEMPLATE_UPLOAD_FAILED',
      },
      { status: 500 }
    );
  }
}, { requireCsrf: true, useSecurityHeaders: true });
