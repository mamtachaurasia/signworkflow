'use client';

import { getCookieValue } from '@/utils/cookies';

import type { CloudConnectionSummary, CloudProviderId, WorkspaceCloudConnectionSummary } from '@/lib/cloud/types';

export type CloudAutoExportRule = {
  id: string;
  provider: CloudProviderId;
  enabled: boolean;
  destinationFolder: string | null;
  updatedAt?: string;
};

export type CloudExportJobSummary = {
  id: string;
  documentId: string;
  provider: CloudProviderId;
  destinationFolder: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  attempts: number;
  maxAttempts: number;
  completedAt: string | null;
  providerUrl: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceCloudArchiveRule = CloudAutoExportRule;
export type WorkspaceCloudArchiveJobSummary = CloudExportJobSummary;

type ApiErrorPayload = {
  message?: string;
};

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return new Error(payload?.message || fallback);
}

export async function listCloudConnections(): Promise<CloudConnectionSummary[]> {
  const response = await fetch('/api/cloud/connections', {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Unable to load cloud connections.');
  }

  const payload = (await response.json()) as { providers?: CloudConnectionSummary[] };
  return Array.isArray(payload.providers) ? payload.providers : [];
}

export async function startCloudConnection(provider: CloudProviderId): Promise<void> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch(`/api/cloud/connections/${encodeURIComponent(provider)}/connect`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify({ scope: 'user' }),
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Unable to start the cloud connection.');
  }

  const payload = (await response.json()) as { authorizationUrl?: string };
  if (!payload.authorizationUrl) {
    throw new Error('The cloud provider did not return an authorization URL.');
  }

  window.location.assign(payload.authorizationUrl);
}

export async function startWorkspaceCloudConnection(provider: CloudProviderId): Promise<void> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch(`/api/cloud/connections/${encodeURIComponent(provider)}/connect`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify({ scope: 'workspace' }),
  });
  if (!response.ok) throw await parseApiError(response, 'Unable to start the workspace cloud connection.');
  const payload = (await response.json()) as { authorizationUrl?: string };
  if (!payload.authorizationUrl) throw new Error('The cloud provider did not return an authorization URL.');
  window.location.assign(payload.authorizationUrl);
}

export async function disconnectCloudConnection(provider: CloudProviderId): Promise<void> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch(`/api/cloud/connections/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Unable to disconnect the cloud provider.');
  }
}

export async function exportDocumentToCloud(args: {
  provider: CloudProviderId;
  documentId: string;
}): Promise<{ message: string; providerUrl: string | null }> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch('/api/cloud/export', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw await parseApiError(response, 'Unable to export the signed PDF.');
  }

  return (await response.json()) as { message: string; providerUrl: string | null };
}

export async function exportDocumentsToCloud(args: {
  provider: CloudProviderId;
  documentIds: string[];
}): Promise<{ requested: number; succeeded: number; failed: number }> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch('/api/cloud/export-batch', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw await parseApiError(response, 'Unable to export the selected documents.');
  return (await response.json()) as { requested: number; succeeded: number; failed: number };
}

export async function getAutomaticCloudExports(): Promise<{
  rules: CloudAutoExportRule[];
  jobs: CloudExportJobSummary[];
}> {
  const response = await fetch('/api/cloud/auto-export', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw await parseApiError(response, 'Unable to load automatic export rules.');
  return (await response.json()) as {
    rules: CloudAutoExportRule[];
    jobs: CloudExportJobSummary[];
  };
}

export async function updateAutomaticCloudExport(args: {
  provider: CloudProviderId;
  enabled: boolean;
  destinationFolder: string | null;
}): Promise<CloudAutoExportRule> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch('/api/cloud/auto-export', {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw await parseApiError(response, 'Unable to update the automatic export rule.');
  const payload = (await response.json()) as { rule: CloudAutoExportRule };
  return payload.rule;
}

export async function retryAutomaticCloudExport(jobId: string): Promise<void> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch(`/api/cloud/auto-export/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });
  if (!response.ok) throw await parseApiError(response, 'Unable to retry the automatic export.');
}

export async function getWorkspaceCloudArchive(): Promise<{
  providers: WorkspaceCloudConnectionSummary[];
  rules: WorkspaceCloudArchiveRule[];
  jobs: WorkspaceCloudArchiveJobSummary[];
}> {
  const response = await fetch('/api/cloud/workspace-archive', { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw await parseApiError(response, 'Unable to load workspace archive settings.');
  return (await response.json()) as {
    providers: WorkspaceCloudConnectionSummary[];
    rules: WorkspaceCloudArchiveRule[];
    jobs: WorkspaceCloudArchiveJobSummary[];
  };
}

export async function updateWorkspaceCloudArchive(args: {
  provider: CloudProviderId;
  enabled: boolean;
  destinationFolder: string | null;
}): Promise<WorkspaceCloudArchiveRule> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch('/api/cloud/workspace-archive', {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw await parseApiError(response, 'Unable to update workspace archive settings.');
  return ((await response.json()) as { rule: WorkspaceCloudArchiveRule }).rule;
}

export async function retryWorkspaceCloudArchive(jobId: string): Promise<void> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch(`/api/cloud/workspace-archive/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST', credentials: 'include', headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
  });
  if (!response.ok) throw await parseApiError(response, 'Unable to retry the workspace archive job.');
}

export async function disconnectWorkspaceCloudConnection(provider: CloudProviderId): Promise<void> {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch(`/api/cloud/workspace-connections/${encodeURIComponent(provider)}`, {
    method: 'DELETE', credentials: 'include', headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
  });
  if (!response.ok) throw await parseApiError(response, 'Unable to disconnect the workspace archive destination.');
}
