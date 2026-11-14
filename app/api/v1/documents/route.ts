import { NextRequest, NextResponse } from 'next/server';
import { documentIntegrationUpdate } from '@/lib/integration-outbox-event';

import { getApiKeyContext, getApiRateLimitResponse } from '@/lib/api-key';
import DocumentModel from '@/models/Document';
import mongoose from 'mongoose';
import { z } from 'zod';
import { sha256Buffer } from '@/lib/hash';
import { deleteObject, getRegion, getStorageBucketName, getStorageProvider, putObjectStream, type StorageProvider } from '@/lib/s3';
import { writeAuditEvent } from '@/lib/audit';
import { getTrialWriteAccessDeniedResponse } from '@/lib/trial-access';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contentBase64: z.string().min(32).max(40_000_000),
}).strict();

export async function GET(req: NextRequest) {
  try {
    const apiKey = await getApiKeyContext(req);
    if (!apiKey) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
    const rateLimitResponse = getApiRateLimitResponse(apiKey);
    if (rateLimitResponse) return rateLimitResponse;
    if (!apiKey.scopes.includes('documents:read')) {
      return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    }

    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || '25')));
    if (!Number.isInteger(page) || !Number.isInteger(limit)) {
      return NextResponse.json({ error: 'invalid_pagination' }, { status: 400 });
    }

    const query = { orgId: apiKey.orgId, deletedAt: null };
    const [items, total] = await Promise.all([
      DocumentModel.find(query)
        .select('_id documentName status createdAt updatedAt completedAt finalizedAt')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DocumentModel.countDocuments(query),
    ]);

    return NextResponse.json({
      data: items.map((item) => {
        const { _id, ...document } = item;
        return { ...document, name: document.documentName, id: String(_id) };
      }),
      pagination: { page, limit, total, hasMore: page * limit < total },
    });
  } catch {
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  let uploadedObject: { provider: StorageProvider; bucket: string; key: string } | null = null;
  try {
    const apiKey = await getApiKeyContext(req);
    if (!apiKey) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
    const rateLimitResponse = getApiRateLimitResponse(apiKey);
    if (rateLimitResponse) return rateLimitResponse;
    if (!apiKey.scopes.includes('documents:write')) return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    const trialDenied = await getTrialWriteAccessDeniedResponse({ orgId: apiKey.orgId });
    if (trialDenied) return trialDenied;
    const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const encoded = parsed.data.contentBase64.replace(/^data:application\/pdf;base64,/, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
      return NextResponse.json({ error: 'invalid_base64' }, { status: 400 });
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024 || buffer.subarray(0, 4).toString() !== '%PDF') {
      return NextResponse.json({ error: 'invalid_pdf' }, { status: 400 });
    }
    await connectDB();
    const provider = getStorageProvider();
    const bucket = getStorageBucketName(provider);
    if (!bucket) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
    const id = new mongoose.Types.ObjectId();
    const now = new Date();
    const key = `documents/api/${apiKey.orgId}/${id}/original.pdf`;
    const hash = await sha256Buffer(buffer);
    await putObjectStream({ provider, bucket, key, body: buffer, contentType: 'application/pdf', contentLength: buffer.length });
    uploadedObject = { provider, bucket, key };
    const document = await DocumentModel.create({
      _id: id, orgId: apiKey.orgId, userId: apiKey.userId, documentName: parsed.data.name,
      originalFileName: parsed.data.name.endsWith('.pdf') ? parsed.data.name : `${parsed.data.name}.pdf`,
      currentVersion: 0, status: 'draft', recipients: [], signingEvents: [], isTemplate: false,
      versions: [{ version: 0, label: 'original', storage: { provider, bucket, region: getRegion(provider), key, url: `${provider}://${bucket}/${key}` }, hash, hashAlgo: 'SHA-256', size: buffer.length, mimeType: 'application/pdf', locked: false, status: 'draft', createdAt: now, updatedAt: now }],
      createdAt: now, updatedAt: now,
      ...documentIntegrationUpdate({ event: 'document_created', documentId: id, orgId: apiKey.orgId, metadata: { source: 'api' }, createdAt: now }),
    });
    uploadedObject = null;
    try {
      await writeAuditEvent({ orgId: apiKey.orgId, userId: String(document.userId), actor: String(document.userId), documentId: document._id, action: 'document_created', metadata: { source: 'api' } });
    } catch (auditError) {
      console.error('[API DOCUMENT CREATE] Failed to record audit event:', auditError);
    }
    return NextResponse.json({ data: { id: String(document._id), name: document.documentName, status: document.status } }, { status: 201 });
  } catch {
    if (uploadedObject) {
      try {
        await deleteObject(uploadedObject);
      } catch (cleanupError) {
        console.error('[API DOCUMENT CREATE] Failed to delete orphaned upload:', cleanupError);
      }
    }
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
