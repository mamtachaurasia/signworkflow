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
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const ExplainClauseSchema = z.object({
  documentId: z.string().trim().regex(/^[a-f\d]{24}$/i),
  selectedText: z.string().trim().min(5).max(10000),
  context: z.string().max(500).optional(),
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
    namespace: 'ai:explain_clause:ip',
    limit: 100,
    windowSeconds: 15 * 60,
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

  const parsed = ExplainClauseSchema.safeParse(body);
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

  const { documentId, selectedText, context: clauseContext } = parsed.data;
  let access: AIAccessContext | null = null;

  try {
    await connectDB();

    const accessResult = await resolveAIDocumentAccess({
      req,
      documentId,
      feature: 'ai_explanation',
    });
    if ('response' in accessResult) {
      return accessResult.response;
    }
    access = accessResult.access;

    const startTime = Date.now();
    const aiService = getAIService();
    const explanation = await aiService.explainClause(selectedText, clauseContext);
    const processingTimeMs = Date.now() - startTime;

    await writeAuditEvent({
      userId: access.userId,
      orgId: access.orgId,
      action: 'ai.explain_clause.success',
      metadata: {
        documentId,
        accessMode: access.mode,
        recipientId: access.mode === 'recipient' ? access.recipientId : undefined,
        textLength: selectedText.length,
        processingTimeMs,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json({
        explanation,
        processingTimeMs,
      })
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await writeAuditEvent({
      userId: access?.userId,
      orgId: access?.orgId,
      action: 'ai.explain_clause.error',
      metadata: {
        documentId,
        accessMode: access?.mode,
        recipientId: access?.mode === 'recipient' ? access.recipientId : undefined,
        error: errorMessage,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Failed to explain clause',
          error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 500 }
      )
    );
  }
}
