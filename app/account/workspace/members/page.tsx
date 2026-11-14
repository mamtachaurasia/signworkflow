'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

import { Button, SaveButton } from '@ui';
import { Modal } from '@ui';
import { Input } from '@ui';
import useContextStore from '@/hooks/useContextStore';
import { isOwnerRole } from '@/lib/role-utils';
import { getDashboardAccountPath } from '@/lib/account-routing';
import {
  DirectoryRequestError,
  fetchWorkspaceMembers,
  type WorkspaceMemberEntry,
  type WorkspaceSummary,
} from '@/lib/workspace-directory-client';
import { getWorkspacePlanLabel } from '@/lib/pricing';
import { Select } from '@ui';

type WorkspaceDetails = WorkspaceSummary;
type MemberEntry = WorkspaceMemberEntry;

type MemberRoleOption = 'user' | 'admin' | 'owner' | 'auditor';
type MemberStatusOption = 'active' | 'disabled';

const MEMBERS_PERMISSION_MESSAGE = 'Only owners, admins, and auditors can view workspace members.';
const MEMBER_ROLE_OPTIONS: MemberRoleOption[] = ['user', 'admin', 'owner', 'auditor'];

function buildMemberRoleDrafts(members: MemberEntry[]) {
  const nextDrafts: Record<string, MemberRoleOption> = {};
  members.forEach((member) => {
    nextDrafts[member.userId] = MEMBER_ROLE_OPTIONS.includes(member.role as MemberRoleOption)
      ? (member.role as MemberRoleOption)
      : 'user';
  });
  return nextDrafts;
}

