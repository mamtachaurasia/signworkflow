import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { unauthorizedResponse } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { buildSignedDocumentPdf } from '@/lib/signed-document-pdf';
import { canReadDocument, resolveDocumentReadScope } from '@/lib/document-access';
import DocumentModel from '@/models/Document';
import UserModel from '@/models/Users';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const documentId = req.nextUrl.searchParams.get('documentId');
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    await connectDB();

    const context = await getAuthContext(req);
    if (!context?.userId || !context.orgId) {
      return unauthorizedResponse({ error: 'Unauthorized' });
    }

    const document = await DocumentModel.findById(documentId);

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.deletedAt) {
      return NextResponse.json({ error: 'Document has been trashed.' }, { status: 410 });
    }

    const readScope = await resolveDocumentReadScope(context.userId, context.orgId, context.orgRole);
    const requester = mongoose.Types.ObjectId.isValid(context.userId)
      ? await UserModel.findById(context.userId)
          .select('email')
          .lean<{ email?: unknown } | null>()
      : null;
    const requesterEmail = typeof requester?.email === 'string' ? requester.email : null;
    const hasAccess = canReadDocument({
      userId: context.userId,
      orgId: context.orgId,
      orgRole: context.orgRole,
      documentUserId: String(document.userId),
      documentOrgId: document.orgId ? String(document.orgId) : null,
      documentTeamId: document.teamId ? String(document.teamId) : null,
      requesterEmail,
      sharedWith: document.sharedWith,
      accessibleTeamIds: readScope.accessibleTeamIds,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (document.status !== 'signed' && document.status !== 'completed') {
      return NextResponse.json(
        {
          error: 'Document is not completed yet',
          message: 'Signed copy will be available once all recipients complete signing.',
        },
        { status: 400 }
      );
    }

    const pdf = await buildSignedDocumentPdf({
      document,
      requesterUserId: context.userId,
    });

    return new Response(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.fileName}"`,
        'Content-Length': String(pdf.buffer.length),
      },
    });
  } catch (error) {
    console.error('Error generating signed document:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate signed document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
