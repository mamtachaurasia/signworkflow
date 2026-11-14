import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isSecureRequest,
  withSecurityHeaders,
} from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import connectDB from '@/utils/db';
import DocumentModel, { type IAIInsight } from '@/models/Document';

export const runtime = 'nodejs';

const HistoryQuerySchema = z.object({
  type: z.enum(['summary', 'translation', 'explanation', 'risk_analysis']).optional(),
  limit: z.number().max(100).default(20),
  offset: z.number().default(0),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        { message: 'HTTPS is required for authenticated endpoints.' },
        { status: 400 }
      )
    );
  }

  const context = await getAuthContext(req);
  if (!context?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  const searchParams = req.nextUrl.searchParams;
  const query = HistoryQuerySchema.safeParse({
    type: searchParams.get('type'),
    limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
    offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
  });

  if (!query.success) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Invalid query parameters',
          errors: query.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      )
    );
  }

  const { documentId } = await params;
  const { type, limit, offset } = query.data;

  if (!documentId.match(/^[a-f\d]{24}$/i)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid document ID' }, { status: 400 })
    );
  }

  try {
    await connectDB();

    const document = await DocumentModel.findById(documentId).select('aiInsights userId orgId');

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

    let insights = (document.aiInsights || []) as IAIInsight[];

    if (type) {
      insights = insights.filter((i) => i.type === type);
    }

    const total = insights.length;

    const paginated = insights
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(offset, offset + limit);

    return withSecurityHeaders(
      req,
      NextResponse.json({
        insights: paginated.map((i) => ({
          _id: i._id,
          type: i.type,
          language: i.language,
          content: i.content,
          contentPreview: i.content.substring(0, 200),
          selectedTextPreview: i.selectedText?.substring(0, 100),
          createdAt: i.createdAt,
          savedBy: i.savedBy,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      })
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Failed to retrieve history',
          error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 500 }
      )
    );
  }
}
