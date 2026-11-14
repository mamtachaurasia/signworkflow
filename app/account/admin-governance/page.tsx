'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { Input } from '@ui';
import { Textarea } from '@ui';
import { Button, SaveButton } from '@ui';
import Brand from '@/components/Brand';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from '@/lib/workspace-settings';
import useContextStore from '@/hooks/useContextStore';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { isAdminRole, isOwnerRole } from '@/lib/role-utils';
import { getRequiredTierLabelForFeature } from '@/lib/subscription-plans';
import { getCookieValue } from '@/utils/cookies';
import { Select } from '@ui';

type RetentionPolicy = {
  _id: string;
  name: string;
  docType?: string;
  jurisdiction?: string;
  triggerEvent?: string;
  durationDays?: number;
  priority?: number;
  regime?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type LegalHold = {
  _id: string;
  name: string;
  reason?: string;
  status?: 'active' | 'released';
  documentIds?: string[];
  criteria?: {
    docTypes?: string[];
    jurisdictions?: string[];
    statuses?: string[];
    userIds?: string[];
    createdAfter?: string;
    createdBefore?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  releasedAt?: string;
};

const triggerOptions = [
  { value: 'createdAt', label: 'Created' },
  { value: 'completedAt', label: 'Completed' },
  { value: 'finalizedAt', label: 'Finalized' },
  { value: 'expiresAt', label: 'Expires' },
  { value: 'custom', label: 'Custom Trigger' },
];

const durationUnits = [
  { value: 'days', label: 'Days' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
];

const parseCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export default function AdminGovernancePage() {
  const { user } = useContextStore();
  const isAdmin = isAdminRole(user?.role) || isAdminRole(user?.orgRole);
  const isOwner = useMemo(() => isOwnerRole(user?.role) || isOwnerRole(user?.orgRole), [user?.orgRole, user?.role]);
  const { status: subscriptionStatus, loading: subscriptionLoading } = useSubscriptionStatus({ enabled: true });
  const hasPlanAccess = subscriptionStatus.entitlements.adminGovernance;
  const hasLegalHoldAccess = subscriptionStatus.entitlements.legalHolds;
  const canViewAdmin = useMemo(
    () => isAdmin && hasPlanAccess && Boolean(user?.orgId),
    [hasPlanAccess, isAdmin, user?.orgId]
  );
  const {
    settings: loadedWorkspaceSettings,
    workspaceName,
    refresh: refreshWorkspaceSettings,
  } = useWorkspaceSettings({
    enabled: canViewAdmin && Boolean(user?.orgId),
    orgId: user?.orgId ?? null,
  });

  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [holds, setHolds] = useState<LegalHold[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [holdsLoading, setHoldsLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [holdSaving, setHoldSaving] = useState(false);
  const [holdReleasingId, setHoldReleasingId] = useState<string | null>(null);

  const [policyName, setPolicyName] = useState('');
  const [policyDocType, setPolicyDocType] = useState('');
  const [policyJurisdiction, setPolicyJurisdiction] = useState('');
  const [policyTrigger, setPolicyTrigger] = useState('completedAt');
  const [policyDuration, setPolicyDuration] = useState('7');
  const [policyDurationUnit, setPolicyDurationUnit] = useState('years');
  const [policyPriority, setPolicyPriority] = useState('0');
  const [policyRegime, setPolicyRegime] = useState('');
  const [policyActive, setPolicyActive] = useState(true);

  const [holdName, setHoldName] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdDocumentIds, setHoldDocumentIds] = useState('');
  const [holdDocTypes, setHoldDocTypes] = useState('');
  const [holdJurisdictions, setHoldJurisdictions] = useState('');
  const [holdStatuses, setHoldStatuses] = useState('');
  const [holdCreatedAfter, setHoldCreatedAfter] = useState('');
  const [holdCreatedBefore, setHoldCreatedBefore] = useState('');

  const [roleEmail, setRoleEmail] = useState('');
  const [roleSelection, setRoleSelection] = useState<'user' | 'admin' | 'owner' | 'auditor'>('admin');
  const [roleSaving, setRoleSaving] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [systemSettings, setSystemSettings] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [systemSettingsSaving, setSystemSettingsSaving] = useState(false);
  const hasCustomBrandName = Boolean(systemSettings.branding.brandName.trim());
  const hasCustomBrandColor =
    systemSettings.branding.primaryColor !== DEFAULT_WORKSPACE_SETTINGS.branding.primaryColor;

  useEffect(() => {
    if (!canViewAdmin) return;
    let cancelled = false;

    const loadPolicies = async () => {
      setPoliciesLoading(true);
      try {
        const res = await fetch('/api/retention/policies', { credentials: 'include' });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || 'Failed to load retention policies');
        }
        if (!cancelled) {
          setPolicies(Array.isArray(payload?.policies) ? payload.policies : []);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load retention policies');
        }
      } finally {
        if (!cancelled) setPoliciesLoading(false);
      }
    };

    const loadHolds = async () => {
      setHoldsLoading(true);
      try {
        const res = await fetch('/api/retention/holds', { credentials: 'include' });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.message || 'Failed to load legal holds');
        }
        if (!cancelled) {
          setHolds(Array.isArray(payload?.holds) ? payload.holds : []);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load legal holds');
        }
      } finally {
        if (!cancelled) setHoldsLoading(false);
      }
    };

    loadPolicies();
    if (hasLegalHoldAccess) {
      loadHolds();
    } else if (!cancelled) {
      setHolds([]);
      setHoldsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [canViewAdmin, hasLegalHoldAccess]);

  useEffect(() => {
    if (!canViewAdmin) return;
    setSystemSettings(loadedWorkspaceSettings);
  }, [canViewAdmin, loadedWorkspaceSettings]);

  const handleCreatePolicy = async () => {
    if (!policyName.trim()) {
      toast.error('Policy name is required');
      return;
    }
    const durationValue = Number(policyDuration);
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      toast.error('Duration must be a positive number');
      return;
    }

    setPolicySaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: policyName.trim(),
        docType: policyDocType.trim() || '*',
        jurisdiction: policyJurisdiction.trim() || '*',
        triggerEvent: policyTrigger,
        active: policyActive,
      };

      if (policyDurationUnit === 'days') payload.durationDays = durationValue;
      if (policyDurationUnit === 'months') payload.durationMonths = durationValue;
      if (policyDurationUnit === 'years') payload.durationYears = durationValue;

      const priorityValue = Number(policyPriority);
      if (Number.isFinite(priorityValue)) payload.priority = priorityValue;
      if (policyRegime.trim()) payload.regime = policyRegime.trim();

      const res = await fetch('/api/retention/policies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to create policy');
      }
      toast.success('Policy created');
      setPolicyName('');
      setPolicyDocType('');
      setPolicyJurisdiction('');
      setPolicyRegime('');
      setPolicyPriority('0');
      setPolicyDuration('7');
      setPolicyDurationUnit('years');
      setPolicyTrigger('completedAt');

      setPolicies((prev) => [data.policy, ...prev].filter(Boolean));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create policy');
    } finally {
      setPolicySaving(false);
    }
  };

  const handleCreateHold = async () => {
    if (!holdName.trim()) {
      toast.error('Hold name is required');
      return;
    }

    const documentIds = parseCsv(holdDocumentIds);
    const criteria: Record<string, unknown> = {};
    const docTypes = parseCsv(holdDocTypes);
    const jurisdictions = parseCsv(holdJurisdictions);
    const statuses = parseCsv(holdStatuses);

    if (docTypes.length) criteria.docTypes = docTypes;
    if (jurisdictions.length) criteria.jurisdictions = jurisdictions;
    if (statuses.length) criteria.statuses = statuses;
    if (holdCreatedAfter) criteria.createdAfter = holdCreatedAfter;
    if (holdCreatedBefore) criteria.createdBefore = holdCreatedBefore;

    if (!documentIds.length && Object.keys(criteria).length === 0) {
      toast.error('Provide document IDs or criteria to apply the hold');
      return;
    }

    setHoldSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: holdName.trim(),
        reason: holdReason.trim() || undefined,
      };
      if (documentIds.length) payload.documentIds = documentIds;
      if (Object.keys(criteria).length > 0) payload.criteria = criteria;

      const res = await fetch('/api/retention/holds', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to apply legal hold');
      }
      toast.success('Legal hold applied');
      setHoldName('');
      setHoldReason('');
      setHoldDocumentIds('');
      setHoldDocTypes('');
      setHoldJurisdictions('');
      setHoldStatuses('');
      setHoldCreatedAfter('');
      setHoldCreatedBefore('');

      const refreshed = await fetch('/api/retention/holds', { credentials: 'include' });
      const refreshedPayload = await refreshed.json().catch(() => ({}));
      if (refreshed.ok && Array.isArray(refreshedPayload?.holds)) {
        setHolds(refreshedPayload.holds);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply legal hold');
    } finally {
      setHoldSaving(false);
    }
  };

  const handleReleaseHold = async (holdId: string) => {
    if (!holdId) return;
    setHoldReleasingId(holdId);
    try {
      const res = await fetch(`/api/retention/holds/${holdId}/release`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to release hold');
      }
      toast.success('Legal hold released');
      setHolds((prev) =>
        prev.map((hold) => (hold._id === holdId ? { ...hold, status: 'released' } : hold))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to release hold');
    } finally {
      setHoldReleasingId(null);
    }
  };

  const handleRoleUpdate = async () => {
    const email = roleEmail.trim().toLowerCase();
    if (!email) {
      toast.error('User email is required');
      return;
    }

    setRoleSaving(true);
    try {
      const res = await fetch('/api/admin/users/promote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: roleSelection }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to update role');
      }
      toast.success(payload?.unchanged ? 'Role already set' : 'Role updated');
      setRoleEmail('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update role');
    } finally {
      setRoleSaving(false);
    }
  };

  const handleInviteUser = async () => {
    const email = roleEmail.trim().toLowerCase();
    if (!email) {
      toast.error('User email is required');
      return;
    }

    setInviteSaving(true);
    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: roleSelection }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to invite user');
      }
      toast.success('Invitation sent');
      setRoleEmail('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to invite user');
    } finally {
      setInviteSaving(false);
    }
  };

  const updateSystemSettings = <Section extends keyof WorkspaceSettings>(
    section: Section,
    updates: Partial<WorkspaceSettings[Section]>
  ) => {
    setSystemSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        ...updates,
      },
    }));
  };

  const handleSaveSystemSettings = async () => {
    setSystemSettingsSaving(true);
    try {
      const csrfToken = getCookieValue('csrf_token');
      const res = await fetch('/api/orgs/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify(systemSettings),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to save system preferences');
      }
      toast.success('System preferences saved');
      setSystemSettings(payload?.settings ?? systemSettings);
      await refreshWorkspaceSettings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save system preferences');
    } finally {
      setSystemSettingsSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Admin Governance</h2>
        <p className="text-sm text-slate-600">
          You do not have access to governance controls. Please contact your system administrator.
        </p>
      </div>
    );
  }

  if (!user?.orgId) {
    return (
      <div className="max-w-4xl mx-auto bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Admin Governance</h2>
        <p className="text-sm text-slate-600">
          Admin Governance becomes available once this account is attached to a workspace.
        </p>
      </div>
    );
  }

  if (subscriptionLoading) {
    return (
      <div className="max-w-4xl mx-auto bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Admin Governance</h2>
        <p className="text-sm text-slate-600">Loading governance access for the current workspace...</p>
      </div>
    );
  }

  if (!hasPlanAccess) {
    return (
      <div className="max-w-4xl mx-auto bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Admin Governance</h2>
        <p className="text-sm text-slate-600">
          {getRequiredTierLabelForFeature('admin_governance')} is required for governance controls like
          retention policies, workspace branding, and default system preferences.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-6">
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900">Admin Governance</h2>
        <p className="text-sm text-slate-600 mt-1">
          Manage retention policies, legal holds, and system preferences for all documents.
        </p>
      </div>

      {isOwner && (
        <div className="bg-white border rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-md font-semibold text-slate-900">Role Management</h3>
            <p className="text-sm text-slate-600">
              Invite new users or change roles for existing accounts. Invitations send a set-password link.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              label="User email"
              id="role-email"
              value={roleEmail}
              onChange={(e) => setRoleEmail(e.target.value)}
              placeholder="user@example.com"
            />
            <label className="font-medium text-sm text-slate-700">Role
              <Select
                className="w-full rounded-sm border px-3 py-2 bg-white mt-1.5"
                value={roleSelection}
                onChange={(e) => setRoleSelection(e.target.value as 'user' | 'admin' | 'owner' | 'auditor')}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
                <option value="auditor">Auditor</option>
              </Select>
            </label>
          </div>
          <div className="flex justify-end">
            <div className="flex gap-2">
              <Button size="sm" inverted onClick={handleInviteUser} disabled={inviteSaving || roleSaving}>
                {inviteSaving ? 'Inviting...' : 'Invite user'}
              </Button>
              <Button size="sm" onClick={handleRoleUpdate} disabled={roleSaving || inviteSaving}>
                {roleSaving ? 'Updating...' : 'Update role'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="text-md font-semibold text-slate-900">Retention Policies</h3>
          <p className="text-sm text-slate-600">
            Policies apply across documents. Use doc type and jurisdiction to target subsets.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          
            <Input
              label="Policy name"
              id="policy-name"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              placeholder="e.g., Default 7 year retention"
            />
          
        
            <Input
              label="Regime (optional)"
              id="policy-regime"
              value={policyRegime}
              onChange={(e) => setPolicyRegime(e.target.value)}
              placeholder="e.g., SEC 17a-4"
            />
          
        
            <Input
              label="Document type (optional)"
              id="policy-docType"
              value={policyDocType}
              onChange={(e) => setPolicyDocType(e.target.value)}
              placeholder="Use * for all"
            />
          
          
            <Input
              label="Jurisdiction (optional)"
              id="policy-jurisdiction"
              value={policyJurisdiction}
              onChange={(e) => setPolicyJurisdiction(e.target.value)}
              placeholder="Use * for all"
            />
          
           <label className="font-medium text-sm text-slate-700">
            Trigger event
            <Select
              className="w-full bg-white mt-2"
              value={policyTrigger}
              onChange={(e) => setPolicyTrigger(e.target.value)}
            >
              {triggerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            </label>
            <div className="flex gap-2 items-end">
              <Input
                label="Duration"
                labelClassName="text-sm text-slate-700"
                value={policyDuration}
                onChange={(e) => setPolicyDuration(e.target.value)}
              />
              <Select
                className="rounded-sm border px-3 py-2 bg-white"
                value={policyDurationUnit}
                onChange={(e) => setPolicyDurationUnit(e.target.value)}
              >
                {durationUnits.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
    
     
            <Input
              label="Priority (optional)"
              id="policy-priority"
              value={policyPriority}
              onChange={(e) => setPolicyPriority(e.target.value)}
              placeholder="0"
            />
       
      
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={policyActive}
                onChange={(e) => setPolicyActive(e.target.checked)}
              />
              Active
            </label>
   
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleCreatePolicy} disabled={policySaving}>
            {policySaving ? 'Saving...' : 'Create policy'}
          </Button>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-2">Existing policies</h4>
          {policiesLoading ? (
            <p className="text-sm text-slate-500">Loading policies...</p>
          ) : policies.length === 0 ? (
            <p className="text-sm text-slate-500">No retention policies found.</p>
          ) : (
            <div className="space-y-2">
              {policies.map((policy) => (
                <div key={policy._id} className="border rounded-md px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-900">{policy.name}</span>
                    <span className="text-slate-500">{policy.active === false ? 'Inactive' : 'Active'}</span>
                  </div>
                  <div className="text-slate-600">
                    {policy.docType || '*'} · {policy.jurisdiction || '*'} ·{' '}
                    {policy.triggerEvent || 'completedAt'} · {policy.durationDays ?? '—'} days
                  </div>
                  {policy.regime && <div className="text-slate-500">Regime: {policy.regime}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <h3 className="text-md font-semibold text-slate-900">Legal Holds</h3>
          <p className="text-sm text-slate-600">
            Apply holds by document IDs or by criteria for system-wide governance.
          </p>
        </div>
        {!hasLegalHoldAccess ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {getRequiredTierLabelForFeature('legal_holds')} is required to create and release legal holds.
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Hold name"
                id="hold-name"
                value={holdName}
                onChange={(e) => setHoldName(e.target.value)}
                placeholder="e.g., Litigation Hold 2026"
              />
              <Input
                label="Reason (optional)"
                id="hold-reason"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="e.g., Regulatory investigation"
              />
              <div className="space-y-2 md:col-span-2">
                <Textarea
                  label="Document IDs (comma separated)"
                  className="border-slate-200"
                  rows={2}
                  value={holdDocumentIds}
                  onChange={(e) => setHoldDocumentIds(e.target.value)}
                  placeholder="docId1, docId2"
                />
              </div>
              <Input
                label="Doc types (criteria)"
                id="hold-docTypes"
                value={holdDocTypes}
                onChange={(e) => setHoldDocTypes(e.target.value)}
                placeholder="employment, nda"
              />
              <Input
                label="Jurisdictions (criteria)"
                id="hold-jurisdictions"
                value={holdJurisdictions}
                onChange={(e) => setHoldJurisdictions(e.target.value)}
                placeholder="US-CA, US-NY"
              />
              <Input
                label="Statuses (criteria)"
                id="hold-statuses"
                value={holdStatuses}
                onChange={(e) => setHoldStatuses(e.target.value)}
                placeholder="completed, voided"
              />
              <Input
                label="Created after (criteria)"
                id="hold-created-after"
                type="date"
                value={holdCreatedAfter}
                onChange={(e) => setHoldCreatedAfter(e.target.value)}
              />
              <Input
                label="Created before (criteria)"
                id="hold-created-before"
                type="date"
                value={holdCreatedBefore}
                onChange={(e) => setHoldCreatedBefore(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={handleCreateHold} disabled={holdSaving}>
                {holdSaving ? 'Applying...' : 'Apply legal hold'}
              </Button>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-slate-800 mb-2">Active & released holds</h4>
              {holdsLoading ? (
                <p className="text-sm text-slate-500">Loading holds...</p>
              ) : holds.length === 0 ? (
                <p className="text-sm text-slate-500">No legal holds found.</p>
              ) : (
                <div className="space-y-2">
                  {holds.map((hold) => (
                    <div key={hold._id} className="border rounded-md px-3 py-2 text-sm">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-slate-900">{hold.name}</div>
                          <div className="text-slate-500">
                            Status: {hold.status || 'active'}
                            {hold.reason ? ` · ${hold.reason}` : ''}
                          </div>
                        </div>
                        {hold.status !== 'released' && (
                          <Button size="sm"
                            className="text-xs"
                            onClick={() => handleReleaseHold(hold._id)}
                            disabled={holdReleasingId === hold._id}
                          >
                            {holdReleasingId === hold._id ? 'Releasing...' : 'Release'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-md font-semibold text-slate-900">System Preferences</h3>
            <p className="text-sm text-slate-600">
              Set workspace-wide defaults for branding, document delivery, notifications, and fallback retention.
            </p>
          </div>
          <SaveButton
            onClick={handleSaveSystemSettings}
            saving={systemSettingsSaving}
            label="Save system preferences"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          These values act as workspace defaults. Individual users can still keep personal overrides for invites and notifications.
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Branding</h4>
              <p className="text-sm text-slate-500">
                Apply a brand name and support contact for the active workspace.
              </p>
            </div>

            <div
              className="rounded-lg border bg-white px-4 py-3"
              style={hasCustomBrandColor ? { borderColor: systemSettings.branding.primaryColor } : undefined}
            >
              <div
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={hasCustomBrandColor ? { color: systemSettings.branding.primaryColor } : undefined}
              >
                Live preview
              </div>
              <div className="mt-2">
                {hasCustomBrandName ? (
                  <div
                    className="text-lg font-semibold text-slate-900"
                    style={hasCustomBrandColor ? { color: systemSettings.branding.primaryColor } : undefined}
                  >
                    {systemSettings.branding.brandName}
                  </div>
                ) : (
                  <Brand color={hasCustomBrandColor ? systemSettings.branding.primaryColor : undefined} />
                )}
              </div>
              <div className="text-sm text-slate-500">
                {systemSettings.branding.supportEmail || 'support@example.com'}
              </div>
            </div>

            <Input
              label="Brand name"
              id="org-brand-name"
              value={systemSettings.branding.brandName}
              onChange={(e) => updateSystemSettings('branding', { brandName: e.target.value })}
              placeholder={workspaceName || 'Workspace name'}
            />
            <Input
              label="Support email"
              id="org-support-email"
              type="email"
              value={systemSettings.branding.supportEmail}
              onChange={(e) => updateSystemSettings('branding', { supportEmail: e.target.value })}
              placeholder="support@yourcompany.com"
            />
            <label className="text-sm font-medium text-slate-700">
              Primary color
              <div className="flex items-center gap-3 mt-2">
                <input
                  aria-label="Primary color"
                  type="color"
                  className="h-11 w-14 rounded-sm border border-slate-200 bg-white p-1"
                  value={systemSettings.branding.primaryColor}
                  onChange={(e) => updateSystemSettings('branding', { primaryColor: e.target.value })}
                />
                <Input
                  className="w-full rounded-sm border border-slate-200 px-3 py-2"
                  value={systemSettings.branding.primaryColor}
                  onChange={(e) => updateSystemSettings('branding', { primaryColor: e.target.value })}
                />
              </div>
            </label>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Document Defaults</h4>
              <p className="text-sm text-slate-500">
                These defaults prefill send flows for members who have not set personal values.
              </p>
            </div>

            <label className="mb-4 block text-sm font-medium text-slate-700">
              Signing mode
              <Select
                className="w-full mt-2"
                value={systemSettings.documentDefaults.defaultSigningMode}
                onChange={(e) =>
                  updateSystemSettings('documentDefaults', {
                    defaultSigningMode: e.target.value as WorkspaceSettings['documentDefaults']['defaultSigningMode'],
                  })
                }
              >
                <option value="parallel">Parallel</option>
                <option value="sequential">Sequential</option>
              </Select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">                             
                <Input
                  type="number"
                  label="Expiration days"
                  min={1}
                  max={365}
                  value={systemSettings.documentDefaults.defaultExpirationDays}
                  onChange={(e) =>
                    updateSystemSettings('documentDefaults', {
                      defaultExpirationDays: Number(e.target.value) || 1,
                    })
                  }
                />
                <Input
                  type="number"
                  label="Reminder interval"
                  min={1}
                  max={30}
                  value={systemSettings.documentDefaults.reminderIntervalDays}
                  onChange={(e) =>
                    updateSystemSettings('documentDefaults', {
                      reminderIntervalDays: Number(e.target.value) || 1,
                    })
                  }
                />
            </div>

            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Automatic reminders</div>
                <div className="text-xs text-slate-500">Pre-enable reminders on new signing requests.</div>
              </div>
              <input
                type="checkbox"
                checked={systemSettings.documentDefaults.autoReminders}
                onChange={(e) =>
                  updateSystemSettings('documentDefaults', { autoReminders: e.target.checked })
                }
              />
            </label>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Notification Rules</h4>
              <p className="text-sm text-slate-500">
                Configure sender notifications and the invite content used across the workspace.
              </p>
            </div>
            <label className="text-sm font-medium text-slate-700">
              Email digest
              <Select
                className="w-full mt-2"
                value={systemSettings.notificationRules.emailDigest}
                onChange={(e) =>
                  updateSystemSettings('notificationRules', {
                    emailDigest: e.target.value as WorkspaceSettings['notificationRules']['emailDigest'],
                  })
                }
              >
                <option value="immediate">Immediate</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="off">Off</option>
              </Select>
            </label>

            <div className="grid gap-3 md:grid-cols-2 my-6">
              {[
                ['notifyOnViewed', 'Viewed events'],
                ['notifyOnSigned', 'Signed events'],
                ['notifyOnCompleted', 'Completed events'],
                ['notifyOnDeclined', 'Declined events'],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-3 px-3"
                >
                  <input
                    type="checkbox"
                    checked={
                      systemSettings.notificationRules[
                        key as keyof WorkspaceSettings['notificationRules']
                      ] as boolean
                    }
                    onChange={(e) =>
                      updateSystemSettings('notificationRules', {
                        [key]: e.target.checked,
                      } as Partial<WorkspaceSettings['notificationRules']>)
                    }
                  /> <span className="text-sm font-medium text-slate-800">{label}</span>
                </label>
              ))}
            </div>

            <Input
              label="Default invite subject"
              id="org-invite-subject"
              value={systemSettings.notificationRules.inviteSubject}
              onChange={(e) =>
                updateSystemSettings('notificationRules', { inviteSubject: e.target.value })
              }
              placeholder="Document Name: Signature Request from Sender name"
            />
            <label className="text-sm font-medium text-slate-700">
              Default invite message
              <Textarea
                className="mt-2 w-full font-normal"
                rows={4}
                value={systemSettings.notificationRules.inviteMessage}
                onChange={(e) =>
                  updateSystemSettings('notificationRules', { inviteMessage: e.target.value })
                }
              />
            </label>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Default Retention</h4>
              <p className="text-sm text-slate-500">
                Applies only when no explicit retention policy matches the document.
              </p>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Enable fallback retention</div>
                <div className="text-xs text-slate-500">Use an org-wide retention rule as a safety net.</div>
              </div>
              <input
                type="checkbox"
                checked={systemSettings.defaultRetention.enabled}
                onChange={(e) =>
                  updateSystemSettings('defaultRetention', { enabled: e.target.checked })
                }
              />
            </label>

            <label className="block my-4 font-medium text-sm text-slate-700">
              Trigger event
              <Select
                className="w-full mt-2"
                value={systemSettings.defaultRetention.triggerEvent}
                onChange={(e) =>
                  updateSystemSettings('defaultRetention', {
                    triggerEvent: e.target.value as WorkspaceSettings['defaultRetention']['triggerEvent'],
                  })
                }
              >
                {triggerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">             
                <Input
                  type="number"
                  label="Duration days"
                  min={1}
                  max={365 * 25}
                  value={systemSettings.defaultRetention.durationDays}
                  onChange={(e) =>
                    updateSystemSettings('defaultRetention', {
                      durationDays: Number(e.target.value) || 1,
                    })
                  }
                />
              <Input
                label="Regime"
                id="org-retention-regime"
                value={systemSettings.defaultRetention.regime}
                onChange={(e) =>
                  updateSystemSettings('defaultRetention', { regime: e.target.value })
                }
                placeholder="e.g., Corporate policy"
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
