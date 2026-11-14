import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { getApiKeyContext, getApiRateLimitResponse } from '@/lib/api-key';
import { getSigningEmailDeliverySummary, processSigningEmailJobs, retrySigningEmailJobs } from '@/lib/signing-email-jobs';
import { getTrialWriteAccessDeniedResponse } from '@/lib/trial-access';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const apiKey = await getApiKeyContext(req);
    if (!apiKey) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
    const rateLimitResponse = getApiRateLimitResponse(apiKey);
    if (rateLimitResponse) return rateLimitResponse;
    if (!apiKey.scopes.includes('documents:write')) return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    const trialDenied = await getTrialWriteAccessDeniedResponse({ orgId: apiKey.orgId });
    if (trialDenied) return trialDenied;
    const { documentId } = await params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) return NextResponse.json({ error: 'invalid_document_id' }, { status: 400 });

    if (!await retrySigningEmailJobs(documentId, apiKey.orgId)) {
      return NextResponse.json({ error: 'no_failed_deliveries' }, { status: 409 });
    }
    await processSigningEmailJobs({ documentId, orgId: apiKey.orgId, limit: 100 });
    const delivery = await getSigningEmailDeliverySummary(documentId, apiKey.orgId);
    return NextResponse.json({
      data: { id: documentId, retried: true },
      deliveryFailures: delivery.failures,
      deliveryPending: delivery.pending,
      retryable: delivery.failures.length > 0 || delivery.pending > 0,
    });
  } catch (error) {
    console.error('[API DOCUMENT SEND RETRY] Failed:', error);
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
