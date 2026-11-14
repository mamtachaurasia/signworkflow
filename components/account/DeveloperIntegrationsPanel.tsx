'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, LoaderCircle, Pause, Pencil, Play, RotateCcw, Send, Settings2, Trash2, Webhook } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button, Input } from '@ui';
import { useRecoveryHistory } from '@/hooks/useRecoveryHistory';
import RecoveryHistoryControls from '@/components/account/RecoveryHistoryControls';
import { getCookieValue } from '@/utils/cookies';

type ApiKeyItem = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  allowedIpCidrs?: string[];
  maxRequestsPerMinute?: number;
  rotationIntervalDays?: number | null;
  rotationDueAt?: string | null;
  rotatedAt?: string | null;
};

type WebhookItem = {
  id: string;
  url: string;
  secretPrefix: string;
  signatureVersion: 'v1' | 'v2';
  eventContractVersion: 'legacy' | 'v1';
  events: string[];
  active: boolean;
  pausedAt?: string | null;
  failureCount: number;
  lastDeliveredAt?: string | null;
  lastStatusCode?: number | null;
};

type WebhookDeliveryItem = {
  attemptHistory?: Array<{ sequence: number; startedAt: string; finishedAt: string | null; outcome: string; statusCode: number | null; error: string | null }>;
  id: string;
  endpointId: string;
  eventId: string;
  event: string;
  status: 'pending' | 'paused' | 'processing' | 'delivered' | 'failed' | 'dead_letter';
  attempts: number;
  maxAttempts: number;
  lastStatusCode?: number | null;
  lastError?: string | null;
  createdAt: string;
};

async function apiRequest(path: string, init?: RequestInit) {
  const csrfToken = getCookieValue('csrf_token');
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken && init?.method && init.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || 'Request failed.');
  return payload;
}

