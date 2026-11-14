import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { resolveRecipientAIDocumentAccess } from '@/lib/modules/ai/ai-route-access';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const RecipientEntitlementsSchema = z.object({
  documentId: z.string().trim().regex(/^[a-f\d]{24}$/i),
});

const AI_FEATURES = {
  aiSelectionSummary: 'ai_selection_summary',
  aiFullDocument: 'ai_full_document',
  aiTranslation: 'ai_translation',
  aiExplanation: 'ai_explanation',
  aiRiskAnalysis: 'ai_risk_analysis',
} as const;

export async function GET(req: NextRequest) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        { message: 'HTTPS is required for authenticated endpoints.' },
        { status: 400 }
      )
    );
  }

  const parsed = RecipientEntitlementsSchema.safeParse({
    documentId: req.nextUrl.searchParams.get('documentId'),
  });

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

  try {
    await connectDB();

    const accessResult = await resolveRecipientAIDocumentAccess({
      req,
      documentId: parsed.data.documentId,
    });

    if ('response' in accessResult) {
      return accessResult.response;
    }

    const orgId = accessResult.access.orgId;
    const entries = await Promise.all(
      Object.entries(AI_FEATURES).map(async ([key, feature]) => {
        const gate = await getPlanGateForOrgFeature({ orgId, feature });
        return [key, gate.allowed] as const;
      })
    );

    return withSecurityHeaders(
      req,
      NextResponse.json({
        entitlements: Object.fromEntries(entries),
      })
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Failed to load AI access',
          error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 500 }
      )
    );
  }
}
