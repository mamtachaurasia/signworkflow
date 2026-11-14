'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Info } from 'lucide-react';
import { type StylesConfig } from 'react-select';

import { Button } from '@ui';
import { Modal } from '@ui';
import { Input } from '@ui';
import TeamDetailsPanel from '@/components/account/teams/TeamDetailsPanel';
import TeamListPanel from '@/components/account/teams/TeamListPanel';
import type {
  MemberSelectOption,
  MemberSummary,
  OrgMember,
  PendingRemovalMember,
  TeamEntry,
} from '@/components/account/teams/types';
import useContextStore from '@/hooks/useContextStore';
import { isAdminRole, isAuditorRole, isOwnerRole } from '@/lib/role-utils';
import { getDashboardAccountPath } from '@/lib/account-routing';
import {
  DirectoryRequestError,
  fetchWorkspaceMembers,
  fetchWorkspaceTeams,
  type WorkspaceTeamMember,
} from '@/lib/workspace-directory-client';
import { getWorkspacePlanLabel } from '@/lib/subscription-plans';

const memberSelectStyles: StylesConfig<MemberSelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderColor: state.isFocused ? '#8b5cf6' : '#cbd5e1',
    boxShadow: state.isFocused ? '0 0 0 1px #8b5cf6' : 'none',
    '&:hover': {
      borderColor: state.isFocused ? '#8b5cf6' : '#94a3b8',
    },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? '#f5f3ff' : '#ffffff',
    color: '#0f172a',
  }),
  placeholder: (base) => ({
    ...base,
    color: '#64748b',
  }),
  singleValue: (base) => ({
    ...base,
    color: '#0f172a',
  }),
  menu: (base) => ({
    ...base,
    zIndex: 30,
  }),
};

const MEMBERS_VIEW_NOTICE =
  'Only owners, admins, and auditors can view the workspace member directory.';

function canViewOrgMembers(role?: string | null) {
  return isAdminRole(role) || isAuditorRole(role);
}

function normalizeTeamMembers(members?: WorkspaceTeamMember[]) {
  return Array.isArray(members) ? members : [];
}

