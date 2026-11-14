'use client';

import type { HistoryFilters } from '@/hooks/useRecoveryHistory';

export default function RecoveryHistoryControls({ label, filters, onChange, loading, error, nextCursor, onLoadMore, onRefresh, webhook = false }: {
  label: string;
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
  loading: boolean;
  error: string | null;
  nextCursor: string | null;
  onLoadMore: () => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
  webhook?: boolean;
}) {
  return <div className="my-3 space-y-2">
    <div className="flex flex-wrap items-end gap-3 text-xs text-slate-600">
      <label>Status<select aria-label={`${label} status`} className="ml-2 rounded border border-slate-300 bg-white p-2" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value })}>
        <option value="">All statuses</option><option value="failures">All failures</option>
        {['pending', ...(webhook ? ['paused'] : []), 'processing', webhook ? 'delivered' : 'completed', 'failed', 'dead_letter'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
      </select></label>
      <label>From (UTC)<input aria-label={`${label} from date`} type="date" value={filters.from} onChange={(event) => onChange({ ...filters, from: event.target.value })} className="ml-2 rounded border border-slate-300 p-2" /></label>
      <label>To (UTC)<input aria-label={`${label} to date`} type="date" value={filters.to} onChange={(event) => onChange({ ...filters, to: event.target.value })} className="ml-2 rounded border border-slate-300 p-2" /></label>
      <button type="button" disabled={loading} onClick={() => void onRefresh()} className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50">Refresh history</button>
      {nextCursor ? <button type="button" disabled={loading} onClick={() => void onLoadMore()} className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50">Load more {label.toLowerCase()}</button> : null}
      {loading ? <span role="status">Loading history…</span> : null}
    </div>
    {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
  </div>;
}
