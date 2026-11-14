import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getApiKeyContext, getApiRateLimitResponse } from '@/lib/api-key';
import { buildSignedDocumentPdf } from '@/lib/signed-document-pdf';
import DocumentModel from '@/models/Document';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const apiKey = await getApiKeyContext(req);
    if (!apiKey) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
    const rateLimitResponse = getApiRateLimitResponse(apiKey);
    if (rateLimitResponse) return rateLimitResponse;
    if (!apiKey.scopes.includes('documents:read')) return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    const { documentId } = await params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return NextResponse.json({ error: 'invalid_document_id' }, { status: 400 });
    }
    await connectDB();
    const document = await DocumentModel.findOne({ _id: documentId, orgId: apiKey.orgId, deletedAt: null });
    if (!document) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!['signed', 'completed'].includes(document.status)) return NextResponse.json({ error: 'not_completed' }, { status: 409 });
    const pdf = await buildSignedDocumentPdf({ document, requesterUserId: String(document.userId) });
    return new Response(new Uint8Array(pdf.buffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pdf.fileName}"`, 'Content-Length': String(pdf.buffer.length) } });
  } catch {
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
