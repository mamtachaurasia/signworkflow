'use client';

import { Archive, ExternalLink, LoaderCircle, RotateCcw, Unplug } from 'lucide-react';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

import { Button } from '@ui';
import { useRecoveryHistory } from '@/hooks/useRecoveryHistory';
import RecoveryHistoryControls from '@/components/account/RecoveryHistoryControls';
import {
  disconnectWorkspaceCloudConnection,
  retryWorkspaceCloudArchive,
  startWorkspaceCloudConnection,
  updateWorkspaceCloudArchive,
  type WorkspaceCloudArchiveJobSummary,
  type WorkspaceCloudArchiveRule,
} from '@/lib/cloud-client';
import type { CloudProviderId, WorkspaceCloudConnectionSummary } from '@/lib/cloud/types';

type RuleDraft = { enabled: boolean; destinationFolder: string };
const PROVIDERS: CloudProviderId[] = ['google_drive', 'dropbox'];

function draftFor(rule?: WorkspaceCloudArchiveRule): RuleDraft {
  return { enabled: rule?.enabled || false, destinationFolder: rule?.destinationFolder || 'SignWorkflow Workspace Archive' };
}

export default function WorkspaceCloudArchivePanel({ documentNames }: { documentNames: Record<string, string> }) {
  const [providers, setProviders] = useState<WorkspaceCloudConnectionSummary[]>([]);
  const [rules, setRules] = useState<WorkspaceCloudArchiveRule[]>([]);
  const [drafts, setDrafts] = useState<Record<CloudProviderId, RuleDraft>>({
    google_drive: draftFor(),
    dropbox: draftFor(),
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const applySettings = useCallback((payload: Record<string, unknown>) => {
    const loadedRules = (payload.rules || []) as WorkspaceCloudArchiveRule[];
    setProviders((payload.providers || []) as WorkspaceCloudConnectionSummary[]);
    setRules(loadedRules);
    setDrafts({
      google_drive: draftFor(loadedRules.find((rule) => rule.provider === 'google_drive')),
      dropbox: draftFor(loadedRules.find((rule) => rule.provider === 'dropbox')),
    });
    setSettingsLoaded(true);
  }, []);
  const history = useRecoveryHistory<WorkspaceCloudArchiveJobSummary>('/api/cloud/workspace-archive', 'jobs', applySettings);
  const jobs = history.items;
  const loading = !settingsLoaded && !history.error;

  async function connect(provider: CloudProviderId) {
    setBusy(`connect:${provider}`);
    try {
      await startWorkspaceCloudConnection(provider);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to connect workspace destination.');
      setBusy(null);
    }
  }

  async function disconnect(provider: CloudProviderId) {
    setBusy(`disconnect:${provider}`);
    try {
      await disconnectWorkspaceCloudConnection(provider);
      toast.success('Workspace archive destination disconnected. Its archive rule was disabled.');
      await history.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to disconnect workspace destination.');
    } finally {
      setBusy(null);
    }
  }

  async function save(provider: CloudProviderId) {
    setBusy(`save:${provider}`);
    try {
      const saved = await updateWorkspaceCloudArchive({
        provider,
        enabled: drafts[provider].enabled,
        destinationFolder: drafts[provider].destinationFolder.trim() || null,
      });
      setRules((current) => [...current.filter((rule) => rule.provider !== provider), saved]);
      setDrafts((current) => ({ ...current, [provider]: draftFor(saved) }));
      toast.success('Workspace archive settings saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save workspace archive settings.');
    } finally {
      setBusy(null);
    }
  }

  async function retry(jobId: string) {
    setBusy(`retry:${jobId}`);
    try {
      await retryWorkspaceCloudArchive(jobId);
      if (await history.refresh()) toast.success('Workspace archive job retried.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to retry workspace archive job.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-6 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-violet-50 p-2 text-violet-700"><Archive className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Workspace-owned signed-document archive</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">This destination belongs to the workspace, not the administrator who connects it. Once enabled, every newly completed workspace document is archived here—even when its owner cannot access another member&apos;s personal export destination.</p>
        </div>
      </div>

      {loading ? <div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading workspace archive…</div> : settingsLoaded ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((providerId) => {
            const provider = providers.find((current) => current.provider === providerId);
            const rule = rules.find((current) => current.provider === providerId);
            const draft = drafts[providerId];
            const connected = Boolean(provider?.connected);
            const dirty = Boolean(rule?.enabled) !== draft.enabled || (rule?.destinationFolder || 'SignWorkflow Workspace Archive') !== draft.destinationFolder;
            return (
              <div key={providerId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-medium text-slate-900">{provider?.label || (providerId === 'google_drive' ? 'Google Drive' : 'Dropbox')}</div><div className="mt-1 text-xs text-slate-500">{connected ? provider?.accountName || provider?.accountEmail || 'Workspace destination connected' : provider?.configured === false ? 'Not configured in this environment' : 'No workspace destination connected'}</div></div>
                  {connected ? <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDrafts((current) => ({ ...current, [providerId]: { ...current[providerId], enabled: event.target.checked } }))} className="h-4 w-4 rounded border-slate-300" /> Enabled</label> : null}
                </div>
                {connected ? <><label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">Destination folder<input value={draft.destinationFolder} maxLength={100} onChange={(event) => setDrafts((current) => ({ ...current, [providerId]: { ...current[providerId], destinationFolder: event.target.value } }))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-hidden focus:border-violet-500" placeholder="SignWorkflow Workspace Archive" /></label><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" type="button" disabled={!dirty || busy === `save:${providerId}`} onClick={() => save(providerId)} icon={busy === `save:${providerId}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : undefined}>Save archive</Button><Button size="sm" inverted type="button" disabled={busy === `disconnect:${providerId}`} onClick={() => disconnect(providerId)} icon={busy === `disconnect:${providerId}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}>Disconnect</Button></div></> : <div className="mt-4"><Button size="sm" type="button" disabled={provider?.configured === false || busy === `connect:${providerId}`} onClick={() => connect(providerId)} icon={busy === `connect:${providerId}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}>Connect workspace destination</Button></div>}
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading ? <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Workspace archive history</h3>
        <RecoveryHistoryControls label="Workspace archives" {...history} onChange={history.setFilters} onLoadMore={history.loadMore} onRefresh={history.refresh} />
        {!history.loading && jobs.length === 0 ? <p className="text-sm text-slate-500">No archives match these filters.</p> : null}
        <div className="mt-3 space-y-2">{jobs.map((job) => {
          const retryable = job.status === 'failed' || job.status === 'dead_letter';
          return <div key={job.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm md:flex-row md:items-center">
            <div className="min-w-0 flex-1"><div className="truncate font-medium text-slate-800">{documentNames[job.documentId] || `Document ${job.documentId}`}</div>
              <div className="mt-1 text-xs text-slate-500">{providers.find((provider) => provider.provider === job.provider)?.label || job.provider} · {job.status.replace('_', ' ')} · attempt {job.attempts}/{job.maxAttempts}</div>
              {job.lastError ? <div className="mt-1 text-xs text-rose-700">{job.lastError}</div> : null}
            </div>
            {job.providerUrl?.startsWith('https://') && job.status === 'completed' ? <a className="text-xs font-medium text-violet-700 hover:text-violet-800" href={job.providerUrl} target="_blank" rel="noreferrer">Open archive</a> : null}
            {retryable ? <Button size="sm" inverted type="button" disabled={busy === `retry:${job.id}`} onClick={() => retry(job.id)} icon={busy === `retry:${job.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}>Retry</Button> : null}
          </div>;
        })}</div>
      </div> : null}
    </section>
  );
}
