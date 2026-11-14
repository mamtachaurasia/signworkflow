import mongoose, { type FilterQuery } from 'mongoose';

import type { ITemplate } from '@/models/Template';
import { isAdminRole } from '@/lib/role-utils';

export type TemplateSharingScope = 'private' | 'workspace';

type TemplateAccessArgs = {
  userId?: string | null;
  orgId?: string | null;
  orgRole?: string | null;
};

type TemplateLike = Pick<ITemplate, 'isSystemTemplate' | 'sharingScope' | 'userId' | 'orgId'>;

function matchesLegacyUserId(userId: string): FilterQuery<ITemplate> | null {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  return {
    $expr: { $eq: [{ $toString: '$userId' }, userId] },
  } as FilterQuery<ITemplate>;
}

function isSameOrg(templateOrgId: TemplateLike['orgId'], orgId?: string | null) {
  if (!orgId || !templateOrgId) return false;
  return String(templateOrgId) === orgId;
}

function isOwnerMatch(template: TemplateLike, userId?: string | null) {
  if (!userId || !template.userId) return false;
  return String(template.userId) === userId;
}

export function normalizeTemplateSharingScope(value: unknown): TemplateSharingScope {
  return value === 'workspace' ? 'workspace' : 'private';
}

export function buildTemplateListFilter(args: TemplateAccessArgs): FilterQuery<ITemplate> {
  if (!args.userId || !args.orgId) {
    return { isSystemTemplate: true };
  }

  const legacyOwnerMatcher = matchesLegacyUserId(args.userId);
  const ownerVariants: FilterQuery<ITemplate>[] = [
    {
      userId: args.userId,
      sharingScope: 'private',
      $or: [{ orgId: args.orgId }, { orgId: { $exists: false } }, { orgId: null }],
    },
  ];

  if (legacyOwnerMatcher) {
    ownerVariants.push({
      ...legacyOwnerMatcher,
      sharingScope: 'private',
      $or: [{ orgId: args.orgId }, { orgId: { $exists: false } }, { orgId: null }],
    } as FilterQuery<ITemplate>);
  }

  return {
    $or: [
      { isSystemTemplate: true },
      ...ownerVariants,
      { isSystemTemplate: false, orgId: args.orgId, sharingScope: 'workspace' },
    ],
  };
}

export function canReadTemplate(template: TemplateLike, args: TemplateAccessArgs): boolean {
  if (template.isSystemTemplate) return true;
  if (!args.userId || !args.orgId) return false;
  if (normalizeTemplateSharingScope(template.sharingScope) === 'workspace' && isSameOrg(template.orgId, args.orgId)) {
    return true;
  }
  return isOwnerMatch(template, args.userId);
}

export function canManageTemplate(template: TemplateLike, args: TemplateAccessArgs): boolean {
  if (template.isSystemTemplate) return false;
  if (!args.userId || !args.orgId) return false;
  if (!isSameOrg(template.orgId, args.orgId)) return false;

  if (normalizeTemplateSharingScope(template.sharingScope) === 'workspace') {
    return isOwnerMatch(template, args.userId) || isAdminRole(args.orgRole);
  }

  return isOwnerMatch(template, args.userId);
}
