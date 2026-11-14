type ErrorPayload = {
  message?: string;
};

export class DirectoryRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DirectoryRequestError';
    this.status = status;
  }
}

export type OrganizationSummary = {
  id: string;
  name: string;
  slug?: string;
  plan: string;
  status: string;
  seatLimit: number;
};

export type OrganizationMemberEntry = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  teams: { id: string; name: string }[];
  invitedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
};

export type OrganizationMembersPayload = {
  organization: OrganizationSummary | null;
  orgRole: string | null;
  members: OrganizationMemberEntry[];
};

export type OrganizationTeamMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export type OrganizationTeamEntry = {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  members: OrganizationTeamMember[];
  createdAt?: string;
  updatedAt?: string;
};

export type OrganizationTeamsPayload = {
  orgRole: string | null;
  orgPlan: string | null;
  maxTeams: number | null;
  teams: OrganizationTeamEntry[];
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export async function fetchOrganizationMembers(orgId: string): Promise<OrganizationMembersPayload> {
  const response = await fetch(`/api/orgs/members?orgId=${encodeURIComponent(orgId)}`, {
    credentials: 'include',
  });
  const payload = await readJson<Partial<OrganizationMembersPayload> & ErrorPayload>(response);

  if (!response.ok) {
    throw new DirectoryRequestError(payload.message || 'Failed to load members', response.status);
  }

  return {
    organization: payload.organization ?? null,
    orgRole: typeof payload.orgRole === 'string' ? payload.orgRole : null,
    members: Array.isArray(payload.members) ? payload.members : [],
  };
}

export async function fetchOrganizationTeams(orgId: string): Promise<OrganizationTeamsPayload> {
  const response = await fetch(`/api/orgs/teams?orgId=${encodeURIComponent(orgId)}`, {
    credentials: 'include',
  });
  const payload = await readJson<Partial<OrganizationTeamsPayload> & ErrorPayload>(response);

  if (!response.ok) {
    throw new DirectoryRequestError(payload.message || 'Failed to load teams', response.status);
  }

  return {
    orgRole: typeof payload.orgRole === 'string' ? payload.orgRole : null,
    orgPlan: typeof payload.orgPlan === 'string' ? payload.orgPlan : null,
    maxTeams: typeof payload.maxTeams === 'number' || payload.maxTeams === null ? payload.maxTeams : null,
    teams: Array.isArray(payload.teams) ? payload.teams : [],
  };
}