const MyTeams = () => {
  const { user } = useContextStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgIdParam = searchParams.get('orgId') || '';
  const orgId = orgIdParam || user?.orgId || '';

  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedMemberOption, setSelectedMemberOption] = useState<MemberSelectOption | null>(null);
  const [pendingRemovalMember, setPendingRemovalMember] = useState<PendingRemovalMember | null>(null);
  const [showDeleteTeamModal, setShowDeleteTeamModal] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(user?.orgRole ?? null);
  const [workspacePlan, setWorkspacePlan] = useState<string | null>(null);
  const [maxTeams, setMaxTeams] = useState<number | null>(null);
  const [membersAccessNotice, setMembersAccessNotice] = useState<string | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const effectiveRole = workspaceRole || user?.orgRole || user?.role || null;

  const canManage = isAdminRole(effectiveRole);
  const canInvite = isOwnerRole(effectiveRole);
  const canViewMembers = canViewOrgMembers(effectiveRole);
  const teamLimitReached = canManage && maxTeams !== null && teams.length >= maxTeams;

  const activeMembers = useMemo(
    () => workspaceMembers.filter((member) => member.status === 'active'),
    [workspaceMembers]
  );

  const memberSummary = useMemo<MemberSummary>(() => {
    const active = workspaceMembers.filter((member) => member.status === 'active').length;
    const invited = workspaceMembers.filter((member) => member.status === 'invited').length;
    const disabled = workspaceMembers.filter((member) => member.status === 'disabled').length;
    return { active, invited, disabled };
  }, [workspaceMembers]);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );

  const availableMembers = useMemo(() => {
    if (!selectedTeam) return [];
    const memberIds = new Set(selectedTeam.members.map((member) => member.userId));
    return activeMembers.filter((member) => {
      if (memberIds.has(member.userId)) return false;
      return true;
    });
  }, [activeMembers, selectedTeam]);

  const memberOptions = useMemo(
    () =>
      availableMembers.map((member) => ({
        value: member.userId,
        label: `${member.name} · ${member.email}`,
        member,
      })),
    [availableMembers]
  );

  const loadTeams = useCallback(async (): Promise<string | null> => {
    if (!orgId) {
      setTeams([]);
      return null;
    }
    try {
      const payload = await fetchWorkspaceTeams(orgId);
      setTeams(payload.teams.map((team) => ({ ...team, members: normalizeTeamMembers(team.members) })));
      setWorkspacePlan(payload.workspacePlan);
      setMaxTeams(payload.maxTeams);
      const nextRole =
        typeof payload.workspaceRole === 'string' && payload.workspaceRole.trim()
          ? payload.workspaceRole
          : effectiveRole;
      setWorkspaceRole((prev) => nextRole ?? prev);
      return nextRole;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load teams';
      toast.error(message, { id: 'teams-load-error' });
      return effectiveRole;
    }
  }, [effectiveRole, orgId]);

  const loadWorkspaceMembers = useCallback(async (roleOverride?: string | null) => {
    if (!orgId) {
      setWorkspaceMembers([]);
      setMembersAccessNotice(null);
      return;
    }

    const resolvedRole = roleOverride ?? effectiveRole;
    if (!canViewOrgMembers(resolvedRole)) {
      setWorkspaceMembers([]);
      setMembersAccessNotice(MEMBERS_VIEW_NOTICE);
      return;
    }

    try {
      const payload = await fetchWorkspaceMembers(orgId);
      setWorkspaceMembers(payload.members);
      setWorkspaceRole((prev) => payload.workspaceRole ?? prev);
      setMembersAccessNotice(null);
    } catch (error) {
      if (error instanceof DirectoryRequestError && error.status === 403) {
        setWorkspaceMembers([]);
        setMembersAccessNotice(MEMBERS_VIEW_NOTICE);
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to load members';
      toast.error(message, { id: 'workspace-members-load-error' });
    }
  }, [effectiveRole, orgId]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      setLoading(true);
      const resolvedRole = await loadTeams();
      await loadWorkspaceMembers(resolvedRole);
      if (!cancelled) {
        setLoading(false);
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [loadTeams, loadWorkspaceMembers]);

  useEffect(() => {
    if (!teams.length) {
      setSelectedTeamId(null);
      return;
    }
    if (!selectedTeamId || !teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  useEffect(() => {
    if (!selectedTeam) {
      setEditName('');
      setEditDescription('');
      setShowDeleteTeamModal(false);
      return;
    }
    setEditName(selectedTeam.name);
    setEditDescription(selectedTeam.description || '');
    setSelectedMemberOption(null);
    setIsEditing(false);
  }, [selectedTeamId, selectedTeam]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      toast.error('Team name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/orgs/teams', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-org-id': orgId },
        body: JSON.stringify({
          name: newTeamName.trim(),
          description: newTeamDescription.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to create team');
      }
      toast.success('Team created');
      setNewTeamName('');
      setNewTeamDescription('');
      setShowCreatePanel(false);
      if (payload?.team?.id) {
        setSelectedTeamId(payload.team.id);
      }
      await loadTeams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveTeam = async () => {
    if (!selectedTeam) return;
    if (!editName.trim()) {
      toast.error('Team name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/teams/${selectedTeam.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-org-id': orgId },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to update team');
      }
      toast.success('Team updated');
      setIsEditing(false);
      await loadTeams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update team');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeam) return;
    if (!selectedMemberOption) {
      toast.error('Select a member to add');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/teams/${selectedTeam.id}/members`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-org-id': orgId },
        body: JSON.stringify({ userId: selectedMemberOption.value }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to add member');
      }
      toast.success('Member added');
      setSelectedMemberOption(null);
      await loadTeams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const handleInviteToOrg = async (teamId?: string | null) => {
    if (!canInvite) {
      toast.error('Only owners can invite members');
      return;
    }
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error('Email is required');
      return;
    }
    setInviting(true);
    try {
      const payloadBody: Record<string, unknown> = { email, role: 'user' };
      if (teamId) {
        payloadBody.teamId = teamId;
      }
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-org-id': orgId },
        body: JSON.stringify(payloadBody),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to invite member');
      }
      toast.success(teamId ? 'Invitation sent and team assigned' : 'Invitation sent');
      setInviteEmail('');
      await loadWorkspaceMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to invite member');
    } finally {
      setInviting(false);
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!selectedTeam || !pendingRemovalMember) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/teams/${selectedTeam.id}/members`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-org-id': orgId },
        body: JSON.stringify({ userId: pendingRemovalMember.userId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to remove member');
      }
      toast.success('Member removed from team');
      setPendingRemovalMember(null);
      await loadTeams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove member');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/teams/${selectedTeam.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-org-id': orgId },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to delete team');
      }
      toast.success('Team deleted');
      setShowDeleteTeamModal(false);
      await loadTeams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete team');
    } finally {
      setSaving(false);
    }
  };

  if (!orgId) {
    return (
      <div className="max-w-4xl mx-auto bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">My Teams</h2>
        <p className="text-sm text-slate-600">
          Select a workspace from My Workspaces to manage teams, routing groups, and member
          assignments.
        </p>
        <div className="mt-4">
          <Button size="sm" onClick={() => router.push(getDashboardAccountPath('workspace'))}>
            Go to My Workspaces
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end   justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">My Teams</h2>
          <p className="text-sm text-gray-600 mt-2">
            Teams help you group workspace members for faster sending, routing, and internal review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewMembers ? (
            <Button size="sm"
              inverted
              onClick={() => router.push(`${getDashboardAccountPath('workspace', 'members')}?orgId=${orgId}`)}
            >
              Manage workspace members
            </Button>
          ) : (
            <div className="group relative flex items-center justify-center gap-1">
              <Info className="mr-1 h-3.5 w-3.5 shrink-0" />
              <div className="pointer-events-none absolute top-full right-0 z-20 mt-2 hidden w-72 rounded-md bg-slate-900 p-2 text-xs text-white shadow-lg group-hover:block group-focus-within:block">
                {membersAccessNotice || MEMBERS_VIEW_NOTICE}
              </div>
                <Button size="sm"
                  inverted
                  disabled
                  label='Manage workspace members'
                />                
            </div>
            )}
          {canManage && (
            <Button size="sm" onClick={() => setShowCreatePanel(true)} disabled={teamLimitReached}>
              New team
            </Button>
          )}
        </div>
      </div>

      {!canManage && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          You have read-only access. Only owners and admins can create teams or change memberships.
        </div>
      )}

      {canManage && teamLimitReached && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 text-sm text-sky-800">
          {getWorkspacePlanLabel(workspacePlan)} includes {maxTeams === 1 ? 'one team' : `${maxTeams} teams`}. Upgrade to
          Business Plus to create additional teams.
        </div>
      )}

      {loading ? (
        <div className="bg-white p-6 rounded-lg border shadow-xs">
          <p className="text-gray-600">Loading teams...</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <TeamListPanel
            teams={teams}
            selectedTeamId={selectedTeamId}
            onSelectTeam={setSelectedTeamId}
          />

          <div className="space-y-6">
            {showCreatePanel && canManage && (
              <div className="bg-white p-6 rounded-lg border shadow-xs space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Create a team</h3>
                    <p className="text-sm text-slate-600">Start with a name and optional description.</p>
                    {maxTeams !== null ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Current plan: {getWorkspacePlanLabel(workspacePlan)} · Team limit: {maxTeams}
                      </p>
                    ) : null}
                  </div>
                  <Button size="sm" inverted onClick={() => setShowCreatePanel(false)}>
                    Close
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Team name"
                    id="team-name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Customer Success"
                  />
                  <Input
                    label="Description (optional)"
                    id="team-description"
                    value={newTeamDescription}
                    onChange={(e) => setNewTeamDescription(e.target.value)}
                    placeholder="Handles onboarding and renewals"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" inverted onClick={() => setShowCreatePanel(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleCreateTeam} disabled={creating || teamLimitReached}>
                    {creating ? 'Creating...' : 'Create team'}
                  </Button>
                </div>
              </div>
            )}

            {!selectedTeam && !showCreatePanel && (
              <div className="bg-white p-6 rounded-lg border shadow-xs">
                <p className="text-sm text-slate-600">Select a team to manage members.</p>
              </div>
            )}

            {selectedTeam && (
              <TeamDetailsPanel
                selectedTeam={selectedTeam}
                canManage={canManage}
                canInvite={canInvite}
                saving={saving}
                inviting={inviting}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
                editName={editName}
                editDescription={editDescription}
                onEditNameChange={setEditName}
                onEditDescriptionChange={setEditDescription}
                onSaveTeam={handleSaveTeam}
                onOpenDeleteTeam={() => setShowDeleteTeamModal(true)}
                memberSummary={memberSummary}
                memberOptions={memberOptions}
                selectedMemberOption={selectedMemberOption}
                onSelectedMemberChange={setSelectedMemberOption}
                onAddMember={handleAddMember}
                inviteEmail={inviteEmail}
                onInviteEmailChange={setInviteEmail}
                onInviteToOrg={handleInviteToOrg}
                onRequestRemoveMember={setPendingRemovalMember}
                memberSelectStyles={memberSelectStyles}
              />
            )}
          </div>
        </div>
      )}

      <Modal
        visible={Boolean(pendingRemovalMember)}
        onClose={() => {
          if (!saving) {
            setPendingRemovalMember(null);
          }
        }}
        title="Remove from team"
        className="w-full max-w-lg"
        closeOnBackdrop={!saving}
        handleCancel={() => setPendingRemovalMember(null)}
        handleConfirm={handleConfirmRemoveMember}
        cancelLabel="Keep member"
        confirmLabel={saving ? 'Removing...' : 'Remove from team'}
        cancelDisabled={saving}
        confirmDisabled={saving}
        confirmClass="border-rose-600 bg-rose-600 text-white hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <p className="text-sm leading-6 text-slate-700">
          Remove{' '}
          <span className="font-semibold text-slate-900">
            {pendingRemovalMember?.name || 'this member'}
          </span>{' '}
          from{' '}
          <span className="font-semibold text-slate-900">{selectedTeam?.name || 'this team'}</span>
          ? They will stay in the workspace and can be added back later.
        </p>
      </Modal>

      <Modal
        visible={showDeleteTeamModal}
        onClose={() => {
          if (!saving) {
            setShowDeleteTeamModal(false);
          }
        }}
        title="Delete team"
        className="w-full max-w-lg"
        closeOnBackdrop={!saving}
        handleCancel={() => setShowDeleteTeamModal(false)}
        handleConfirm={handleDeleteTeam}
        cancelLabel="Keep team"
        confirmLabel={saving ? 'Deleting...' : 'Delete team'}
        cancelDisabled={saving}
        confirmDisabled={saving}
        confirmClass="border-rose-600 bg-rose-600 text-white hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <p className="text-sm leading-6 text-slate-700">
          Delete{' '}
          <span className="font-semibold text-slate-900">{selectedTeam?.name || 'this team'}</span>
          ? This will remove all team assignments.
        </p>
      </Modal>
    </>
  );
};

export default MyTeams;
