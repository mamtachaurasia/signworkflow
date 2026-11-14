export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export type TeamEntry = {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  members: TeamMember[];
  createdAt?: string;
  updatedAt?: string;
};

export type OrgMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  teams?: { id: string; name: string }[];
  invitedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
};

export type MemberSelectOption = {
  value: string;
  label: string;
  member: OrgMember;
};

export type PendingRemovalMember = {
  userId: string;
  name: string;
};

export type MemberSummary = {
  active: number;
  invited: number;
  disabled: number;
};
