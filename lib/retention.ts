import mongoose from 'mongoose';
import type { IDocument } from '@/models/Document';
import RetentionPolicyModel, { type IRetentionPolicy, type RetentionTriggerEvent } from '@/models/RetentionPolicy';
import OrganizationModel from '@/models/Organization';
import { normalizeOrganizationSettings } from '@/lib/org-settings';

export type RetentionStatus = 'unclassified' | 'pending_trigger' | 'active' | 'eligible' | 'on_hold';

export type RetentionPolicySnapshot = {
  policyId?: mongoose.Types.ObjectId;
  name?: string;
  docType?: string;
  jurisdiction?: string;
  triggerEvent?: RetentionTriggerEvent;
  durationDays?: number;
  regime?: string;
  priority?: number;
};

export interface RetentionComputationInput {
  document: IDocument;
  policy?: IRetentionPolicy | null;
  now?: Date;
  completionAt?: Date;
}

function normalizeMatchValue(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

export function retentionPolicyMatches(policy: IRetentionPolicy, document: IDocument): boolean {
  const docType = normalizeMatchValue(document.retention?.docType);
  const jurisdiction = normalizeMatchValue(document.retention?.jurisdiction);

  const policyDocType = normalizeMatchValue(policy.docType);
  const policyJurisdiction = normalizeMatchValue(policy.jurisdiction);

  const docTypeMatches = policyDocType === '*' || (Boolean(docType) && policyDocType === docType);
  const jurisdictionMatches =
    policyJurisdiction === '*' || (Boolean(jurisdiction) && policyJurisdiction === jurisdiction);

  return docTypeMatches && jurisdictionMatches;
}

function policySpecificity(policy: IRetentionPolicy): number {
  let score = 0;
  if (policy.docType && policy.docType !== '*') score += 1;
  if (policy.jurisdiction && policy.jurisdiction !== '*') score += 1;
  return score;
}

async function resolveOrganizationDefaultRetentionPolicy(document: IDocument): Promise<IRetentionPolicy | null> {
  if (!document.orgId) {
    return null;
  }

  const organization = await OrganizationModel.findById(document.orgId)
    .select('settings')
    .lean<{ settings?: unknown } | null>();

  const settings = normalizeOrganizationSettings(organization?.settings);
  if (!settings.defaultRetention.enabled) {
    return null;
  }

  return {
    _id: undefined as unknown as IRetentionPolicy['_id'],
    name: 'Workspace default retention',
    docType: '*',
    jurisdiction: '*',
    triggerEvent: settings.defaultRetention.triggerEvent,
    durationDays: settings.defaultRetention.durationDays,
    priority: -1,
    regime: settings.defaultRetention.regime || undefined,
    active: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as IRetentionPolicy;
}

export async function resolveRetentionPolicy(document: IDocument): Promise<IRetentionPolicy | null> {
  const policyQuery = document.orgId
    ? { active: true, orgId: document.orgId }
    : { active: true, $or: [{ orgId: { $exists: false } }, { orgId: null }] };
  const policies = await RetentionPolicyModel.find(policyQuery).lean<IRetentionPolicy[]>();
  if (!policies.length) return resolveOrganizationDefaultRetentionPolicy(document);

  const matching = policies.filter((policy) => retentionPolicyMatches(policy, document));
  if (matching.length === 0) return resolveOrganizationDefaultRetentionPolicy(document);

  matching.sort((a, b) => {
    const priorityDiff = (b.priority || 0) - (a.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;

    const specificityDiff = policySpecificity(b) - policySpecificity(a);
    if (specificityDiff !== 0) return specificityDiff;

    return (b.durationDays || 0) - (a.durationDays || 0);
  });

  return matching[0] || (await resolveOrganizationDefaultRetentionPolicy(document));
}

export function resolveRetentionTriggerDate(
  document: IDocument,
  triggerEvent: RetentionTriggerEvent,
  completionAt?: Date
): Date | null {
  switch (triggerEvent) {
    case 'createdAt':
      return document.createdAt ? new Date(document.createdAt) : null;
    case 'completedAt':
      return completionAt || (document.completedAt ? new Date(document.completedAt) : null);
    case 'finalizedAt':
      return completionAt || (document.finalizedAt ? new Date(document.finalizedAt) : null);
    case 'expiresAt':
      return document.expiresAt ? new Date(document.expiresAt) : null;
    case 'custom':
      return document.retention?.customTriggerAt ? new Date(document.retention.customTriggerAt) : null;
    default:
      return null;
  }
}

export function computeRetentionEnd(startAt: Date, durationDays: number): Date {
  const endAt = new Date(startAt);
  endAt.setUTCDate(endAt.getUTCDate() + durationDays);
  return endAt;
}

function buildPolicySnapshot(policy: IRetentionPolicy): RetentionPolicySnapshot {
  return {
    policyId: policy._id as mongoose.Types.ObjectId,
    name: policy.name,
    docType: policy.docType,
    jurisdiction: policy.jurisdiction,
    triggerEvent: policy.triggerEvent,
    durationDays: policy.durationDays,
    regime: policy.regime,
    priority: policy.priority,
  };
}

export async function computeRetentionFields({
  document,
  policy,
  now = new Date(),
  completionAt,
}: RetentionComputationInput): Promise<{
  policy: RetentionPolicySnapshot | null;
  triggerEvent?: RetentionTriggerEvent;
  triggerAt?: Date | null;
  startAt?: Date | null;
  endAt?: Date | null;
  status: RetentionStatus;
}> {
  const resolvedPolicy = policy ?? (await resolveRetentionPolicy(document));
  if (!resolvedPolicy) {
    return {
      policy: null,
      status: 'unclassified',
    };
  }

  const triggerEvent = resolvedPolicy.triggerEvent;
  const triggerAt = resolveRetentionTriggerDate(document, triggerEvent, completionAt);
  const startAt = triggerAt;
  const endAt = triggerAt ? computeRetentionEnd(triggerAt, resolvedPolicy.durationDays) : null;
  const hasHold =
    document.legalHold?.status === 'active' || document.legalHold?.status === 'unknown';

  let status: RetentionStatus = 'pending_trigger';
  if (triggerAt && endAt) {
    status = now >= endAt ? 'eligible' : 'active';
  }
  if (hasHold) {
    status = 'on_hold';
  }

  return {
    policy: buildPolicySnapshot(resolvedPolicy),
    triggerEvent,
    triggerAt,
    startAt,
    endAt,
    status,
  };
}

export function buildRetentionUpdatePayload(args: {
  retention: Awaited<ReturnType<typeof computeRetentionFields>>;
  docType?: string;
  jurisdiction?: string;
  governingLaw?: string;
  customTriggerAt?: Date | null;
  evaluatedAt?: Date;
}) {
  const { retention, docType, jurisdiction, governingLaw, customTriggerAt, evaluatedAt } = args;
  return {
    'retention.docType': docType ?? undefined,
    'retention.jurisdiction': jurisdiction ?? undefined,
    'retention.governingLaw': governingLaw ?? undefined,
    'retention.customTriggerAt': customTriggerAt ?? undefined,
    'retention.policy': retention.policy ?? undefined,
    'retention.triggerEvent': retention.triggerEvent ?? undefined,
    'retention.triggerAt': retention.triggerAt ?? undefined,
    'retention.startAt': retention.startAt ?? undefined,
    'retention.endAt': retention.endAt ?? undefined,
    'retention.status': retention.status,
    'retention.lastEvaluatedAt': evaluatedAt ?? new Date(),
  };
}

export function applyRetentionToDocument(
  document: IDocument,
  retention: Awaited<ReturnType<typeof computeRetentionFields>>,
  evaluatedAt: Date = new Date()
) {
  document.retention = document.retention || {};
  document.retention.policy = retention.policy ?? undefined;
  document.retention.triggerEvent = retention.triggerEvent;
  document.retention.triggerAt = retention.triggerAt ?? undefined;
  document.retention.startAt = retention.startAt ?? undefined;
  document.retention.endAt = retention.endAt ?? undefined;
  document.retention.status = retention.status;
  document.retention.lastEvaluatedAt = evaluatedAt;
}