export default function WorkspaceMembersPage() {
  const { user } = useContextStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceIdParam = searchParams.get('orgId') || '';
  const transferOwnershipMode = searchParams.get('action') === 'transfer-ownership';
  const selectedWorkspaceId = workspaceIdParam || user?.orgId || '';

  const [workspace, setWorkspace] = useState<WorkspaceDetails | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [savingMemberRoleId, setSavingMemberRoleId] = useState<string | null>(null);
  const [savingMemberStatusId, setSavingMemberStatusId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRoleOption>('user');
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, MemberRoleOption>>({});
  const [pendingStatusMember, setPendingStatusMember] = useState<MemberEntry | null>(null);
  const [pendingRemovalMember, setPendingRemovalMember] = useState<MemberEntry | null>(null);

  const canManage = isOwnerRole(workspaceRole);
  const pendingStatusValue: MemberStatusOption | null = pendingStatusMember
    ? pendingStatusMember.status === 'disabled'
      ? 'active'
      : 'disabled'
    : null;

  const seatUsage = useMemo(() => {
    const activeCount = members.filter((member) => member.status === 'active').length;
    const invitedCount = members.filter((member) => member.status === 'invited').length;
    const disabledCount = members.filter((member) => member.status === 'disabled').length;
    return { activeCount, invitedCount, disabledCount };
  }, [members]);

  const applyMembersPayload = useCallback((payload: Awaited<ReturnType<typeof fetchWorkspaceMembers>>) => {
    setWorkspace(payload.workspace);
    setWorkspaceRole(payload.workspaceRole);
    setMembers(payload.members);
    setMemberRoleDrafts(buildMemberRoleDrafts(payload.members));
  }, []);

  const refreshMembers = useCallback(async () => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      const payload = await fetchWorkspaceMembers(selectedWorkspaceId);
      applyMembersPayload(payload);
    } catch {
      // Ignore refresh errors.
    }
  }, [applyMembersPayload, selectedWorkspaceId]);

  useEffect(() => {
    if (transferOwnershipMode) {
      setInviteRole('owner');
    }
  }, [transferOwnershipMode]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadMembers = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchWorkspaceMembers(selectedWorkspaceId);
        if (cancelled) {
          return;
        }
        applyMembersPayload(payload);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof DirectoryRequestError && error.status === 403
              ? MEMBERS_PERMISSION_MESSAGE
              : error instanceof Error
                ? error.message
                : 'Failed to load members';
          const status = error instanceof DirectoryRequestError ? error.status : null;
          setError(message);
          if (status !== 401 && status !== 403 && status !== 404) {
            toast.error(message, { id: 'workspace-members-load-error' });
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [applyMembersPayload, selectedWorkspaceId]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    setInviting(true);
    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': selectedWorkspaceId,
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to invite member');
      }
      toast.success('Invitation sent');
      setInviteEmail('');
      await refreshMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to invite member');
    } finally {
      setInviting(false);
    }
  };

  const handleMemberRoleUpdate = async (member: MemberEntry) => {
    const nextRole = memberRoleDrafts[member.userId] || 'user';
    if (nextRole === member.role) {
      return;
    }

    setSavingMemberRoleId(member.userId);
    try {
      const res = await fetch('/api/admin/users/promote', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': selectedWorkspaceId,
        },
        body: JSON.stringify({ userId: member.userId, role: nextRole }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to update role');
      }
      toast.success(`Role updated for ${member.name}`);
      await refreshMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update role');
    } finally {
      setSavingMemberRoleId(null);
    }
  };

  const handleMemberStatusUpdate = async () => {
    if (!pendingStatusMember || !pendingStatusValue) {
      return;
    }

    setSavingMemberStatusId(pendingStatusMember.userId);
    try {
      const res = await fetch(`/api/orgs/members/${pendingStatusMember.userId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': selectedWorkspaceId,
        },
        body: JSON.stringify({ status: pendingStatusValue }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to update workspace access');
      }
      toast.success(
        pendingStatusValue === 'disabled'
          ? `Workspace access disabled for ${pendingStatusMember.name}`
          : `Workspace access restored for ${pendingStatusMember.name}`
      );
      setPendingStatusMember(null);
      await refreshMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update workspace access');
    } finally {
      setSavingMemberStatusId(null);
    }
  };

  const handleMemberRemoval = async () => {
    if (!pendingRemovalMember) {
      return;
    }

    setRemovingMemberId(pendingRemovalMember.userId);
    try {
      const res = await fetch(`/api/orgs/members/${pendingRemovalMember.userId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'x-org-id': selectedWorkspaceId,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to remove workspace member');
      }
      toast.success(`Removed ${pendingRemovalMember.name} from the workspace`);
      setPendingRemovalMember(null);
      await refreshMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove workspace member');
    } finally {
      setRemovingMemberId(null);
    }
  };

  if (!selectedWorkspaceId) {
    return (
      <div className="max-w-4xl mx-auto bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Workspace Members</h2>
        <p className="text-sm text-slate-600">
          Select a workspace from My Workspaces to manage its members.
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
    <div className="mx-auto space-y-6">
      <div className="bg-white border rounded-lg p-6 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Workspace Members</h2>
            <p className="text-sm text-slate-600">
              Manage people who have access to this workspace and their roles.
            </p>
          </div>
          <Button size="sm" inverted onClick={() => router.push(getDashboardAccountPath('workspace'))}>
            Back
          </Button>
        </div>
        {workspace && (
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{workspace.name}</span>
            {workspace.slug ? ` · ${workspace.slug}` : ''} · Plan: {getWorkspacePlanLabel(workspace.plan)} · Seats: {seatUsage.activeCount}/{workspace.seatLimit} ·
            Status: {workspace.status}
          </div>
        )}
      </div>

      {loading && (
        <div className="bg-white border rounded-lg p-6">
          <p className="text-sm text-slate-600">Loading members...</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {!loading && !error && workspaceRole && !isOwnerRole(workspaceRole) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          You have read-only access. Only owners can invite members or update roles.
        </div>
      )}

      {!loading && !error && canManage && transferOwnershipMode && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <h3 className="text-sm font-semibold text-sky-900">Transfer ownership to delete your account</h3>
          <p className="mt-1 text-sm leading-6 text-sky-800">
            Invite a trusted person as Owner, or change an existing active member&apos;s role to Owner and save it.
            After another owner is active, return to Settings and delete your account.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              type="button"
              onClick={() => setInviteRole('owner')}
            >
              Invite new owner
            </Button>
            <Button
              size="sm"
              type="button"
              inverted
              onClick={() => router.push(getDashboardAccountPath('settings'))}
            >
              Back to Settings
            </Button>
          </div>
        </div>
      )}

      {!loading && !error && canManage && (
        <div className="bg-white border rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-md font-semibold text-slate-900">Invite members</h3>
            <p className="text-sm text-slate-600">
              Invite new members to this workspace. Existing member roles can be changed in the member list below.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              label="User email"
              id="member-email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
            />
            <div className="space-y-2">
              <label className="text-sm text-gray-600">Invite as</label>
              <Select
                className="w-full rounded-sm border px-3 py-2 bg-white mt-1.5"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRoleOption)}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
                <option value="auditor">Auditor</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleInvite} disabled={inviting}>
              {inviting ? 'Inviting...' : 'Invite member'}
            </Button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border rounded-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-md font-semibold text-slate-900">Member list</h3>
              <p className="text-xs text-slate-500">
                Status shows workspace access. Team membership is listed separately, so removing someone from a team
                does not change their workspace status.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              Active: {seatUsage.activeCount} · Invited: {seatUsage.invitedCount} · Disabled: {seatUsage.disabledCount}
            </span>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-slate-600">No members found.</p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Teams</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Joined</th>
                    <th className="px-3 py-2">Updated</th>
                    {canManage && <th className="px-3 py-2 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {members.map((member) => (
                    <tr key={member.userId}>
                      <td className="px-3 py-2 font-medium">{member.name}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{member.email}</td>
                      <td className="px-3 py-2">
                        {canManage ? (
                          <Select
                            className="w-full min-w-[80px] rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-xs uppercase tracking-wide text-slate-700"
                            value={memberRoleDrafts[member.userId] || 'user'}
                            onChange={(e) =>
                              setMemberRoleDrafts((prev) => ({
                                ...prev,
                                [member.userId]: e.target.value as MemberRoleOption,
                              }))
                            }
                            disabled={savingMemberRoleId === member.userId}
                          >
                            {MEMBER_ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs uppercase tracking-wide text-slate-600">{member.role}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {member.teams.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {member.teams.slice(0, 2).map((team) => (
                                <span
                                  key={team.id}
                                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                >
                                  {team.name}
                                </span>
                              ))}
                              {member.teams.length > 2 && (
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  +{member.teams.length - 2} more
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {member.teams.length} {member.teams.length === 1 ? 'team' : 'teams'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No teams</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{member.status}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {member.updatedAt ? new Date(member.updatedAt).toLocaleDateString() : '—'}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <SaveButton
                              onClick={() => handleMemberRoleUpdate(member)}
                              className='text-xs'
                              label="Save role"
                              saving={savingMemberRoleId === member.userId}
                              disabled={
                                savingMemberRoleId !== null ||
                                savingMemberStatusId !== null ||
                                removingMemberId !== null ||
                                (memberRoleDrafts[member.userId] || member.role) === member.role
                              }
                            />
                            <Button size="sm"
                              inverted
                              className={`text-xs ${
                                member.status === 'disabled'
                                  ? ''
                                  : 'text-rose-600 hover:bg-rose-50!'
                              }`}
                              onClick={() => setPendingStatusMember(member)}
                              disabled={
                                savingMemberRoleId !== null ||
                                savingMemberStatusId !== null ||
                                removingMemberId !== null ||
                                member.userId === user?.id
                              }
                            >
                              {member.status === 'disabled'
                                ? 'Restore access'
                                : member.userId === user?.id
                                  ? 'Your access'
                                  : 'Disable access'}
                            </Button>
                            {member.status === 'disabled' && (
                              <Button size="sm"
                                inverted
                                className="text-rose-600 hover:bg-rose-50! text-xs"
                                onClick={() => setPendingRemovalMember(member)}
                                disabled={
                                  savingMemberRoleId !== null ||
                                  savingMemberStatusId !== null ||
                                  removingMemberId !== null ||
                                  member.userId === user?.id
                                }
                              >
                                Remove from workspace
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        visible={Boolean(pendingStatusMember)}
        onClose={() => {
          if (!savingMemberStatusId) {
            setPendingStatusMember(null);
          }
        }}
        title={pendingStatusValue === 'disabled' ? 'Disable workspace access' : 'Restore workspace access'}
        className="w-full max-w-lg"
        closeOnBackdrop={!savingMemberStatusId}
        handleCancel={() => setPendingStatusMember(null)}
        handleConfirm={handleMemberStatusUpdate}
        cancelLabel={pendingStatusValue === 'disabled' ? 'Keep access' : 'Cancel'}
        confirmLabel={
          savingMemberStatusId
            ? pendingStatusValue === 'disabled'
              ? 'Disabling...'
              : 'Restoring...'
            : pendingStatusValue === 'disabled'
              ? 'Disable access'
              : 'Restore access'
        }
        cancelDisabled={Boolean(savingMemberStatusId)}
        confirmDisabled={Boolean(savingMemberStatusId)}
        confirmClass={
          pendingStatusValue === 'disabled'
            ? 'border-rose-600 bg-rose-600 text-white hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60'
            : undefined
        }
      >
        <p className="text-sm leading-6 text-slate-700">
          {pendingStatusValue === 'disabled' ? 'Disable' : 'Restore'} workspace access for{' '}
          <span className="font-semibold text-slate-900">{pendingStatusMember?.name || 'this member'}</span>?
          {pendingStatusValue === 'disabled'
            ? ' They will still appear in the member list and keep their team assignments, but they will not be able to access this workspace.'
            : ' They will be able to access this workspace again with their existing role and team assignments.'}
        </p>
      </Modal>

      <Modal
        visible={Boolean(pendingRemovalMember)}
        onClose={() => {
          if (!removingMemberId) {
            setPendingRemovalMember(null);
          }
        }}
        title="Remove from workspace"
        className="w-full max-w-lg"
        closeOnBackdrop={!removingMemberId}
        handleCancel={() => setPendingRemovalMember(null)}
        handleConfirm={handleMemberRemoval}
        cancelLabel="Keep member"
        confirmLabel={removingMemberId ? 'Removing...' : 'Remove from workspace'}
        cancelDisabled={Boolean(removingMemberId)}
        confirmDisabled={Boolean(removingMemberId)}
        confirmClass="border-rose-600 bg-rose-600 text-white hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <p className="text-sm leading-6 text-slate-700">
          Remove <span className="font-semibold text-slate-900">{pendingRemovalMember?.name || 'this member'}</span>{' '}
          from the workspace? This removes their workspace membership and all team assignments for this
          workspace. Their account is not deleted from the platform.
        </p>
      </Modal>
    </div>
  );
}
