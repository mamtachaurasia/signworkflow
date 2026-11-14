'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Info, MoreVertical } from 'lucide-react';

import { Button } from '@ui';
import useContextStore from '@/hooks/useContextStore';
import { isAdminRole, isAuditorRole } from '@/lib/role-utils';
import { getDashboardAccountPath } from '@/lib/account-routing';
import { getWorkspacePlanLabel } from '@/lib/pricing';

type WorkspaceApiEntry = {
  orgId: string;
  role: string;
  status: string;
  isPrimary: boolean;
  memberSince?: string;
  org: {
    id: string;
    name: string;
    slug?: string;
    plan: string;
    status: string;
    seatLimit: number;
    trialEndsAt?: string;
    createdAt?: string;
  };
};

type WorkspaceEntry = {
  workspaceId: string;
  workspaceRole: string;
  membershipStatus: string;
  isPrimary: boolean;
  memberSince?: string;
  workspace: WorkspaceApiEntry['org'];
};

function normalizeWorkspaceEntry(entry: WorkspaceApiEntry): WorkspaceEntry {
  return {
    workspaceId: entry.orgId,
    workspaceRole: entry.role,
    membershipStatus: entry.status,
    isPrimary: entry.isPrimary,
    memberSince: entry.memberSince,
    workspace: entry.org,
  };
}

const MyWorkspacesPage = () => {
  const { user, setUser } = useContextStore();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadWorkspaces = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/orgs', { credentials: 'include' });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || 'Failed to load workspaces');
        }
        if (!cancelled) {
          setWorkspaces(
            Array.isArray(payload?.organizations)
              ? payload.organizations.map((entry: WorkspaceApiEntry) => normalizeWorkspaceEntry(entry))
              : []
          );
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load workspaces');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadWorkspaces();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`[data-workspace-menu="${openMenu}"]`)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openMenu]);

  const handleSwitch = async (workspaceId: string) => {
    setSwitchingId(workspaceId);
    try {
      const res = await fetch('/api/orgs', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: workspaceId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to switch workspace');
      }

      setWorkspaces((prev) =>
        prev.map((entry) => ({
          ...entry,
          isPrimary: entry.workspaceId === workspaceId,
        }))
      );

      setUser((prev) => {
        if (!prev) return prev;
        const nextRole = payload?.role || payload?.orgRole || prev.role;
        const nextOrgRole = payload?.orgRole || payload?.role || prev.orgRole;
        return {
          ...prev,
          orgId: workspaceId,
          primaryOrgId: workspaceId,
          role: nextRole,
          orgRole: nextOrgRole,
        };
      });

      toast.success('Workspace switched');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to switch workspace');
    } finally {
      setSwitchingId(null);
    }
  };

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Clipboard access blocked');
    }
  };

  const handleNavigate = (path: string) => {
    setOpenMenu(null);
    router.push(path);
  };

  const sortedWorkspaces = [...workspaces].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.workspace.name.localeCompare(b.workspace.name);
  });

  return (
    <div>
      <div className="mb-6 space-y-3">
        <h2 className="text-2xl font-bold text-gray-800">My Workspaces</h2>
        <p className="text-sm text-gray-600">
          This page shows every workspace you belong to. Your primary workspace is the
          default context for new documents, invites, and billing views. You can switch it anytime.
        </p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
        {loading && <p className="text-gray-600">Loading workspaces...</p>}
        {!loading && workspaces.length === 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">No workspaces found yet.</p>
            <p className="text-sm text-slate-600">
              This account is still in trial mode. When you upgrade or join another invited
              workspace, all of your workspaces will appear here.
            </p>
          </div>
        )}
        {!loading &&
          sortedWorkspaces.map((entry) => {
            const isCurrent = entry.isPrimary || entry.workspaceId === user?.orgId;
            const canViewMembers =
              isAdminRole(entry.workspaceRole) || isAuditorRole(entry.workspaceRole);
            const canManageGovernance = isAdminRole(entry.workspaceRole);
            const planLabel = getWorkspacePlanLabel(entry.workspace.plan);
            return (
              <div
                key={entry.workspaceId}
                className="border border-gray-200 rounded-lg p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{entry.workspace.name}</h3>
                    {isCurrent && (
                      <span className="text-xs uppercase tracking-wide text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                    <span className="text-xs uppercase tracking-wide text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                      {entry.workspaceRole}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Plan: {planLabel} · Seats: {entry.workspace.seatLimit} · Status: {entry.workspace.status}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {entry.workspace.slug ? <span>Slug: {entry.workspace.slug}</span> : null}
                    {entry.workspace.slug ? <span aria-hidden="true">·</span> : null}
                    <span>Workspace ID: {entry.workspace.id}</span>
                    <span
                      className="inline-flex items-center text-gray-400"
                      title="Slug is a human-friendly identifier used in URLs. Workspace ID is the immutable unique identifier used internally."
                    >
                      <Info className="h-3.5 w-3.5" />
                    </span>
                    {entry.workspace.createdAt ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Created: {new Date(entry.workspace.createdAt).toLocaleDateString()}</span>
                      </>
                    ) : null}
                    {entry.memberSince ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Member since: {new Date(entry.memberSince).toLocaleDateString()}</span>
                      </>
                    ) : null}
                    {entry.workspace.trialEndsAt ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Trial ends: {new Date(entry.workspace.trialEndsAt).toLocaleDateString()}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="relative" data-workspace-menu={entry.workspaceId}>
                  <Button size="sm"
                    type="button"
                    inverted
                    icon={<MoreVertical className="h-4 w-4" />}
                    label="Actions"
                    onClick={() =>
                      setOpenMenu((prev) => (prev === entry.workspaceId ? null : entry.workspaceId))
                    }
                  />
                  {openMenu === entry.workspaceId && (
                    <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg z-20 origin-top-right">
                      <div className="py-1">
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          onClick={() => handleSwitch(entry.workspaceId)}
                          disabled={isCurrent || switchingId === entry.workspaceId}
                        >
                          {isCurrent ? 'Primary (current)' : 'Make Primary'}
                        </button>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => handleCopy(entry.workspace.id, 'Workspace ID')}
                        >
                          Copy Workspace ID
                        </button>
                        {entry.workspace.slug ? (
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => handleCopy(entry.workspace.slug ?? '', 'Slug')}
                          >
                            Copy Slug
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => handleNavigate(getDashboardAccountPath('audit-trail'))}
                        >
                          View Audit Trail
                        </button>
                        {canViewMembers ? (
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              handleNavigate(
                                `${getDashboardAccountPath('workspace', 'members')}?orgId=${entry.workspaceId}`
                              )
                            }
                          >
                            Manage Members
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() =>
                            handleNavigate(`${getDashboardAccountPath('my-teams')}?orgId=${entry.workspaceId}`)
                          }
                        >
                          View Teams
                        </button>
                        {canManageGovernance ? (
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => handleNavigate(getDashboardAccountPath('admin-governance'))}
                          >
                            Admin Governance
                          </button>
                        ) : null}
                      </div>
                      <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500 flex items-start gap-2">
                        <Info className="mt-0.5 h-3.5 w-3.5" />
                        Primary workspace is the default context for new documents, invites, and billing views.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default MyWorkspacesPage;
