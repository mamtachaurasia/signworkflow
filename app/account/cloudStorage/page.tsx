'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Cloud, Download, FolderOpen, LoaderCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@ui';
import { useCloudConnections } from '@/hooks/useCloudConnections';
import useContextStore from '@/hooks/useContextStore';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { getDashboardAccountPath } from '@/lib/account-routing';
import { exportDocumentToCloud, exportDocumentsToCloud } from '@/lib/cloud-client';
import type { CloudProviderId } from '@/lib/cloud/types';
import { getRequiredTierLabelForFeature } from '@/lib/subscription-plans';
import { isAdminRole } from '@/lib/role-utils';
import AutomaticCloudExportPanel from '@/components/account/AutomaticCloudExportPanel';
import WorkspaceCloudArchivePanel from '@/components/account/WorkspaceCloudArchivePanel';

export default function CloudStorage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledCloudResult = useRef<string | null>(null);
  const { documents, user } = useContextStore();
  const isAdmin = isAdminRole(user?.role);
  const { status: subscriptionStatus, loading } = useSubscriptionStatus({ enabled: true });
  const hasCloudLibraryAccess = subscriptionStatus.entitlements.cloudLibrary;
  const { providers, loading: connectionsLoading, refresh } = useCloudConnections({
    enabled: !loading && hasCloudLibraryAccess,
  });
  const [busyExportKey, setBusyExportKey] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const completedDocuments = documents
    .filter((document) => !document.deletedAt && document.status === 'completed')
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const connectedProviders = useMemo(
    () => providers.filter((provider) => provider.connected),
    [providers]
  );
  const documentNames = useMemo(
    () => Object.fromEntries(documents.map((document) => [document.documentId || document.id, document.name])),
    [documents]
  );

  useEffect(() => {
    const cloudStatus = searchParams.get('cloud_status');
    const message = searchParams.get('message');
    if (!cloudStatus || !message) {
      handledCloudResult.current = null;
      return;
    }

    const resultKey = JSON.stringify([cloudStatus, message]);
    if (handledCloudResult.current === resultKey) return;
    handledCloudResult.current = resultKey;

    if (cloudStatus === 'connected') toast.success(message);
    else toast.error(message);

    const remainingParams = new URLSearchParams(searchParams.toString());
    remainingParams.delete('cloud_status');
    remainingParams.delete('message');
    remainingParams.delete('provider');
    const query = remainingParams.toString();
    router.replace(`${getDashboardAccountPath('cloud-storages')}${query ? `?${query}` : ''}`, { scroll: false });
  }, [router, searchParams]);

  const handleOpenDocument = (documentId: string) => {
    window.open(`/api/documents/${encodeURIComponent(documentId)}`, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadSigned = async (documentId: string, documentName: string) => {
    try {
      const response = await fetch(
        `/api/documents/download-signed?documentId=${encodeURIComponent(documentId)}`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || 'Unable to download signed document');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${documentName}-signed.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to download signed document');
    }
  };

  async function handleExport(documentId: string, provider: CloudProviderId) {
    const key = `${documentId}:${provider}`;
    setBusyExportKey(key);
    try {
      const result = await exportDocumentToCloud({
        documentId,
        provider,
      });
      toast.success(result.message);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to export the signed PDF.');
    } finally {
      setBusyExportKey(null);
    }
  }

  async function handleBatchExport(provider: CloudProviderId) {
    const documentIds = [...selectedDocumentIds];
    if (documentIds.length === 0) return;
    setBusyExportKey(`batch:${provider}`);
    try {
      const result = await exportDocumentsToCloud({ provider, documentIds });
      if (result.failed > 0) toast.error(`${result.succeeded} exported; ${result.failed} failed.`);
      else toast.success(`${result.succeeded} documents exported successfully.`);
      if (result.succeeded > 0) setSelectedDocumentIds(new Set());
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to export the selected documents.');
    } finally {
      setBusyExportKey(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" />
          Checking cloud library access for this workspace...
        </div>
      </div>
    );
  }

  if (!hasCloudLibraryAccess) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="text-sm font-medium text-slate-900">Cloud storage</div>
        <p className="mt-2 text-sm text-slate-600">
          {getRequiredTierLabelForFeature('cloud_library')} is required to manage signed documents in your
          workspace cloud library and export them to connected cloud providers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-linear-to-br from-sky-50 via-white to-cyan-50 p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-sky-700">
              <Cloud className="h-4 w-4" />
              Cloud Library
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Keep signed documents organized in the cloud</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Completed documents stay available inside SignWorkflow, and you can export the signed PDF to your connected Google Drive or Dropbox accounts whenever you need an external copy.
            </p>
          </div>
          <div className="grid min-w-45 gap-3 rounded-2xl border border-sky-100 bg-white/90 p-4 text-sm shadow-xs">
            <div>
              <div className="text-xs uppercase text-slate-500">Completed documents</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{completedDocuments.length}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Connected providers</div>
              <div className="mt-1 font-medium text-slate-900">{connectionsLoading ? 'Loading...' : connectedProviders.length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Connected export destinations</h2>
            <p className="text-sm text-slate-600">Export-only connections stay personal to the signed-in user.</p>
          </div>
          <Link
            href={getDashboardAccountPath('integrations')}
            className="text-sm font-medium text-sky-700 hover:text-sky-800"
          >
            Manage cloud integrations
          </Link>
        </div>

        {connectedProviders.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
            <Cloud className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-sm font-medium text-slate-700">No cloud providers connected yet</p>
            <p className="mt-2 text-sm text-slate-500">
              Connect Google Drive or Dropbox from Integrations, then export any completed signed PDF from this archive.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {connectedProviders.map((provider) => (
              <div key={provider.provider} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="font-medium text-slate-900">{provider.label}</div>
                <div className="mt-1">{provider.accountName || provider.accountEmail || 'Connected account'}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {provider.lastExportedAt ? `Last export ${new Date(provider.lastExportedAt).toLocaleDateString('en-IN')}` : 'Ready for export'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AutomaticCloudExportPanel providers={providers} documentNames={documentNames} />

      {isAdmin ? <WorkspaceCloudArchivePanel documentNames={documentNames} /> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Completed document archive</h2>
            <p className="text-sm text-slate-600">Your finished documents are grouped here for quick retrieval.</p>
          </div>
        </div>

        {isAdmin && selectedDocumentIds.size > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
            <span className="mr-auto text-sm font-medium text-sky-900">{selectedDocumentIds.size} selected</span>
            {connectedProviders.map((provider) => (
              <Button
                size="sm"
                key={provider.provider}
                type="button"
                disabled={busyExportKey === `batch:${provider}`}
                onClick={() => handleBatchExport(provider.provider)}
                icon={busyExportKey === `batch:${provider}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
              >
                Export selected to {provider.label}
              </Button>
            ))}
          </div>
        ) : null}

        {completedDocuments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-sm font-medium text-slate-700">No completed documents yet</p>
            <p className="mt-2 text-sm text-slate-500">
              Completed signing requests will appear here automatically once everyone finishes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {completedDocuments.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    {isAdmin ? (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={selectedDocumentIds.has(document.documentId || document.id)}
                        onChange={(event) => {
                          const id = document.documentId || document.id;
                          setSelectedDocumentIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(id);
                            else next.delete(id);
                            return next;
                          });
                        }}
                        aria-label={`Select ${document.name} for batch export`}
                      />
                    ) : null}
                    <div>
                    <div className="font-medium text-slate-900">{document.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Completed on {document.createdAt.toLocaleDateString('en-IN')}
                    </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm"
                      type="button"
                      inverted
                      onClick={() => handleOpenDocument(document.documentId || document.id)}
                      icon={<FolderOpen className="h-4 w-4" />}
                    >
                      Open
                    </Button>
                    <Button size="sm"
                      type="button"
                      onClick={() => handleDownloadSigned(document.documentId || document.id, document.name)}
                      icon={<Download className="h-4 w-4" />}
                    >
                      Download signed PDF
                    </Button>
                  </div>
                </div>

                {connectedProviders.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {connectedProviders.map((provider) => {
                      const exportKey = `${document.documentId || document.id}:${provider.provider}`;
                      const isBusy = busyExportKey === exportKey;
                      return (
                        <Button size="sm"
                          key={provider.provider}
                          type="button"
                          inverted
                          disabled={isBusy}
                          onClick={() => handleExport(document.documentId || document.id, provider.provider)}
                          icon={isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                        >
                          Export to {provider.label}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
