import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';

import {
  getClientIp,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { consumeRateLimit } from '@/lib/rateLimit';
import { writeAuditEvent } from '@/lib/audit';
import connectDB from '@/utils/db';
import DocumentModel, { IAIInsight } from '@/models/Document';

export const runtime = 'nodejs';

const SaveInsightSchema = z.object({
  documentId: z.string().trim().regex(/^[a-f\d]{24}$/i),
  type: z.enum(['summary', 'translation', 'explanation', 'risk_analysis']),
  content: z.string().trim().min(1).max(10000),
  selectedText: z.string().max(5000).optional(),
  language: z.string().max(50).optional(),
  pageNumber: z.number().optional(),
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

  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed' }, { status: 403 })
    );
  }

  const clientIp = getClientIp(req);
  const rateLimit = await consumeRateLimit({
    key: clientIp,
    namespace: 'ai:save_insight:ip',
    limit: 200,
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

  const context = await getAuthContext(req);
  if (!context?.userId || !context?.orgId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
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

  const parsed = SaveInsightSchema.safeParse(body);
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

  const { documentId, type, content, selectedText, language, pageNumber } = parsed.data;

  try {
    await connectDB();

    const document = await DocumentModel.findById(documentId);
    if (!document) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Document not found' }, { status: 404 })
      );
    }

    if (document.userId !== context.userId && document.orgId?.toString() !== context.orgId) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Forbidden' }, { status: 403 })
      );
    }

    const insight: IAIInsight = {
      _id: new mongoose.Types.ObjectId(),
      type,
      content,
      language,
      selectedText,
      createdAt: new Date(),
      savedBy: context.userId,
      selectionMeta: pageNumber ? { pageNumber } : undefined,
    };

    if (!document.aiInsights) {
      document.aiInsights = [];
    }
    document.aiInsights.push(insight);

    if (!document.aiMetadata) {
      document.aiMetadata = {};
    }
    document.aiMetadata.lastAnalyzedAt = new Date();
    document.aiMetadata.analysisCount = (document.aiMetadata.analysisCount || 0) + 1;

    await document.save();

    await writeAuditEvent({
      userId: context.userId,
      orgId: context.orgId,
      action: 'ai.save_insight.success',
      metadata: {
        documentId,
        insightType: type,
        contentLength: content.length,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json({
        success: true,
        insight: {
          _id: insight._id,
          type: insight.type,
          createdAt: insight.createdAt,
        },
      })
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await writeAuditEvent({
      userId: context.userId,
      orgId: context.orgId,
      action: 'ai.save_insight.error',
      metadata: {
        documentId,
        error: errorMessage,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Failed to save insight',
          error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 500 }
      )
    );
  }
}
