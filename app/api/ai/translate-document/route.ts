import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getClientIp,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { consumeRateLimit } from '@/lib/rateLimit';
import { writeAuditEvent } from '@/lib/audit';
import { getAIService } from '@/lib/modules/ai/ai.service';
import { hasSigningTokenHeader, resolveAIDocumentAccess, type AIAccessContext } from '@/lib/modules/ai/ai-route-access';
import { extractTextFromPDF } from '@/lib/modules/ai/pdf-text';
import { getObjectStream, normalizeStorageProvider, streamToBuffer } from '@/lib/s3';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const TranslateDocumentSchema = z.object({
  documentId: z.string().trim().regex(/^[a-f\d]{24}$/i),
  targetLanguage: z.string().trim().min(2).max(50),
});

export async function POST(req: NextRequest) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        { message: 'HTTPS is required for authenticated endpoints.' },
        { status: 400 }
      )
    );
  }

  if (!hasSigningTokenHeader(req) && !validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed' }, { status: 403 })
    );
  }

  const clientIp = getClientIp(req);
  const rateLimit = await consumeRateLimit({
    key: clientIp,
    namespace: 'ai:translate_document:ip',
    limit: 20,
    windowSeconds: 60 * 60,
  });

  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { message: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return withSecurityHeaders(req, response);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
    );
  }

  const parsed = TranslateDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Validation failed',
          errors: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      )
    );
  }

  const { documentId, targetLanguage } = parsed.data;
  let access: AIAccessContext | null = null;

  try {
    await connectDB();

    const accessResult = await resolveAIDocumentAccess({
      req,
      documentId,
      feature: 'ai_translation',
    });
    if ('response' in accessResult) {
      return accessResult.response;
    }
    const { document } = accessResult;
    access = accessResult.access;

    const currentVersion = document.versions?.[document.currentVersion];
    if (!currentVersion) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Document version not found' }, { status: 404 })
      );
    }

    const pdfStream = await getObjectStream({
      bucket: currentVersion.storage.bucket!,
      key: currentVersion.storage.key!,
      region: currentVersion.storage.region,
      provider: normalizeStorageProvider(currentVersion.storage.provider || 'r2'),
    });
    const pdfBuffer = await streamToBuffer(pdfStream);

    const pdfText = await extractTextFromPDF(pdfBuffer);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const aiService = getAIService();
          const result = await aiService.translateDocument(pdfText, targetLanguage);

          for (const chunk of result.chunks) {
            const data = {
              type: 'chunk',
              index: chunk.index,
              translation: chunk.translation,
              progress: chunk.progress,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          const finalData = {
            type: 'complete',
            fullTranslation: result.fullTranslation,
            targetLanguage,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));

          await writeAuditEvent({
            userId: access?.userId,
            orgId: access?.orgId,
            action: 'ai.translate_document.success',
            metadata: {
              documentId,
              accessMode: access?.mode,
              recipientId: access?.mode === 'recipient' ? access.recipientId : undefined,
              targetLanguage,
              chunkCount: result.chunks.length,
              documentLength: pdfText.length,
            },
          });

          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorData = {
            type: 'error',
            message: errorMessage,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));

          await writeAuditEvent({
            userId: access?.userId,
            orgId: access?.orgId,
            action: 'ai.translate_document.error',
            metadata: {
              documentId,
              accessMode: access?.mode,
              recipientId: access?.mode === 'recipient' ? access.recipientId : undefined,
              error: errorMessage,
            },
          });

          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await writeAuditEvent({
      userId: access?.userId,
      orgId: access?.orgId,
      action: 'ai.translate_document.error',
      metadata: {
        documentId: parsed.data.documentId,
        accessMode: access?.mode,
        recipientId: access?.mode === 'recipient' ? access.recipientId : undefined,
        error: errorMessage,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Failed to translate document',
          error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 500 }
      )
    );
  }
}
