'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Filter, Info } from 'lucide-react';

import { Button } from '@ui';
import useContextStore from '@/hooks/useContextStore';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { isAdminRole } from '@/lib/role-utils';
import { getRequiredTierLabelForFeature } from '@/lib/subscription-plans';
import { Input } from '@ui';
import { verifyAuditChains, type AuditVerificationResult } from '@/lib/audit-verification-client';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

type AuditLogEntry = {
  _id: string;
  createdAt?: string;
  action?: string;
  userId?: string | null;
  orgId?: string | null;
  documentId?: string | null;
  ipAddress?: string;
  userAgent?: string;
  chainScope?: string;
  chainId?: string;
  prevHash?: string;
  hash?: string;
  metadata?: Record<string, unknown>;
};

type AuditResponse = {
  items?: AuditLogEntry[];
  nextCursor?: string | null;
  hasMore?: boolean;
  message?: string;
};

export default function AuditTrail() {
  const { user } = useContextStore();
  const isAdmin = isAdminRole(user?.role) || isAdminRole(user?.orgRole);
  const { status: subscriptionStatus, loading: subscriptionLoading } = useSubscriptionStatus({ enabled: true });
  const canViewAuditTrail = subscriptionLoading ? true : subscriptionStatus.entitlements.auditTrail;
  const canExportAuditTrail = subscriptionLoading ? true : subscriptionStatus.entitlements.auditExport;

  const [filters, setFilters] = useState({
    start: '',
    end: '',
    userId: '',
    orgId: '',
    documentId: '',
    limit: DEFAULT_LIMIT,
  });
  const [actionQuery, setActionQuery] = useState('');
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AuditVerificationResult | null>(null);

  const buildParams = useCallback(
    (cursorOverride?: string | null, format?: 'json' | 'csv') => {
      const params = new URLSearchParams();
      if (filters.userId.trim()) params.set('userId', filters.userId.trim());
      if (filters.orgId.trim()) params.set('orgId', filters.orgId.trim());
      if (filters.documentId.trim()) params.set('documentId', filters.documentId.trim());
      if (actionQuery.trim()) params.set('action', actionQuery.trim());
      if (filters.start) params.set('start', new Date(`${filters.start}T00:00:00`).toISOString());
      if (filters.end) params.set('end', new Date(`${filters.end}T23:59:59.999`).toISOString());
      const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(filters.limit || DEFAULT_LIMIT)));
      params.set('limit', String(limit));
      if (cursorOverride) params.set('cursor', cursorOverride);
      if (format) params.set('format', format);
      return params.toString();
    },
    [actionQuery, filters]
  );

  const fetchLogs = useCallback(
    async (cursorOverride?: string | null, append?: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const query = buildParams(cursorOverride);
        const res = await fetch(`/api/admin/audit/export?${query}`, {
          credentials: 'include',
        });
        const payload = (await res.json().catch(() => ({}))) as AuditResponse;
        if (!res.ok) {
          const message = payload?.message || 'Unable to load audit logs.';
          setError(message);
          toast.error(message);
          return;
        }

        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setCursor(payload.nextCursor || null);
        setHasMore(Boolean(payload.hasMore));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load audit logs.';
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [buildParams]
  );

  const handleApply = () => {
    setVerifyResult(null);
    fetchLogs(null, false);
  };
  const handleLoadMore = () => {
    if (!cursor) return;
    fetchLogs(cursor, true);
  };

  const handleReset = () => {
    setFilters({
      start: '',
      end: '',
      userId: '',
      orgId: '',
      documentId: '',
      limit: DEFAULT_LIMIT,
    });
    setActionQuery('');
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setError(null);
    setVerifyResult(null);
  };

  const handleExport = async (format: 'csv' | 'json') => {
    if (!canExportAuditTrail) {
      toast.error(`${getRequiredTierLabelForFeature('audit_export')} is required to export audit logs.`);
      return;
    }
    try {
      const query = `${buildParams(null, format === 'csv' ? 'csv' : 'json')}&download=1`;
      const res = await fetch(`/api/admin/audit/export?${query}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'csv' ? 'audit-trail.csv' : 'audit-trail.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      toast.error(message);
    }
  };

  const handleExportAll = async (format: 'csv' | 'json') => {
    if (!canExportAuditTrail || exportingAll) return;
    setExportingAll(true);
    try {
      let cursorOverride: string | null = null;
      const allItems: AuditLogEntry[] = [];
      const csvPages: string[] = [];
      for (let page = 0; page < 1000; page += 1) {
        const query: string = `${buildParams(cursorOverride, format)}&download=1`;
        const res: Response = await fetch(`/api/admin/audit/export?${query}`, { credentials: 'include' });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.message || 'Full export failed');
        }
        let nextCursorFromPayload: string | null = null;
        if (format === 'csv') {
          const text = await res.text();
          csvPages.push(page === 0 ? text : text.split('\n').slice(1).join('\n'));
        } else {
          const payload = (await res.json()) as AuditResponse;
          allItems.push(...(payload.items || []));
          nextCursorFromPayload = payload.nextCursor || null;
        }
        const nextCursor: string | null = format === 'csv' ? res.headers.get('X-Next-Cursor') : nextCursorFromPayload;
        if (!nextCursor) {
          if (format === 'json') {
            const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: 'application/json' });
            downloadBlob(blob, 'audit-trail.json');
          } else {
            downloadBlob(new Blob([csvPages.join('\n')], { type: 'text/csv' }), 'audit-trail.csv');
          }
          return;
        }
        cursorOverride = nextCursor;
      }
      throw new Error('Full export exceeded the safety page limit. Narrow the filters and try again.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Full export failed');
    } finally {
      setExportingAll(false);
    }
  };

  const handleVerify = async () => {
    if (!canExportAuditTrail) {
      toast.error(`${getRequiredTierLabelForFeature('audit_export')} is required to verify audit chains.`);
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyAuditChains(buildParams(null), setVerifyResult);
      setVerifyResult(result);
      if (result.message) toast.error(result.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      toast.error(message);
      setVerifyResult({
        ok: false, complete: false, checked: 0, message,
        partialChains: 0, unverifiable: 0, mismatchCount: 0, mismatches: [],
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">Audit Trail</h2>
        <p className="text-sm text-gray-600">
          Review security and signing events across your workspace. Audit logs are append-only and
          tamper-evident through hash chaining.
        </p>
      </div>

      {!isAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Admin access is required to view audit logs. Contact your owner or admin to request access.
        </div>
      )}

      {isAdmin && user?.orgId && !subscriptionLoading && !canViewAuditTrail && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {getRequiredTierLabelForFeature('audit_trail')} is required to view workspace audit logs.
        </div>
      )}

      {isAdmin && !subscriptionLoading && canViewAuditTrail && !canExportAuditTrail && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          Viewing audit logs is included in your current plan. Exporting audit files and verifying
          audit chains require {getRequiredTierLabelForFeature('audit_export')}.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Filters</h3>
            <p className="text-xs text-slate-500">Search by org, user, document, or date range.</p>
          </div>
          <div className="flex gap-2 text-xs!">
            <Button size="sm"
              type="button"
              onClick={handleApply}
              disabled={!isAdmin || loading || !canViewAuditTrail}
              icon={<Filter className="h-4 w-4" />}
              className="w-auto"
            >
              {loading ? 'Loading...' : 'Apply'}
            </Button>
            <Button size="sm" type="button" onClick={handleReset} disabled={loading}>
              Reset
            </Button>
            <Button size="sm"
              type="button"
              onClick={() => handleExport('csv')}
              disabled={!isAdmin || !canExportAuditTrail}
              icon={<Download className="h-4 w-4" />}
               className="w-auto"
            >
              Export CSV
            </Button>
            <Button size="sm"
              type="button"
              onClick={() => handleExport('json')}
              disabled={!isAdmin || !canExportAuditTrail}
              icon={<Download className="h-4 w-4" />}
              className="w-auto"
            >
              Export JSON
            </Button>
            <Button size="sm"
              type="button"
              onClick={() => handleExportAll('csv')}
              disabled={!isAdmin || !canExportAuditTrail || exportingAll}
              icon={<Download className="h-4 w-4" />}
              className="w-auto"
            >
              {exportingAll ? 'Exporting...' : 'Export all CSV'}
            </Button>
            <Button size="sm"
              type="button"
              onClick={() => handleExportAll('json')}
              disabled={!isAdmin || !canExportAuditTrail || exportingAll}
              icon={<Download className="h-4 w-4" />}
              className="w-auto"
            >
              {exportingAll ? 'Exporting...' : 'Export all JSON'}
            </Button>
            <Button size="sm"
              type="button"
              onClick={handleVerify}
              disabled={!isAdmin || verifying || !canExportAuditTrail}
            >
              {verifying ? 'Verifying...' : 'Verify Hash Chain'}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-slate-400">Start date</span>
            <Input
              type="date"
              value={filters.start}
              onChange={(e) => setFilters((prev) => ({ ...prev, start: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={!isAdmin}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-slate-400">End date</span>
            <Input
              type="date"
              value={filters.end}
              onChange={(e) => setFilters((prev) => ({ ...prev, end: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={!isAdmin}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-slate-400">Action contains</span>
            <Input
              type="text"
              value={actionQuery}
              onChange={(e) => setActionQuery(e.target.value)}
              placeholder="user.settings.updated"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={!isAdmin}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-slate-400">User ID</span>
            <Input
              type="text"
              value={filters.userId}
              onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={!isAdmin}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-slate-400">Org ID</span>
            <Input
              type="text"
              value={filters.orgId}
              onChange={(e) => setFilters((prev) => ({ ...prev, orgId: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={!isAdmin}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-slate-400">Document ID</span>
            <Input
              type="text"
              value={filters.documentId}
              onChange={(e) => setFilters((prev) => ({ ...prev, documentId: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={!isAdmin}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase text-slate-400">Limit</span>
            <Input
              type="number"
              min={1}
              max={MAX_LIMIT}
              value={filters.limit}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  limit: Number.isFinite(Number(e.target.value))
                    ? Number(e.target.value)
                    : prev.limit,
                }))
              }
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={!isAdmin}
            />
          </label>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Info className="h-3.5 w-3.5" />
          Exports are limited to {MAX_LIMIT} rows per request. Use the cursor pagination controls to
          retrieve larger ranges.
        </div>
      </div>

      {verifyResult && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Hash Chain Verification</h3>
            <span
              className={`text-xs font-semibold uppercase ${
                verifyResult.mismatchCount > 0 ? 'text-rose-600' :
                  verifyResult.complete && verifyResult.ok && verifyResult.checked > 0
                    ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {verifyResult.mismatchCount > 0 ? 'Issues found' : verifying ? 'Verifying…' :
                verifyResult.complete && verifyResult.ok && verifyResult.checked > 0 ? 'Verified' :
                  verifyResult.complete && verifyResult.checked === 0 ? 'No matching entries' : 'Incomplete'}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Checked {verifyResult.checked} entries.{' '}
            {verifyResult.partialChains ? 'Some chain history could not be verified. ' : ''}
            {verifyResult.unverifiable ? `Unsigned entries: ${verifyResult.unverifiable}. ` : ''}
            Verification includes all accessible entries in chains matching your filters.
          </p>
          {verifyResult.message && <p className="mt-2 text-sm text-amber-700">{verifyResult.message}</p>}
          {!verifyResult.ok && verifyResult.mismatches && verifyResult.mismatches.length > 0 && (
            <div className="mt-3 text-xs text-slate-600 space-y-1">
              {verifyResult.mismatches.slice(0, 5).map((mismatch) => (
                <div key={`${mismatch.id}:${mismatch.reason}`}>
                  {mismatch.id}: {mismatch.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Results</h3>
          <span className="text-xs text-slate-500">{items.length} entries</span>
        </div>

        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        {!error && items.length === 0 && (
          <p className="mt-4 text-sm text-slate-600">
            No audit entries yet. Adjust filters and click Apply.
          </p>
        )}

        {items.length > 0 && (
          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Org</th>
                  <th className="px-3 py-2">Document</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((entry) => (
                  <tr key={entry._id} className="text-slate-700">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 font-medium">{entry.action || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{entry.userId || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{entry.orgId || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{entry.documentId || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{entry.ipAddress || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                        <details>
                          <summary className="cursor-pointer text-brand-600">Metadata</summary>
                          <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div className="mt-4">
            <Button size="sm" type="button" onClick={handleLoadMore} disabled={loading || !isAdmin}>
              {loading ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
