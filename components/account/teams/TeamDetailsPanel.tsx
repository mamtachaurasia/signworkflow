'use client';

import type { SingleValue, StylesConfig } from 'react-select';
import Select from 'react-select';
import { Trash2 } from 'lucide-react';

import { Button, SaveButton } from '@ui';
import { Input } from '@ui';

import type {
  MemberSelectOption,
  MemberSummary,
  PendingRemovalMember,
  TeamEntry,
} from './types';

type TeamDetailsPanelProps = {
  selectedTeam: TeamEntry;
  canManage: boolean;
  canInvite: boolean;
  saving: boolean;
  inviting: boolean;
  isEditing: boolean;
  setIsEditing: (updater: (previous: boolean) => boolean) => void;
  editName: string;
  editDescription: string;
  onEditNameChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onSaveTeam: () => void;
  onOpenDeleteTeam: () => void;
  memberSummary: MemberSummary;
  memberOptions: MemberSelectOption[];
  selectedMemberOption: MemberSelectOption | null;
  onSelectedMemberChange: (option: MemberSelectOption | null) => void;
  onAddMember: () => void;
  inviteEmail: string;
  onInviteEmailChange: (value: string) => void;
  onInviteToOrg: (teamId?: string | null) => void;
  onRequestRemoveMember: (member: PendingRemovalMember) => void;
  memberSelectStyles: StylesConfig<MemberSelectOption, false>;
};

export default function TeamDetailsPanel({
  selectedTeam,
  canManage,
  canInvite,
  saving,
  inviting,
  isEditing,
  setIsEditing,
  editName,
  editDescription,
  onEditNameChange,
  onEditDescriptionChange,
  onSaveTeam,
  onOpenDeleteTeam,
  memberSummary,
  memberOptions,
  selectedMemberOption,
  onSelectedMemberChange,
  onAddMember,
  inviteEmail,
  onInviteEmailChange,
  onInviteToOrg,
  onRequestRemoveMember,
  memberSelectStyles,
}: TeamDetailsPanelProps) {
  return (
    <div className="bg-white p-6 rounded-lg border shadow-xs space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{selectedTeam.name}</h3>
          <p className="text-sm text-slate-600">
            {selectedTeam.description || 'No description provided.'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Members: {selectedTeam.memberCount}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" inverted onClick={() => setIsEditing((prev) => !prev)}>
              {isEditing ? 'Cancel edit' : 'Edit team'}
            </Button>
            <Button size="sm" inverted onClick={onOpenDeleteTeam} disabled={saving}>
              Delete team
            </Button>
          </div>
        )}
      </div>

      {canManage && isEditing && (
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Team name"
            id="edit-team-name"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
          />
          <Input
            label="Description"
            id="edit-team-description"
            value={editDescription}
            onChange={(e) => onEditDescriptionChange(e.target.value)}
          />
          <div className="md:col-span-2 flex justify-end">
            <SaveButton onClick={onSaveTeam} saving={saving} />
          </div>
        </div>
      )}

      <div className="border-t pt-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">Team members</h4>
            <p className="text-xs text-slate-500">
              Members must be active in the workspace before they can join a team.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Active: {memberSummary.active} · Invited: {memberSummary.invited} · Disabled: {memberSummary.disabled}
          </div>
        </div>

        {canManage && (
          <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
            <div className="space-y-2">
              <label className="text-sm text-gray-600">Find member</label>
              <Select<MemberSelectOption, false>
                inputId="team-member-search"
                instanceId="team-member-search"
                options={memberOptions}
                value={selectedMemberOption}
                onChange={(option: SingleValue<MemberSelectOption>) =>
                  onSelectedMemberChange(option ?? null)
                }
                placeholder={
                  memberOptions.length > 0
                    ? 'Type a name or email'
                    : 'No active members available'
                }
                isClearable
                isDisabled={saving || memberOptions.length === 0}
                styles={memberSelectStyles}
                formatOptionLabel={(option) => (
                  <div className="py-0.5">
                    <div className="text-sm font-medium text-slate-900">{option.member.name}</div>
                    <div className="text-xs text-slate-500">{option.member.email}</div>
                  </div>
                )}
              />
            </div>
            <Button size="sm" onClick={onAddMember} disabled={saving || !selectedMemberOption}>
              Add
            </Button>
          </div>
        )}

        {canManage && memberOptions.length === 0 && (
          <p className="text-xs text-slate-500">
            No available active members to add. Invite someone to the workspace or wait for pending
            invites to accept.
          </p>
        )}

        {canManage && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div>
              <h5 className="text-sm font-semibold text-slate-700">Invite to this team</h5>
              <p className="text-xs text-slate-500">
                Invite a new teammate and they will be added to this team automatically once created.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[220px]">
                <Input
                  label="Email"
                  id="invite-email"
                  value={inviteEmail}
                  onChange={(e) => onInviteEmailChange(e.target.value)}
                  placeholder="teammate@example.com"
                />
              </div>
              <Button size="sm" onClick={() => onInviteToOrg(selectedTeam.id)} disabled={inviting || !canInvite}>
                {inviting ? 'Inviting...' : 'Send invite'}
              </Button>
            </div>
            {!canInvite && (
              <p className="text-xs text-amber-700">
                Only owners can send invitations. Ask an owner to invite this member.
              </p>
            )}
          </div>
        )}

        {selectedTeam.members.length === 0 ? (
          <p className="text-sm text-slate-500">No members added yet.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Removing someone here only takes them out of this team. It does not remove them from the workspace.
            </p>
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Org role</th>
                    <th className="px-3 py-2">Status</th>
                    {canManage && <th className="px-3 py-2 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {selectedTeam.members.map((member) => (
                    <tr key={member.userId}>
                      <td className="px-3 py-2 font-medium">{member.name}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{member.email}</td>
                      <td className="px-3 py-2 text-xs uppercase tracking-wide text-slate-600">{member.role}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{member.status}</td>
                      {canManage && (
                        <td className="px-3 py-2 text-right">
                          <Button size="sm"
                            inverted
                            icon={<Trash2 size={14} />}
                            className="text-rose-600 hover:bg-rose-50!"
                            onClick={() =>
                              onRequestRemoveMember({
                                userId: member.userId,
                                name: member.name,
                              })
                            }
                            disabled={saving}
                            label="Remove from team"
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
