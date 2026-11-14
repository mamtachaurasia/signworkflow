'use client';

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { Button, SaveButton } from '@ui';
import useContextStore from '@/hooks/useContextStore';
import type { IDocument } from '@/types/types';
import { isAdminRole } from '@/lib/role-utils';
import { Select } from '@ui';
import { Input } from '@ui';

type RetentionPolicySummary = {
  _id: string;
  name: string;
  docType?: string;
  jurisdiction?: string;
  triggerEvent?: string;
  durationDays?: number;
  active?: boolean;
};

interface RetentionInfoPanelProps {
  documentId?: string | null;
  retention?: IDocument['retention'] | null;
  legalHold?: IDocument['legalHold'] | null;
  onRetentionChange?: (value: IDocument['retention'] | null) => void;
  onLegalHoldChange?: (value: IDocument['legalHold'] | null) => void;
}

type ReleasedDocumentUpdate = {
  documentId?: string;
  retention?: IDocument['retention'] | null;
  legalHold?: IDocument['legalHold'] | null;
};

const formatTimestamp = (value?: unknown): string => {
  if (!value) return '—';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString();
};

const toDateInputValue = (value?: unknown): string => {
  if (!value) return '';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const RetentionInfoPanel: React.FC<RetentionInfoPanelProps> = ({
  documentId,
  retention,
  legalHold,
  onRetentionChange,
  onLegalHoldChange,
}) => {
  const { user } = useContextStore();
  const isAdmin = isAdminRole(user?.role);

  const [docType, setDocType] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [governingLaw, setGoverningLaw] = useState('');
  const [customTriggerAt, setCustomTriggerAt] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState('');

  const [policies, setPolicies] = useState<RetentionPolicySummary[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [releaseHoldId, setReleaseHoldId] = useState<string | null>(null);
  const [holdName, setHoldName] = useState('');
  const [holdReason, setHoldReason] = useState('');

  const holdIds = useMemo(
    () => (Array.isArray(legalHold?.holdIds) ? legalHold?.holdIds.map((id) => String(id)) : []),
    [legalHold?.holdIds]
  );

  useEffect(() => {
    if (!isAdmin) return;

    setDocType(retention?.docType ?? '');
    setJurisdiction(retention?.jurisdiction ?? '');
    setGoverningLaw(retention?.governingLaw ?? '');
    setCustomTriggerAt(toDateInputValue(retention?.customTriggerAt));
    const policyId = retention?.policy?.policyId ? String(retention.policy.policyId) : '';
    setSelectedPolicyId(policyId);
  }, [isAdmin, retention]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    const fetchPolicies = async () => {
      setPoliciesLoading(true);
      try {
        const response = await fetch('/api/retention/policies', {
          credentials: 'include',
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || `Failed to load policies (${response.status})`);
        }
        const payload = await response.json();
        if (!cancelled) {
          const nextPolicies = Array.isArray(payload?.policies) ? payload.policies : [];
          setPolicies(nextPolicies.filter((policy: RetentionPolicySummary) => policy?.active !== false));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load retention policies');
        }
      } finally {
        if (!cancelled) setPoliciesLoading(false);
      }
    };

    fetchPolicies();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const retentionStatus =
    legalHold?.status === 'active' || legalHold?.status === 'unknown'
      ? 'on_hold'
      : (retention?.status ?? 'unclassified');
  const retentionEnd = retention?.endAt ? formatTimestamp(retention.endAt) : '—';
  const retentionTrigger = retention?.triggerEvent ?? '—';
  const retentionPolicyName = retention?.policy?.name ?? 'Auto';

  const handleSaveRetention = async () => {
    if (!documentId) {
      toast.error('Document ID missing');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        documentId,
        docType: docType.trim() || undefined,
        jurisdiction: jurisdiction.trim() || undefined,
        governingLaw: governingLaw.trim() || undefined,
      };
      if (customTriggerAt) payload.customTriggerAt = customTriggerAt;
      if (selectedPolicyId) payload.policyId = selectedPolicyId;

      const response = await fetch('/api/documents/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || 'Failed to update retention');
      }

      onRetentionChange?.(result?.retention ?? null);
      toast.success('Retention updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update retention');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyHold = async () => {
    if (!documentId) {
      toast.error('Document ID missing');
      return;
    }
    if (!holdName.trim()) {
      toast.error('Hold name is required');
      return;
    }

    setHoldSubmitting(true);
    try {
      const response = await fetch('/api/retention/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: holdName.trim(),
          reason: holdReason.trim() || undefined,
          documentIds: [documentId],
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || 'Failed to apply legal hold');
      }

      const holdId = result?.holdId ? String(result.holdId) : null;
      const nextHoldIds = holdId ? Array.from(new Set([...holdIds, holdId])) : holdIds;
      const nextLegalHold: IDocument['legalHold'] = {
        status: 'active',
        holdIds: nextHoldIds,
        lastCheckedAt: new Date(),
      };
      onLegalHoldChange?.(nextLegalHold ?? null);
      setHoldName('');
      setHoldReason('');
      toast.success('Legal hold applied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply legal hold');
    } finally {
      setHoldSubmitting(false);
    }
  };

  const handleReleaseHold = async (holdId: string) => {
    if (!holdId) return;
    setReleaseHoldId(holdId);
    try {
      const response = await fetch(`/api/retention/holds/${holdId}/release`, {
        method: 'POST',
        credentials: 'include',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || 'Failed to release hold');
      }

      const remainingIds = holdIds.filter((id) => id !== holdId);
      const nextStatus = remainingIds.length > 0 ? 'active' : 'none';
      const releasedDocument = Array.isArray(result?.releasedDocuments)
        ? (result.releasedDocuments as ReleasedDocumentUpdate[]).find(
            (entry) => String(entry?.documentId ?? '') === String(documentId ?? '')
          )
        : null;

      onLegalHoldChange?.({
        status: nextStatus,
        holdIds: remainingIds,
        lastCheckedAt: new Date(),
      } as IDocument['legalHold']);

      if (releasedDocument?.retention) {
        onRetentionChange?.(releasedDocument.retention);
      }

      toast.success('Legal hold released');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to release hold');
    } finally {
      setReleaseHoldId(null);
    }
  };

  return (
    <div className="pt-2 space-y-2">
      <div>
        <small className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Retention &amp; Legal Hold</small>
      </div>
      <div className="text-xs text-gray-600 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span>Status</span>
          <span className="font-medium text-gray-800">{retentionStatus}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Policy</span>
          <span className="font-medium text-gray-800">{retentionPolicyName}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Trigger</span>
          <span className="font-medium text-gray-800">{retentionTrigger}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Retention End</span>
          <span className="font-medium text-gray-800">{retentionEnd}</span>
        </div>
      </div>

      <div className="grid gap-2 text-xs">
        <label className="text-[11px] text-gray-500">Policy Override</label>
        <Select
          className="w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
          value={selectedPolicyId}
          onChange={(event) => setSelectedPolicyId(event.target.value)}
          disabled={policiesLoading}
        >
          <option value="">Auto (match by doc type/jurisdiction)</option>
          {policies.map((policy) => (
            <option key={policy._id} value={policy._id}>
              {policy.name}
            </option>
          ))}
        </Select>

        <label className="text-[11px] text-gray-500">Document Type</label>
        <Input
          className="w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
          value={docType}
          onChange={(event) => setDocType(event.target.value)}
          placeholder="e.g., employment_contract"
        />

        <label className="text-[11px] text-gray-500">Jurisdiction</label>
        <Input
          className="w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
          value={jurisdiction}
          onChange={(event) => setJurisdiction(event.target.value)}
          placeholder="e.g., US-CA"
        />

        <label className="text-[11px] text-gray-500">Governing Law</label>
        <Input
          className="w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
          value={governingLaw}
          onChange={(event) => setGoverningLaw(event.target.value)}
          placeholder="e.g., Delaware"
        />

        <label className="text-[11px] text-gray-500">Custom Trigger Date</label>
        <Input
          type="date"
          className="w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
          value={customTriggerAt}
          onChange={(event) => setCustomTriggerAt(event.target.value)}
        />

        <div className="flex items-center gap-2">
          <SaveButton
            className="rounded-md! text-xs"
            onClick={handleSaveRetention}
            disabled={saving || !documentId}
            saving={saving}
            label="Save classification"
          />
        </div>
      </div>

      <div className="pt-1 space-y-2">
        <div className="text-xs text-gray-600">
          <div className="flex items-center justify-between">
            <span>Hold Status</span>
            <span className="font-medium text-gray-800">{legalHold?.status ?? 'none'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Hold Count</span>
            <span className="font-medium text-gray-800">{holdIds.length}</span>
          </div>
        </div>

        {holdIds.length > 0 && (
          <div className="space-y-2">
            {holdIds.map((holdId) => (
              <div key={holdId} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-500 break-all" title={holdId}>{holdId}</span>
                <Button size="sm"
                  className="rounded-md! text-[11px]"
                  inverted
                  onClick={() => handleReleaseHold(holdId)}
                  disabled={releaseHoldId === holdId}
                >
                  {releaseHoldId === holdId ? 'Releasing…' : 'Release'}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-2 text-xs">
          <label className="text-[11px] text-gray-500">Hold Name</label>
          <Input
            className="w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
            value={holdName}
            onChange={(event) => setHoldName(event.target.value)}
            placeholder="e.g., Litigation Hold 2026-01"
          />
          <label className="text-[11px] text-gray-500">Hold Reason</label>
          <Input
            className="w-full rounded-sm border border-gray-200 px-2 py-1 text-xs"
            value={holdReason}
            onChange={(event) => setHoldReason(event.target.value)}
            placeholder="Optional"
          />
          <Button size="sm"
            className="rounded-md! text-xs"
            onClick={handleApplyHold}
            disabled={holdSubmitting || !documentId}
          >
            {holdSubmitting ? 'Applying…' : 'Apply legal hold'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RetentionInfoPanel;
