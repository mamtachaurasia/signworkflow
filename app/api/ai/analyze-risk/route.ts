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

const AnalyzeRiskSchema = z.object({
  documentId: z.string().trim().regex(/^[a-f\d]{24}$/i),
  selectedText: z.string().trim().min(5).max(10000),
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
    namespace: 'ai:analyze_risk:ip',
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

  const parsed = AnalyzeRiskSchema.safeParse(body);
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

  const { documentId, selectedText } = parsed.data;
  let access: AIAccessContext | null = null;

  try {
    await connectDB();

    const accessResult = await resolveAIDocumentAccess({
      req,
      documentId,
      feature: 'ai_risk_analysis',
    });
    if ('response' in accessResult) {
      return accessResult.response;
    }
    access = accessResult.access;

    const startTime = Date.now();
    const aiService = getAIService();
    const riskAnalysis = await aiService.analyzeRisk(selectedText);
    const processingTimeMs = Date.now() - startTime;

    await writeAuditEvent({
      userId: access.userId,
      orgId: access.orgId,
      action: 'ai.analyze_risk.success',
      metadata: {
        documentId,
        accessMode: access.mode,
        recipientId: access.mode === 'recipient' ? access.recipientId : undefined,
        textLength: selectedText.length,
        riskCount: riskAnalysis.risks.length,
        overallRiskLevel: riskAnalysis.overallRiskLevel,
        processingTimeMs,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json({
        risks: riskAnalysis.risks,
        overallRiskLevel: riskAnalysis.overallRiskLevel,
        processingTimeMs,
      })
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await writeAuditEvent({
      userId: access?.userId,
      orgId: access?.orgId,
      action: 'ai.analyze_risk.error',
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
          message: 'Failed to analyze risks',
          error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 500 }
      )
    );
  }
}
