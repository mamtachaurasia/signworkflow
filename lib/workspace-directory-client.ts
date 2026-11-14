import {
  DirectoryRequestError,
  fetchOrganizationMembers,
  fetchOrganizationTeams,
  type OrganizationMemberEntry,
  type OrganizationSummary,
  type OrganizationTeamEntry,
  type OrganizationTeamMember,
  type OrganizationTeamsPayload,
} from '@/lib/organization-directory-client';

export { DirectoryRequestError };

export type WorkspaceSummary = OrganizationSummary;
export type WorkspaceMemberEntry = OrganizationMemberEntry;
export type WorkspaceTeamMember = OrganizationTeamMember;
export type WorkspaceTeamEntry = OrganizationTeamEntry;

export type WorkspaceMembersPayload = {
  workspace: WorkspaceSummary | null;
  workspaceRole: string | null;
  members: WorkspaceMemberEntry[];
};

export type WorkspaceTeamsPayload = {
  workspaceRole: string | null;
  workspacePlan: string | null;
  maxTeams: number | null;
  teams: WorkspaceTeamEntry[];
};

export async function fetchWorkspaceMembers(orgId: string): Promise<WorkspaceMembersPayload> {
  const payload = await fetchOrganizationMembers(orgId);
  return {
    workspace: payload.organization,
    workspaceRole: payload.orgRole,
    members: payload.members,
  };
}

export async function fetchWorkspaceTeams(orgId: string): Promise<WorkspaceTeamsPayload> {
  const payload: OrganizationTeamsPayload = await fetchOrganizationTeams(orgId);
  return {
    workspaceRole: payload.orgRole,
    workspacePlan: payload.orgPlan,
    maxTeams: payload.maxTeams,
    teams: payload.teams,
  };
}
