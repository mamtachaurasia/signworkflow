import type { FilterQuery } from 'mongoose';

import type { IDocument } from '@/models/Document';
import TeamModel from '@/models/Team';
import {
  buildSharedWithElemMatch,
  hasDocumentShareAccess,
} from '@/lib/document-sharing';
import { isAdminRole, isAuditorRole } from '@/lib/role-utils';
import { buildWorkspaceScopeFilter } from '@/lib/workspace-scope';

type TeamIdRecord = {
  _id?: { toString(): string } | string;
};

type BuildDocumentReadQueryArgs = {
  userId: string;
  orgId?: string | null;
  orgRole?: string | null;
  userEmail?: string | null;
  accessibleTeamIds?: string[];
};

type CanReadDocumentArgs = {
  userId?: string | null;
  orgId?: string | null;
  orgRole?: string | null;
  documentUserId?: string | null;
  documentOrgId?: string | null;
  documentTeamId?: string | null;
  requesterEmail?: string | null;
  sharedWith?: unknown;
  accessibleTeamIds?: string[];
};

export function hasOrgWideDocumentReadAccess(role?: string | null): boolean {
  return isAdminRole(role) || isAuditorRole(role);
}

export async function getAccessibleTeamIds(
  userId?: string | null,
  orgId?: string | null
): Promise<string[]> {
  if (!userId || !orgId) {
    return [];
  }

  const teams = await TeamModel.find({ orgId, memberIds: userId })
    .select('_id')
    .lean<TeamIdRecord[]>();

  return teams
    .map((team) => {
      const rawId = team?._id;
      return rawId ? String(rawId) : null;
    })
    .filter((teamId): teamId is string => Boolean(teamId));
}

export async function resolveDocumentReadScope(
  userId?: string | null,
  orgId?: string | null,
  orgRole?: string | null
): Promise<{ hasOrgWideReadAccess: boolean; accessibleTeamIds: string[] }> {
  const hasOrgWideReadAccess = hasOrgWideDocumentReadAccess(orgRole);

  if (hasOrgWideReadAccess || !userId || !orgId) {
    return {
      hasOrgWideReadAccess,
      accessibleTeamIds: [],
    };
  }

  return {
    hasOrgWideReadAccess: false,
    accessibleTeamIds: await getAccessibleTeamIds(userId, orgId),
  };
}

export function buildAccessibleDocumentQuery({
  userId,
  orgId,
  orgRole,
  userEmail,
  accessibleTeamIds = [],
}: BuildDocumentReadQueryArgs): FilterQuery<IDocument> {
  const sharedWith = buildSharedWithElemMatch(userEmail);
  const sharedClause = sharedWith ? ({ sharedWith } as FilterQuery<IDocument>) : null;

  if (!orgId) {
    const ownedClause = {
      userId,
      ...buildWorkspaceScopeFilter(null),
    };

    return sharedClause
      ? ({ $or: [ownedClause, sharedClause] } as FilterQuery<IDocument>)
      : ownedClause;
  }

  if (hasOrgWideDocumentReadAccess(orgRole)) {
    const orgClause = { orgId };
    return sharedClause
      ? ({ $or: [orgClause, sharedClause] } as FilterQuery<IDocument>)
      : orgClause;
  }

  const accessClauses: FilterQuery<IDocument>[] = [{ userId }];
  if (accessibleTeamIds.length > 0) {
    accessClauses.push({ teamId: { $in: accessibleTeamIds } });
  }

  const workspaceClause = {
    orgId,
    $or: accessClauses,
  };

  return sharedClause
    ? ({ $or: [workspaceClause, sharedClause] } as FilterQuery<IDocument>)
    : workspaceClause;
}

export function canReadDocument({
  userId,
  orgId,
  orgRole,
  documentUserId,
  documentOrgId,
  documentTeamId,
  requesterEmail,
  sharedWith,
  accessibleTeamIds = [],
}: CanReadDocumentArgs): boolean {
  if (!userId) {
    return false;
  }

  if (hasDocumentShareAccess({ sharedWith, requesterEmail })) {
    return true;
  }

  if (!documentOrgId) {
    return documentUserId === userId;
  }

  if (!orgId || documentOrgId !== orgId) {
    return false;
  }

  if (documentUserId === userId) {
    return true;
  }

  if (hasOrgWideDocumentReadAccess(orgRole)) {
    return true;
  }

  if (!documentTeamId) {
    return false;
  }

  return accessibleTeamIds.includes(documentTeamId);
}
