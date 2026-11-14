import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

import { getApiKeyContext, getApiRateLimitResponse } from '@/lib/api-key';
import { sanitizeRecipients } from '@/lib/recipient-sanitizer';
import DocumentModel from '@/models/Document';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const apiKey = await getApiKeyContext(req);
    if (!apiKey) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
    const rateLimitResponse = getApiRateLimitResponse(apiKey);
    if (rateLimitResponse) return rateLimitResponse;
    if (!apiKey.scopes.includes('documents:read')) {
      return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    }

    const { documentId } = await params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return NextResponse.json({ error: 'invalid_document_id' }, { status: 400 });
    }
    await connectDB();
    const document = (await DocumentModel.findOne({
      _id: documentId,
      orgId: apiKey.orgId,
      deletedAt: null,
    })
      .select('_id documentName originalFileName status signingMode recipients createdAt updatedAt completedAt finalizedAt currentVersion')
      .lean()) as unknown as Record<string, unknown> | null;

    if (!document) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { _id, recipients, ...payload } = document;
    return NextResponse.json({
      data: { ...payload, recipients: sanitizeRecipients(Array.isArray(recipients) ? recipients : []), id: String(_id) },
    });
  } catch {
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
