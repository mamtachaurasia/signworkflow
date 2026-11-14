import type { IDocument } from '@/models/Document';
import { buildRetentionUpdatePayload, computeRetentionFields } from '@/lib/retention';
import { resolveManualRetentionPolicyOverride } from '@/lib/retention-policy-overrides';

export type ReleasedHoldRetentionUpdate = {
  documentId: string;
  legalHold: NonNullable<IDocument['legalHold']>;
  retention: Awaited<ReturnType<typeof toUpdatedRetentionPayload>>;
  update: Record<string, unknown>;
};

export function buildReleasedHoldRetentionCandidateQuery(args: {
  orgId?: string;
  documentIds?: string[];
}) {
  const query: Record<string, unknown> = {
    'retention.status': 'on_hold',
    'legalHold.holdIds.0': { $exists: false },
    $or: [{ 'legalHold.status': { $exists: false } }, { 'legalHold.status': 'none' }],
  };

  if (args.orgId) {
    query.orgId = args.orgId;
  }

  if (args.documentIds && args.documentIds.length > 0) {
    query._id = { $in: args.documentIds };
  }

  return query;
}

export function buildReleasedLegalHoldState(now: Date): NonNullable<IDocument['legalHold']> {
  return {
    status: 'none',
    holdIds: [],
    lastCheckedAt: now,
  };
}

export function toUpdatedRetentionPayload(
  document: IDocument,
  retention: Awaited<ReturnType<typeof computeRetentionFields>>
) {
  return {
    ...retention,
    docType: document.retention?.docType ?? undefined,
    jurisdiction: document.retention?.jurisdiction ?? undefined,
    governingLaw: document.retention?.governingLaw ?? undefined,
    customTriggerAt: document.retention?.customTriggerAt ?? undefined,
  };
}

export async function buildReleasedHoldRetentionUpdate(
  document: IDocument,
  now: Date
): Promise<ReleasedHoldRetentionUpdate> {
  const legalHold = buildReleasedLegalHoldState(now);
  const releasedDocument = {
    ...document,
    legalHold,
  } as IDocument;
  const manualPolicyOverride = await resolveManualRetentionPolicyOverride(releasedDocument);

  const retention = await computeRetentionFields({
    document: releasedDocument,
    policy: manualPolicyOverride,
  });

  return {
    documentId: String(document._id),
    legalHold,
    retention: toUpdatedRetentionPayload(releasedDocument, retention),
    update: {
      'legalHold.status': legalHold.status,
      'legalHold.holdIds': legalHold.holdIds,
      'legalHold.lastCheckedAt': legalHold.lastCheckedAt,
      ...buildRetentionUpdatePayload({
        retention,
        docType: releasedDocument.retention?.docType,
        jurisdiction: releasedDocument.retention?.jurisdiction,
        governingLaw: releasedDocument.retention?.governingLaw,
        customTriggerAt: releasedDocument.retention?.customTriggerAt,
        evaluatedAt: now,
      }),
    },
  };
}
