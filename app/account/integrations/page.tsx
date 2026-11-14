'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { CheckCircle2, Cloud, ExternalLink, Link2, LoaderCircle, ShieldCheck, Unplug } from 'lucide-react';

import { Button } from '@ui';
import { useCloudConnections } from '@/hooks/useCloudConnections';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { startCloudConnection, disconnectCloudConnection } from '@/lib/cloud-client';
import { getDashboardAccountPath } from '@/lib/account-routing';
import { getRequiredTierLabelForFeature } from '@/lib/subscription-plans';
import type { CloudProviderId } from '@/lib/cloud/types';
import DeveloperIntegrationsPanel from '@/components/account/DeveloperIntegrationsPanel';

const providerCaptions: Record<CloudProviderId, string> = {
  google_drive: 'Export signed PDFs into your Google Drive with per-user delegated access.',
  dropbox: 'Export signed PDFs into Dropbox without sharing a workspace-wide account.',
};

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: subscriptionStatus, loading: subscriptionLoading } = useSubscriptionStatus({ enabled: true });
  const hasCloudLibraryAccess = subscriptionStatus.entitlements.cloudLibrary;
  const { providers, loading, refresh } = useCloudConnections({
    enabled: !subscriptionLoading && hasCloudLibraryAccess,
  });
  const [busyProvider, setBusyProvider] = useState<CloudProviderId | null>(null);

  useEffect(() => {
    const cloudStatus = searchParams.get('cloud_status');
    const message = searchParams.get('message');
    if (!cloudStatus || !message) {
      return;
    }

    if (cloudStatus === 'connected') {
      toast.success(message);
    } else {
      toast.error(message);
    }

    void refresh();
    router.replace(getDashboardAccountPath('integrations'));
  }, [refresh, router, searchParams]);

  const connectedCount = useMemo(
    () => providers.filter((provider) => provider.connected).length,
    [providers]
  );

  async function handleConnect(provider: CloudProviderId) {
    setBusyProvider(provider);
    try {
      await startCloudConnection(provider);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to start the cloud connection.');
      setBusyProvider(null);
    }
  }

  async function handleDisconnect(provider: CloudProviderId) {
    setBusyProvider(provider);
    try {
      await disconnectCloudConnection(provider);
      toast.success('Cloud connection removed.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to disconnect the cloud provider.');
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_48%,#ecfeff_100%)] p-6 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase  text-sky-700 shadow-xs">
              <Link2 className="h-4 w-4" />
              Cloud Integrations
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Connect your own cloud accounts for export-only access</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Each connection belongs to the signed-in user, not the whole workspace. We only export completed signed PDFs that you explicitly choose from the cloud library.
            </p>
          </div>

          <div className="grid min-w-55 gap-3 rounded-2xl border border-sky-100 bg-white/90 p-4 text-sm shadow-xs">
            <div>
              <div className="text-xs uppercase text-slate-500">Connected providers</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{connectedCount}</div>
            </div>
            <div className="text-sm text-slate-600">
              Signed PDFs stay in SignWorkflow until you export them.
            </div>
          </div>
        </div>
      </section>

      {subscriptionLoading ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" />
            Checking cloud access for this workspace...
          </div>
        </section>
      ) : !hasCloudLibraryAccess ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-semibold text-slate-900">Cloud exports are part of the Business plan</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {getRequiredTierLabelForFeature('cloud_library')} is required before workspace members can connect Google Drive or Dropbox for signed-document exports.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-3">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-xs">
              Loading cloud integrations...
            </div>
          ) : (
            providers.map((provider) => {
              const isBusy = busyProvider === provider.provider;
              const canConnect = hasCloudLibraryAccess && provider.configured;
              return (
                <article
                  key={provider.provider}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
                >
                  <div className="">
                    <div className='flex items-start justify-between '>
                      <h2 className="text-lg font-semibold text-slate-900">{provider.label}</h2>
                      <span className={`flex whitespace-nowrap items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${provider.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {provider.connected ? <CheckCircle2 className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
                      {provider.connected ? 'Connected' : 'Not connected'}
                    </span>
                    </div>
                    <p className="mt-2 flex-col text-sm leading-6 text-slate-600">{providerCaptions[provider.provider]}</p>

                  </div>

                  <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <div>
                      <span className="font-medium text-slate-800">Account</span>
                      <div className="mt-1">{provider.accountName || provider.accountEmail || 'No account connected yet'}</div>
                    </div>
                    <div>
                      <span className="font-medium text-slate-800">Last export</span>
                      <div className="mt-1">
                        {provider.lastExportedAt ? new Date(provider.lastExportedAt).toLocaleString('en-IN') : 'No exports yet'}
                      </div>
                    </div>
                    {!provider.configured ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                        This provider is not available in this environment yet.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {provider.connected ? (
                      <Button size="sm"
                        type="button"
                        inverted
                        disabled={isBusy}
                        onClick={() => handleDisconnect(provider.provider)}
                        icon={isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button size="sm"
                        type="button"
                        disabled={!canConnect || isBusy}
                        onClick={() => handleConnect(provider.provider)}
                        icon={isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                      >
                        Connect {provider.label}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 text-sky-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">How this works</h2>
            <ul className="mt-3  text-sm leading-6 text-slate-600">
              <li>Connections are delegated per user, so each member controls their own cloud account.</li>
              <li>SignWorkflow keeps signed PDFs in the workspace cloud library until you explicitly export them.</li>
              <li>Disconnecting a provider stops future exports immediately without affecting documents already uploaded to that provider.</li>
            </ul>
          </div>
        </div>
      </section>

      <DeveloperIntegrationsPanel />
    </div>
  );
}
