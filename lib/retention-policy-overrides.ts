import type { IDocument, IDocumentRetentionPolicySnapshot } from '@/models/Document';
import RetentionPolicyModel, { type IRetentionPolicy } from '@/models/RetentionPolicy';

function buildPolicyFromSnapshot(args: {
  snapshot?: IDocumentRetentionPolicySnapshot;
  orgId?: IDocument['orgId'];
  docType?: string;
  jurisdiction?: string;
}): IRetentionPolicy | undefined {
  const { snapshot, orgId, docType, jurisdiction } = args;
  if (!snapshot?.triggerEvent || typeof snapshot.durationDays !== 'number') {
    return undefined;
  }

  return {
    _id: snapshot.policyId as IRetentionPolicy['_id'],
    name: snapshot.name || 'Stored retention policy override',
    orgId: orgId as IRetentionPolicy['orgId'],
    docType: snapshot.docType || docType || '*',
    jurisdiction: snapshot.jurisdiction || jurisdiction || '*',
    triggerEvent: snapshot.triggerEvent,
    durationDays: snapshot.durationDays,
    priority: snapshot.priority,
    regime: snapshot.regime,
    active: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as IRetentionPolicy;
}

function matchesDocumentOrg(policy: IRetentionPolicy, documentOrgId?: IDocument['orgId']): boolean {
  if (!policy.orgId || !documentOrgId) {
    return true;
  }
  return String(policy.orgId) === String(documentOrgId);
}

export async function resolveManualRetentionPolicyOverride(
  document: Pick<IDocument, 'orgId' | 'retention'>
): Promise<IRetentionPolicy | undefined> {
  if (document.retention?.policySelection !== 'manual') {
    return undefined;
  }

  const overrideId = document.retention.policyOverrideId || document.retention.policy?.policyId;
  if (overrideId) {
    const policy = await RetentionPolicyModel.findById(overrideId).lean<IRetentionPolicy | null>();
    if (policy && matchesDocumentOrg(policy, document.orgId)) {
      return policy;
    }
  }

  return buildPolicyFromSnapshot({
    snapshot: document.retention.policy,
    orgId: document.orgId,
    docType: document.retention?.docType,
    jurisdiction: document.retention?.jurisdiction,
  });
}
