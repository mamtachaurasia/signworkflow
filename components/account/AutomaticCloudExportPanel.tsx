'use client';

import { useCallback, useMemo, useState } from 'react';
import { Archive, LoaderCircle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@ui';
import { useRecoveryHistory } from '@/hooks/useRecoveryHistory';
import RecoveryHistoryControls from '@/components/account/RecoveryHistoryControls';
import {
  retryAutomaticCloudExport,
  updateAutomaticCloudExport,
  type CloudAutoExportRule,
  type CloudExportJobSummary,
} from '@/lib/cloud-client';
import type { CloudConnectionSummary, CloudProviderId } from '@/lib/cloud/types';

type RuleDraft = { enabled: boolean; destinationFolder: string };

const PROVIDER_IDS: CloudProviderId[] = ['google_drive', 'dropbox'];

function initialDraft(rule?: CloudAutoExportRule): RuleDraft {
  return {
    enabled: rule?.enabled || false,
    destinationFolder: rule?.destinationFolder || 'SignWorkflow Exports',
  };
}

export default function AutomaticCloudExportPanel({
  providers,
  documentNames,
}: {
  providers: CloudConnectionSummary[];
  documentNames: Record<string, string>;
}) {
  const [rules, setRules] = useState<CloudAutoExportRule[]>([]);
  const [drafts, setDrafts] = useState<Record<CloudProviderId, RuleDraft>>({
    google_drive: initialDraft(),
    dropbox: initialDraft(),
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const applySettings = useCallback((payload: Record<string, unknown>) => {
    const loadedRules = (payload.rules || []) as CloudAutoExportRule[];
    setRules(loadedRules);
    setDrafts({
      google_drive: initialDraft(loadedRules.find((rule) => rule.provider === 'google_drive')),
      dropbox: initialDraft(loadedRules.find((rule) => rule.provider === 'dropbox')),
    });
    setSettingsLoaded(true);
  }, []);
  const history = useRecoveryHistory<CloudExportJobSummary>('/api/cloud/auto-export', 'jobs', applySettings);
  const jobs = history.items;
  const loading = !settingsLoaded && !history.error;

  const providerMap = useMemo(
    () => new Map(providers.map((provider) => [provider.provider, provider])),
    [providers]
  );

  async function saveRule(provider: CloudProviderId) {
    setBusyKey(`save:${provider}`);
    try {
      const draft = drafts[provider];
      const saved = await updateAutomaticCloudExport({
        provider,
        enabled: draft.enabled,
        destinationFolder: draft.destinationFolder.trim() || null,
      });
      setRules((current) => [...current.filter((rule) => rule.provider !== provider), saved]);
      setDrafts((current) => ({
        ...current,
        [provider]: initialDraft(saved),
      }));
      toast.success(`${providerMap.get(provider)?.label || provider} automatic export updated.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save the automatic export rule.');
    } finally {
      setBusyKey(null);
    }
  }

  async function retryJob(jobId: string) {
    setBusyKey(`retry:${jobId}`);
    try {
      await retryAutomaticCloudExport(jobId);
      if (await history.refresh()) toast.success('Export retried.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to retry the export.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-sky-50 p-2 text-sky-700">
          <Archive className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Automatic signed-document archive</h2>
          <p className="mt-1 text-sm text-slate-600">
            Export every newly completed PDF to your connected account. Failed deliveries retry automatically and stay visible below.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading archive rules...
        </div>
      ) : settingsLoaded ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {PROVIDER_IDS.map((providerId) => {
            const provider = providerMap.get(providerId);
            const draft = drafts[providerId];
            const saved = rules.find((rule) => rule.provider === providerId);
            const dirty =
              Boolean(saved?.enabled) !== draft.enabled ||
              (saved?.destinationFolder || 'SignWorkflow Exports') !== draft.destinationFolder;
            return (
              <div key={providerId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{provider?.label || (providerId === 'google_drive' ? 'Google Drive' : 'Dropbox')}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {provider?.connected ? provider.accountName || provider.accountEmail || 'Connected' : 'Connect this provider first'}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      disabled={!provider?.connected && !draft.enabled}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [providerId]: { ...current[providerId], enabled: event.target.checked },
                      }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Enabled
                  </label>
                </div>
                <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Destination folder
                  <input
                    value={draft.destinationFolder}
                    maxLength={100}
                    disabled={!provider?.connected}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [providerId]: { ...current[providerId], destinationFolder: event.target.value },
                    }))}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-hidden focus:border-sky-500"
                    placeholder="SignWorkflow Exports"
                  />
                </label>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    {saved?.enabled ? 'Archiving new completions' : 'Automatic archive is off'}
                  </span>
                  <Button
                    size="sm"
                    type="button"
                    disabled={(!provider?.connected && draft.enabled) || !dirty || busyKey === `save:${providerId}`}
                    onClick={() => saveRule(providerId)}
                    icon={busyKey === `save:${providerId}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : undefined}
                  >
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Automatic export history</h3>
          <RecoveryHistoryControls label="Automatic exports" {...history} onChange={history.setFilters} onLoadMore={history.loadMore} onRefresh={history.refresh} />
          {!history.loading && jobs.length === 0 ? <p className="text-sm text-slate-500">No exports match these filters.</p> : null}
          <div className="mt-3 space-y-2">
            {jobs.map((job) => {
              const retryable = job.status === 'failed' || job.status === 'dead_letter';
              return (
                <div key={job.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{documentNames[job.documentId] || `Document ${job.documentId}`}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {providerMap.get(job.provider)?.label || job.provider} · {job.status.replace('_', ' ')} · attempt {job.attempts}/{job.maxAttempts}
                    </div>
                    {job.lastError ? <div className="mt-1 text-xs text-rose-700">{job.lastError}</div> : null}
                  </div>
                  {job.providerUrl?.startsWith('https://') && job.status === 'completed' ? (
                    <a className="text-xs font-medium text-sky-700 hover:text-sky-800" href={job.providerUrl} target="_blank" rel="noreferrer">Open export</a>
                  ) : job.providerUrl && job.status === 'completed' ? (
                    <span className="max-w-52 truncate text-xs text-slate-500" title={job.providerUrl}>{job.providerUrl}</span>
                  ) : null}
                  {retryable ? (
                    <Button
                      size="sm"
                      type="button"
                      inverted
                      disabled={busyKey === `retry:${job.id}`}
                      onClick={() => retryJob(job.id)}
                      icon={busyKey === `retry:${job.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