export default function DeveloperIntegrationsPanel() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const history = useRecoveryHistory<WebhookDeliveryItem>('/api/v1/webhooks/deliveries', 'deliveries');
  const deliveries = history.items;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('Production API');
  const [writeScope, setWriteScope] = useState(false);
  const [keyExpiryDays, setKeyExpiryDays] = useState('');
  const [keyAllowedIpCidrs, setKeyAllowedIpCidrs] = useState('');
  const [keyRequestsPerMinute, setKeyRequestsPerMinute] = useState('600');
  const [keyRotationIntervalDays, setKeyRotationIntervalDays] = useState('');
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [removeEditedKeyExpiry, setRemoveEditedKeyExpiry] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState('*');
  const [editingWebhook, setEditingWebhook] = useState<{ id: string; url: string; events: string } | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ label: string; value: string } | null>(null);
  const [authorized, setAuthorized] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [keyPayload, webhookPayload] = await Promise.all([
        apiRequest('/api/v1/keys'),
        apiRequest('/api/v1/webhooks'),
      ]);
      setKeys(Array.isArray(keyPayload.keys) ? keyPayload.keys : []);
      setWebhooks(Array.isArray(webhookPayload.webhooks) ? webhookPayload.webhooks : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load developer integrations.';
      if (message.includes('Admin access required')) setAuthorized(false);
      else toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createKey() {
    setBusy('create-key');
    try {
      const payload = await apiRequest('/api/v1/keys', {
        method: 'POST',
        body: JSON.stringify({
          name: keyName,
          scopes: writeScope ? ['documents:read', 'documents:write'] : ['documents:read'],
          ...(keyExpiryDays.trim() ? { expiresInDays: Number(keyExpiryDays) } : {}),
          ...(keyAllowedIpCidrs.trim() ? { allowedIpCidrs: keyAllowedIpCidrs.split(',').map((value) => value.trim()).filter(Boolean) } : {}),
          ...(keyRequestsPerMinute.trim() ? { maxRequestsPerMinute: Number(keyRequestsPerMinute) } : {}),
          ...(keyRotationIntervalDays.trim() ? { rotationIntervalDays: Number(keyRotationIntervalDays) } : {}),
        }),
      });
      setRevealedSecret({ label: 'API key', value: payload.secret });
      setKeyExpiryDays('');
      setKeyAllowedIpCidrs('');
      setKeyRequestsPerMinute('600');
      setKeyRotationIntervalDays('');
      toast.success('API key created. Copy it now.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create API key.');
    } finally {
      setBusy(null);
    }
  }

  function beginEditKey(key: ApiKeyItem) {
    if (key.rotatedAt) return;
    setEditingKeyId(key.id);
    setKeyName(key.name);
    setWriteScope(key.scopes.includes('documents:write'));
    setKeyExpiryDays(key.expiresAt ? String(Math.max(1, Math.ceil((new Date(key.expiresAt).getTime() - Date.now()) / 86_400_000))) : '');
    setKeyAllowedIpCidrs((key.allowedIpCidrs || []).join(', '));
    setKeyRequestsPerMinute(String(key.maxRequestsPerMinute || 600));
    setKeyRotationIntervalDays(key.rotationIntervalDays ? String(key.rotationIntervalDays) : '');
    setRemoveEditedKeyExpiry(false);
  }

  function cancelEditKey() {
    setEditingKeyId(null);
    setKeyName('Production API');
    setWriteScope(false);
    setKeyExpiryDays('');
    setKeyAllowedIpCidrs('');
    setKeyRequestsPerMinute('600');
    setKeyRotationIntervalDays('');
    setRemoveEditedKeyExpiry(false);
  }

  async function saveKeyControls() {
    if (!editingKeyId) return;
    setBusy(`save-key-${editingKeyId}`);
    try {
      await apiRequest(`/api/v1/keys/${encodeURIComponent(editingKeyId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: keyName,
          scopes: writeScope ? ['documents:read', 'documents:write'] : ['documents:read'],
          allowedIpCidrs: keyAllowedIpCidrs.split(',').map((value) => value.trim()).filter(Boolean),
          maxRequestsPerMinute: Number(keyRequestsPerMinute),
          rotationIntervalDays: keyRotationIntervalDays.trim() ? Number(keyRotationIntervalDays) : null,
          ...(removeEditedKeyExpiry ? { expiresInDays: null } : keyExpiryDays.trim() ? { expiresInDays: Number(keyExpiryDays) } : {}),
        }),
      });
      toast.success('API key controls updated.');
      cancelEditKey();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update API key controls.');
    } finally {
      setBusy(null);
    }
  }

  async function rotateKey(id: string) {
    setBusy(`rotate-key-${id}`);
    try {
      const payload = await apiRequest(`/api/v1/keys/${encodeURIComponent(id)}/rotate`, {
        method: 'POST',
        body: JSON.stringify({ overlapHours: 24 }),
      });
      setRevealedSecret({ label: 'Replacement API key', value: payload.secret });
      if (editingKeyId === id) cancelEditKey();
      toast.success('Replacement API key created. The previous key expires within 24 hours.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to rotate API key.');
    } finally {
      setBusy(null);
    }
  }

  async function revokeKey(id: string) {
    setBusy(`key-${id}`);
    try {
      await apiRequest(`/api/v1/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (editingKeyId === id) cancelEditKey();
      toast.success('API key revoked.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke API key.');
    } finally {
      setBusy(null);
    }
  }

  async function createWebhook() {
    setBusy('create-webhook');
    try {
      const events = webhookEvents.split(',').map((event) => event.trim()).filter(Boolean);
      const payload = await apiRequest('/api/v1/webhooks', {
        method: 'POST',
        body: JSON.stringify({ url: webhookUrl, events }),
      });
      setRevealedSecret({ label: 'Webhook signing secret', value: payload.secret });
      setWebhookUrl('');
      toast.success('Webhook endpoint created.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create webhook.');
    } finally {
      setBusy(null);
    }
  }

  async function testWebhook(id: string) {
    setBusy(`test-${id}`);
    try {
      await apiRequest(`/api/v1/webhooks/${encodeURIComponent(id)}/test`, { method: 'POST' });
      toast.success('Test webhook delivered.');
      await refresh();
      await history.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test delivery failed.');
      await refresh();
      await history.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function revokeWebhook(id: string) {
    setBusy(`webhook-${id}`);
    try {
      await apiRequest(`/api/v1/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.success('Webhook revoked.');
      await refresh();
      await history.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke webhook.');
    } finally {
      setBusy(null);
    }
  }

  async function saveWebhook() {
    if (!editingWebhook) return;
    setBusy(`save-webhook-${editingWebhook.id}`);
    try {
      const events = editingWebhook.events.split(',').map((event) => event.trim()).filter(Boolean);
      await apiRequest(`/api/v1/webhooks/${encodeURIComponent(editingWebhook.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ url: editingWebhook.url, events }),
      });
      setEditingWebhook(null);
      toast.success('Webhook updated.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update webhook.');
    } finally {
      setBusy(null);
    }
  }

  async function setWebhookActive(webhook: WebhookItem) {
    setBusy(`state-webhook-${webhook.id}`);
    try {
      await apiRequest(`/api/v1/webhooks/${encodeURIComponent(webhook.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !webhook.active }),
      });
      toast.success(webhook.active ? 'Webhook paused.' : 'Webhook resumed.');
      await refresh();
      await history.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update webhook.');
    } finally {
      setBusy(null);
    }
  }

  async function rotateWebhookSecret(id: string) {
    setBusy(`rotate-webhook-${id}`);
    try {
      const payload = await apiRequest(`/api/v1/webhooks/${encodeURIComponent(id)}/rotate-secret`, { method: 'POST' });
      setRevealedSecret({ label: 'New webhook signing secret', value: payload.secret });
      toast.success('Webhook secret rotated. Update the receiver now.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to rotate webhook secret.');
    } finally {
      setBusy(null);
    }
  }

  async function replayDelivery(id: string) {
    setBusy(`replay-${id}`);
    try {
      const payload = await apiRequest(`/api/v1/webhooks/deliveries/${encodeURIComponent(id)}/replay`, {
        method: 'POST',
      });
      if (payload.delivery?.status === 'delivered') toast.success('Webhook replay delivered.');
      else toast.success('Webhook replay queued for retry.');
      await refresh();
      await history.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to replay webhook delivery.');
      await refresh();
      await history.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!authorized) return null;

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">Developer integrations</div>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">API keys and signed webhooks</h2>
        <p className="mt-2 text-sm text-slate-600">
          Workspace administrators can create scoped credentials and webhook endpoints. Secrets are shown only once.{' '}
          <a className="font-medium text-brand-700 hover:underline" href="/api/v1/openapi" target="_blank" rel="noreferrer">Download OpenAPI JSON</a>
        </p>
      </div>

      {revealedSecret ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900">{revealedSecret.label} — copy now</div>
          <div className="mt-2 flex gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-800">{revealedSecret.value}</code>
            <Button size="sm" type="button" onClick={() => void navigator.clipboard.writeText(revealedSecret.value)} icon={<Copy className="h-4 w-4" />}>Copy</Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading developer integrations…</div>
      ) : (
        <>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-brand-600" /><h3 className="font-semibold text-slate-900">API keys</h3></div>
            <Input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="Key name" />
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={writeScope} onChange={(event) => setWriteScope(event.target.checked)} /> Allow document creation and sending</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="number" min="1" max="3650" value={keyExpiryDays} onChange={(event) => setKeyExpiryDays(event.target.value)} placeholder="Expiry in days (optional)" />
              <Input type="number" min="1" max="600" value={keyRequestsPerMinute} onChange={(event) => setKeyRequestsPerMinute(event.target.value)} placeholder="Requests/minute (1–600)" />
              <Input value={keyAllowedIpCidrs} onChange={(event) => setKeyAllowedIpCidrs(event.target.value)} placeholder="Allowed IPs/CIDRs (optional)" />
              <Input type="number" min="1" max="365" value={keyRotationIntervalDays} onChange={(event) => setKeyRotationIntervalDays(event.target.value)} placeholder="Rotation reminder days" />
            </div>
            {editingKeyId ? (
              <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50 p-3">
                <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={removeEditedKeyExpiry} onChange={(event) => setRemoveEditedKeyExpiry(event.target.checked)} /> Remove this key&apos;s expiration</label>
                <div className="flex gap-2"><Button size="sm" type="button" disabled={!keyName.trim() || busy === `save-key-${editingKeyId}`} onClick={saveKeyControls}>Save controls</Button><Button size="sm" inverted type="button" onClick={cancelEditKey}>Cancel</Button></div>
              </div>
            ) : <Button size="sm" type="button" disabled={!keyName.trim() || busy === 'create-key'} onClick={createKey}>Create API key</Button>}
            <p className="text-xs leading-5 text-slate-500">Leave the IP list empty to allow any address. A rotation reminder never changes a secret automatically; use Rotate to receive a new one with a 24-hour overlap.</p>
            <div className="space-y-2">
              {keys.length === 0 ? <p className="text-sm text-slate-500">No active API keys.</p> : keys.map((key) => (
                <div key={key.id} role="group" aria-label={`API key ${key.name}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="font-medium text-slate-800">{key.name}</div><div className="truncate text-xs text-slate-500">{key.prefix}… · {key.scopes.join(', ')}</div></div>
                    <div className="flex shrink-0 gap-2">
                      {!key.rotatedAt ? <>
                        <Button size="sm" inverted type="button" onClick={() => beginEditKey(key)} icon={<Settings2 className="h-4 w-4" />}>Controls</Button>
                        <Button size="sm" inverted type="button" disabled={busy === `rotate-key-${key.id}`} onClick={() => rotateKey(key.id)} icon={<RotateCcw className="h-4 w-4" />}>Rotate</Button>
                      </> : null}
                      <Button size="sm" inverted type="button" disabled={busy === `key-${key.id}`} onClick={() => revokeKey(key.id)} icon={<Trash2 className="h-4 w-4" />}>Revoke</Button>
                    </div>
                  </div>
                  {key.rotatedAt ? <p className="mt-2 text-xs text-amber-700">Rotated key{key.expiresAt ? ` — fixed retirement: ${new Date(key.expiresAt).toLocaleString()}` : ''}. Only revocation is available.</p> : null}
                  <div className="mt-2 text-xs text-slate-500">{key.expiresAt ? `Expires ${new Date(key.expiresAt).toLocaleDateString()}` : 'No expiry'} · {(key.allowedIpCidrs || []).length ? `IPs: ${(key.allowedIpCidrs || []).join(', ')}` : 'Any IP'} · {key.maxRequestsPerMinute || 600}/min{key.rotationDueAt && !key.rotatedAt ? ` · Rotate by ${new Date(key.rotationDueAt).toLocaleDateString()}` : ''}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2"><Webhook className="h-5 w-5 text-sky-600" /><h3 className="font-semibold text-slate-900">Webhooks</h3></div>
            <Input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://example.com/webhooks/signworkflow" />
            <Input value={webhookEvents} onChange={(event) => setWebhookEvents(event.target.value)} placeholder="* or comma-separated event names" />
            <p className="text-xs leading-5 text-slate-500">Verify the HMAC signature using the timestamp and signature headers. Reject timestamps outside your replay window.</p>
            <Button size="sm" type="button" disabled={!webhookUrl.trim() || busy === 'create-webhook'} onClick={createWebhook}>Add webhook</Button>
            <div className="space-y-2">
              {webhooks.length === 0 ? <p className="text-sm text-slate-500">No webhook endpoints.</p> : webhooks.map((webhook) => (
                <div key={webhook.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                  {editingWebhook?.id === webhook.id ? (
                    <div className="space-y-2">
                      <Input value={editingWebhook.url} onChange={(event) => setEditingWebhook({ ...editingWebhook, url: event.target.value })} aria-label="Webhook URL" />
                      <Input value={editingWebhook.events} onChange={(event) => setEditingWebhook({ ...editingWebhook, events: event.target.value })} aria-label="Webhook events" />
                      <div className="flex gap-2">
                        <Button size="sm" type="button" disabled={!editingWebhook.url.trim() || busy === `save-webhook-${webhook.id}`} onClick={saveWebhook}>Save</Button>
                        <Button size="sm" inverted type="button" onClick={() => setEditingWebhook(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : <>
                    <div className="truncate font-medium text-slate-800">{webhook.url}</div>
                    <div className="mt-1 text-xs text-slate-500">{webhook.events.join(', ')} · {webhook.active ? 'Active' : 'Paused'} · HMAC {webhook.signatureVersion} · Event contract {webhook.eventContractVersion} · Last status {webhook.lastStatusCode ?? 'never'} · Failures {webhook.failureCount}</div>
                  </>}
                  {webhook.signatureVersion === 'v1' ? <div className="mt-1 text-xs text-amber-700">Legacy raw-body signature. Recreate this endpoint when the receiver is ready for timestamped v2 verification.</div> : null}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" type="button" disabled={!webhook.active || busy === `test-${webhook.id}`} onClick={() => testWebhook(webhook.id)} icon={<Send className="h-4 w-4" />}>Test</Button>
                    <Button size="sm" inverted type="button" disabled={busy === `save-webhook-${webhook.id}`} onClick={() => setEditingWebhook({ id: webhook.id, url: webhook.url, events: webhook.events.join(', ') })} icon={<Pencil className="h-4 w-4" />}>Edit</Button>
                    <Button size="sm" inverted type="button" disabled={busy === `state-webhook-${webhook.id}`} onClick={() => setWebhookActive(webhook)} icon={webhook.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}>{webhook.active ? 'Pause' : 'Resume'}</Button>
                    <Button size="sm" inverted type="button" disabled={busy === `rotate-webhook-${webhook.id}`} onClick={() => rotateWebhookSecret(webhook.id)} icon={<RotateCcw className="h-4 w-4" />}>Rotate secret</Button>
                    <Button size="sm" inverted type="button" disabled={busy === `webhook-${webhook.id}`} onClick={() => revokeWebhook(webhook.id)} icon={<Trash2 className="h-4 w-4" />}>Revoke</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Webhook delivery history</h3>
              <p className="mt-1 text-xs text-slate-500">Non-2xx responses retry with backoff. Failed and dead-letter deliveries can be replayed here.</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <RecoveryHistoryControls label="Webhook deliveries" {...history} webhook onChange={history.setFilters} onLoadMore={history.loadMore} onRefresh={history.refresh} />
            {deliveries.length === 0 && !history.loading ? <p className="text-sm text-slate-500">No webhook deliveries match these filters.</p> : deliveries.map((delivery) => {
              const endpoint = webhooks.find((webhook) => webhook.id === delivery.endpointId);
              const retryable = delivery.status === 'failed' || delivery.status === 'dead_letter';
              return (
                <div key={delivery.id} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 text-sm md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800">{delivery.event}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {endpoint?.url || 'Revoked endpoint'} · {delivery.status.replace('_', ' ')} · HTTP {delivery.lastStatusCode ?? '—'} · attempt {delivery.attempts}/{delivery.maxAttempts}
                    </div>
                    {delivery.lastError ? <div className="mt-1 text-xs text-rose-700">{delivery.lastError}</div> : null}
                    {delivery.attemptHistory?.length ? <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Attempt outcomes ({delivery.attemptHistory.length})</summary><ol className="mt-2 space-y-1">{delivery.attemptHistory.map((attempt) => <li key={attempt.sequence}>#{attempt.sequence} · {new Date(attempt.startedAt).toLocaleString()} · {attempt.outcome} · HTTP {attempt.statusCode ?? '—'}{attempt.error ? ` · ${attempt.error}` : ''}</li>)}</ol></details> : <p className="mt-1 text-xs text-slate-500">No recorded attempt outcomes.</p>}
                  </div>
                  {retryable ? (
                    <Button size="sm" inverted type="button" disabled={busy === `replay-${delivery.id}`} onClick={() => replayDelivery(delivery.id)} icon={busy === `replay-${delivery.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}>Replay</Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}
    </section>
  );
}
