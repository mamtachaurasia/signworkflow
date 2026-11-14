import { createHash, createHmac, randomBytes } from 'crypto';

import { decryptCloudSecret, encryptCloudSecret } from '@/lib/cloud/crypto';
import { postWebhookJson } from '@/lib/webhook-url';
import WebhookDeliveryModel from '@/models/WebhookDelivery';
import WebhookEndpointModel from '@/models/WebhookEndpoint';
import type { WebhookSignatureVersion } from '@/models/WebhookEndpoint';
import {
  getPublishedWebhookEvent,
  isWebhookEventSubscriptionMatch,
  WEBHOOK_EVENT_CONTRACT_VERSION,
} from '@/lib/webhook-events';
import { getUsableWebhookEndpointFilter } from '@/lib/webhook-endpoint-state';
import connectDB from '@/utils/db';
import { isDuplicateKeyOnly } from '@/lib/mongo-duplicate-only';

const DELIVERY_LOCK_MS = 10 * 60 * 1000;
const RETRY_DELAYS_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60, 24 * 60 * 60];
const DEFAULT_TIMESTAMP_SIGNATURE_ROLLOUT_AT = '2026-09-04T11:37:26.000Z';
const PAUSED_DELIVERY_RECONCILIATION_BATCH_SIZE = 100;
export const PAUSED_WEBHOOK_DELIVERY_ERROR = 'Webhook endpoint is paused.';

type WebhookDeliveryTarget = {
  _id: unknown;
  url: string;
  secretEncrypted: string;
  signatureVersion?: WebhookSignatureVersion;
  eventContractVersion?: 'v1';
  active?: boolean;
  createdAt?: Date | string;
};

type WebhookPayload = {
  id: string;
  type: string;
  data: unknown;
  createdAt: string;
  schemaVersion?: string;
};

type WebhookEndpointQueueState = {
  _id: unknown;
  active?: boolean;
  pausedAt?: Date | null;
  revokedAt?: Date | null;
};

export function createWebhookSecret() {
  const secret = `whsec_${randomBytes(32).toString('base64url')}`;
  return {
    secret,
    secretHash: createHash('sha256').update(secret).digest('hex'),
    secretEncrypted: encryptCloudSecret(secret),
    secretPrefix: secret.slice(0, 14),
  };
}

function createWebhookPayload(event: string, data: unknown, versioned = false, identity?: { eventId?: string; createdAt?: Date }): WebhookPayload {
  return {
    id: identity?.eventId ?? `evt_${randomBytes(12).toString('hex')}`,
    type: event,
    data,
    createdAt: (identity?.createdAt ?? new Date()).toISOString(),
    ...(versioned ? { schemaVersion: WEBHOOK_EVENT_CONTRACT_VERSION } : {}),
  };
}

export function resolveWebhookSignatureVersion(endpoint: {
  signatureVersion?: WebhookSignatureVersion;
  createdAt?: Date | string;
}): WebhookSignatureVersion {
  if (endpoint.signatureVersion === 'v1' || endpoint.signatureVersion === 'v2') {
    return endpoint.signatureVersion;
  }

  const configuredCutoff = process.env.WEBHOOK_TIMESTAMP_SIGNATURE_ROLLOUT_AT?.trim()
    || DEFAULT_TIMESTAMP_SIGNATURE_ROLLOUT_AT;
  const cutoff = Date.parse(configuredCutoff);
  const createdAt = endpoint.createdAt ? new Date(endpoint.createdAt).getTime() : Number.NaN;
  return Number.isFinite(cutoff) && Number.isFinite(createdAt) && createdAt >= cutoff ? 'v2' : 'v1';
}

export async function deliverWebhookEvent(
  endpoint: WebhookDeliveryTarget,
  payload: WebhookPayload
): Promise<{ delivered: boolean; statusCode: number | null; error: string | null }> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Records that predate signature versioning intentionally remain on v1 so
  // their existing consumers continue to verify HMAC(rawBody).
  const signatureVersion = resolveWebhookSignatureVersion(endpoint);
  const signedPayload = signatureVersion === 'v2' ? `${timestamp}.${body}` : body;
  if (!endpoint.signatureVersion) {
    await WebhookEndpointModel.updateOne(
      { _id: endpoint._id, signatureVersion: { $exists: false } },
      { $set: { signatureVersion } }
    ).exec().catch(() => undefined);
  }
  let result: { statusCode: number; delivered: boolean };
  try {
    const signature = createHmac('sha256', decryptCloudSecret(endpoint.secretEncrypted))
      .update(signedPayload)
      .digest('hex');
    result = await postWebhookJson({
      url: endpoint.url,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'SignWorkflow-Webhooks/1.0',
        'x-signworkflow-timestamp': timestamp,
        'x-signworkflow-signature': `sha256=${signature}`,
        'x-signworkflow-signature-version': signatureVersion,
        ...(endpoint.eventContractVersion === 'v1'
          ? { 'x-signworkflow-event-version': WEBHOOK_EVENT_CONTRACT_VERSION }
          : {}),
      },
      body,
      timeoutMs: 8000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook delivery failed.';
    await WebhookEndpointModel.updateOne(
      { _id: endpoint._id },
      { $set: { lastDeliveredAt: new Date(), lastStatusCode: null }, $inc: { failureCount: 1 } }
    ).exec().catch(() => undefined);
    return { delivered: false, statusCode: null, error: message };
  }
  await WebhookEndpointModel.updateOne({ _id: endpoint._id }, result.delivered
    ? { $set: { lastDeliveredAt: new Date(), lastStatusCode: result.statusCode, failureCount: 0 } }
    : { $set: { lastDeliveredAt: new Date(), lastStatusCode: result.statusCode }, $inc: { failureCount: 1 } })
    .exec()
    .catch(() => undefined);
  return {
    delivered: result.delivered,
    statusCode: result.statusCode,
    error: result.delivered ? null : `Endpoint returned HTTP ${result.statusCode}.`,
  };
}

async function enqueueForEndpoints(args: {
  orgId: unknown;
  endpoints: Array<{ _id: unknown; active?: boolean }>;
  payload: WebhookPayload;
}) {
  if (args.endpoints.length === 0) return [];
  try {
    return await WebhookDeliveryModel.insertMany(args.endpoints.map((endpoint) => ({
    orgId: args.orgId,
    endpointId: endpoint._id,
    eventId: args.payload.id,
    event: args.payload.type,
    payload: args.payload,
    status: endpoint.active === false ? 'paused' : 'pending',
    lastError: endpoint.active === false ? PAUSED_WEBHOOK_DELIVERY_ERROR : null,
    pausedStateCheckedAt: null,
    attempts: 0,
    maxAttempts: 8,
    nextAttemptAt: new Date(),
  })), { ordered: false });
  } catch (error) {
    if (isDuplicateKeyOnly(error)) return [];
    throw error;
  }
}

export async function enqueueWebhookEvent(args: { orgId?: unknown; event: string; data: unknown; eventId?: string; createdAt?: Date }) {
  if (!args.orgId) return [];
  await connectDB();
  const endpoints = await WebhookEndpointModel.find({ orgId: args.orgId, ...getUsableWebhookEndpointFilter(),
    ...(args.createdAt ? { createdAt: { $lte: args.createdAt } } : {}),
  })
    .select('_id active events eventContractVersion')
    .lean<Array<{ _id: unknown; active?: boolean; events: string[]; eventContractVersion?: 'v1' }>>();
  const publishedEvent = getPublishedWebhookEvent(args.event);
  const legacyEndpoints = endpoints.filter(
    (endpoint) => endpoint.eventContractVersion !== 'v1'
      && isWebhookEventSubscriptionMatch(endpoint.events, args.event)
  );
  const versionedEndpoints = publishedEvent
    ? endpoints.filter(
      (endpoint) => endpoint.eventContractVersion === 'v1'
        && isWebhookEventSubscriptionMatch(endpoint.events, publishedEvent)
    )
    : [];
  const deliveries = await Promise.allSettled([
    legacyEndpoints.length > 0
      ? enqueueForEndpoints({
        orgId: args.orgId,
        endpoints: legacyEndpoints,
        payload: createWebhookPayload(args.event, args.data, false, args),
      })
      : [],
    versionedEndpoints.length > 0 && publishedEvent
      ? enqueueForEndpoints({
        orgId: args.orgId,
        endpoints: versionedEndpoints,
        payload: createWebhookPayload(publishedEvent, args.data, true, args),
      })
      : [],
  ]);
  const rejected = deliveries.find((result) => result.status === 'rejected');
  if (rejected?.status === 'rejected') throw rejected.reason;
  return deliveries.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
}

export async function enqueueWebhookTest(args: { orgId: string; endpointId: string }) {
  await connectDB();
  const endpoint = await WebhookEndpointModel.findOne({ _id: args.endpointId, orgId: args.orgId, active: true, revokedAt: null }).select('_id eventContractVersion').lean<{ _id: unknown; eventContractVersion?: 'v1' } | null>();
  if (!endpoint) return null;
  const deliveries = await enqueueForEndpoints({
    orgId: args.orgId,
    endpoints: [endpoint],
    payload: createWebhookPayload(
      'webhook.test',
      { message: 'Test delivery from SignWorkflow', requestedAt: new Date().toISOString() },
      endpoint.eventContractVersion === 'v1'
    ),
  });
  return deliveries[0] || null;
}

function retryAt(attempts: number): Date {
  const delay = RETRY_DELAYS_SECONDS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_SECONDS.length - 1)];
  return new Date(Date.now() + delay * 1000);
}

async function deferDeliveriesForPausedEndpoints(endpointIds: unknown[]) {
  if (endpointIds.length === 0) return;
  await WebhookDeliveryModel.updateMany(
    {
      endpointId: { $in: endpointIds },
      status: { $in: ['pending', 'failed'] },
    },
    {
      $set: {
        status: 'paused',
        lockedAt: null,
        lastError: PAUSED_WEBHOOK_DELIVERY_ERROR,
        pausedStateCheckedAt: null,
      },
    }
  ).exec();
}

async function deferStaleProcessingDeliveriesForPausedEndpoints(endpointIds: unknown[], staleBefore: Date, now: Date) {
  if (endpointIds.length === 0) return;
  const filter = {
    endpointId: { $in: endpointIds },
    status: 'processing',
    lockedAt: { $lte: staleBefore },
  };
  // Update the stale lease and its history in the same write. A pipeline also
  // handles legacy records with no attemptHistory without manufacturing an
  // HTTP outcome or modifying already recorded attempts.
  const attemptHistory = {
    $map: {
      input: { $ifNull: ['$attemptHistory', []] },
      as: 'attempt',
      in: {
        $cond: [
          { $eq: ['$$attempt.outcome', 'processing'] },
          { $mergeObjects: ['$$attempt', {
            outcome: 'interrupted',
            finishedAt: now,
            error: 'Worker stopped before recording the delivery outcome.',
          }] },
          '$$attempt',
        ],
      },
    },
  };
  await Promise.all([
    WebhookDeliveryModel.updateMany(
      { ...filter, $expr: { $gte: ['$attempts', '$maxAttempts'] } },
      [{
        $set: {
          status: 'dead_letter',
          lockedAt: null,
          lastError: 'The worker stopped during the final webhook delivery attempt.',
          pausedStateCheckedAt: null,
          attemptHistory,
        },
      }]
    ).exec(),
    WebhookDeliveryModel.updateMany(
      { ...filter, $expr: { $lt: ['$attempts', '$maxAttempts'] } },
      [{
        $set: {
          status: 'paused',
          lockedAt: null,
          lastError: PAUSED_WEBHOOK_DELIVERY_ERROR,
          pausedStateCheckedAt: null,
          attemptHistory,
        },
      }]
    ).exec(),
  ]);
}

/**
 * Reconcile a bounded page of durable paused deliveries. Endpoint and queue
 * updates cannot share a Mongo write, so this repairs a failed or overlapping
 * pause/resume operation. Confirmed paused backlogs are marked once, avoiding
 * repeated rewrites while still letting a later state change be detected.
 */
async function reconcilePausedWebhookDeliveries(now: Date) {
  const pausedDeliveries = await WebhookDeliveryModel.find({ status: 'paused' })
    .select('endpointId')
    .sort({ pausedStateCheckedAt: 1, createdAt: 1 })
    .limit(PAUSED_DELIVERY_RECONCILIATION_BATCH_SIZE)
    .lean<Array<{ endpointId: unknown }>>();
  if (pausedDeliveries.length === 0) return;

  const endpointIdsByKey = new Map<string, unknown>();
  for (const delivery of pausedDeliveries) endpointIdsByKey.set(String(delivery.endpointId), delivery.endpointId);
  const endpointIds = [...endpointIdsByKey.values()];
  const endpoints = await WebhookEndpointModel.find({ _id: { $in: endpointIds } })
    .select('_id active pausedAt revokedAt')
    .lean<WebhookEndpointQueueState[]>();
  const endpointsByKey = new Map(endpoints.map((endpoint) => [String(endpoint._id), endpoint]));
  const activeEndpointIds: unknown[] = [];
  const pausedEndpointIds: unknown[] = [];
  const unavailableEndpointIds: unknown[] = [];

  for (const endpointId of endpointIds) {
    const endpoint = endpointsByKey.get(String(endpointId));
    if (endpoint && endpoint.revokedAt == null && endpoint.active !== false) {
      activeEndpointIds.push(endpointId);
    } else if (endpoint && endpoint.revokedAt == null && endpoint.active === false && endpoint.pausedAt instanceof Date) {
      pausedEndpointIds.push(endpointId);
    } else {
      unavailableEndpointIds.push(endpointId);
    }
  }

  await Promise.all([
    activeEndpointIds.length > 0
      ? WebhookDeliveryModel.updateMany(
        { endpointId: { $in: activeEndpointIds }, status: 'paused' },
        { $set: { status: 'pending', lockedAt: null, nextAttemptAt: now, lastError: null, pausedStateCheckedAt: null } }
      ).exec()
      : undefined,
    unavailableEndpointIds.length > 0
      ? WebhookDeliveryModel.updateMany(
        { endpointId: { $in: unavailableEndpointIds }, status: 'paused' },
        { $set: { status: 'dead_letter', lockedAt: null, lastError: 'Webhook endpoint is missing or revoked.', pausedStateCheckedAt: null } }
      ).exec()
      : undefined,
    pausedEndpointIds.length > 0
      ? WebhookDeliveryModel.updateMany(
        {
          endpointId: { $in: pausedEndpointIds },
          status: 'paused',
          pausedStateCheckedAt: null,
        },
        { $set: { pausedStateCheckedAt: now } }
      ).exec()
      : undefined,
  ]);
}

/**
 * Older paused endpoints can still have pending records from before durable
 * paused status existed. Inspect only the next claimable page (plus stale
 * worker locks), then defer records for the paused endpoint IDs found there
 * before the claim loop.
 */
async function deferClaimableDeliveriesForPausedEndpoints(now: Date) {
  const staleBefore = new Date(now.getTime() - DELIVERY_LOCK_MS);
  const [candidates, staleCandidates] = await Promise.all([
    WebhookDeliveryModel.find({
      status: { $in: ['pending', 'failed'] },
      attempts: { $lt: 8 },
      nextAttemptAt: { $lte: now },
    })
      .select('endpointId')
      .sort({ nextAttemptAt: 1, createdAt: 1 })
      .limit(PAUSED_DELIVERY_RECONCILIATION_BATCH_SIZE)
      .lean<Array<{ endpointId: unknown }>>(),
    WebhookDeliveryModel.find({ status: 'processing', lockedAt: { $lte: staleBefore } })
      .select('endpointId')
      .sort({ lockedAt: 1, createdAt: 1 })
      .limit(PAUSED_DELIVERY_RECONCILIATION_BATCH_SIZE)
      .lean<Array<{ endpointId: unknown }>>(),
  ]);
  if (candidates.length === 0 && staleCandidates.length === 0) return;

  const endpointIdsByKey = new Map<string, unknown>();
  for (const candidate of candidates) endpointIdsByKey.set(String(candidate.endpointId), candidate.endpointId);
  for (const candidate of staleCandidates) endpointIdsByKey.set(String(candidate.endpointId), candidate.endpointId);
  const endpointIds = [...endpointIdsByKey.values()];
  const pausedEndpoints = await WebhookEndpointModel.find({
    _id: { $in: endpointIds },
    active: false,
    pausedAt: { $type: 'date' },
    revokedAt: null,
  })
    .select('_id')
    .lean<Array<{ _id: unknown }>>();
  const pausedEndpointIds = pausedEndpoints.map((endpoint) => endpoint._id);
  await Promise.all([
    candidates.length > 0 ? deferDeliveriesForPausedEndpoints(pausedEndpointIds) : undefined,
    staleCandidates.length > 0 ? deferStaleProcessingDeliveriesForPausedEndpoints(pausedEndpointIds, staleBefore, now) : undefined,
  ]);
}

export async function processWebhookDelivery(deliveryId?: string) {
  await connectDB();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - DELIVERY_LOCK_MS);
  const delivery = await WebhookDeliveryModel.findOneAndUpdate({
    ...(deliveryId ? { _id: deliveryId } : {}),
    $or: [
      { status: { $in: ['pending', 'failed'] }, attempts: { $lt: 8 }, nextAttemptAt: { $lte: now } },
      { status: 'processing', lockedAt: { $lte: staleBefore } },
    ],
  }, {
    $set: { status: 'processing', lockedAt: now, lastAttemptAt: now },
    $inc: { attempts: 1 },
  }, { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } });
  if (!delivery) return null;
  // A reclaimed lease may have sent the request before its worker stopped.
  // Preserve that uncertainty rather than reporting an invented HTTP result.
  delivery.attemptHistory ??= [];
  for (const attempt of delivery.attemptHistory) {
    if (attempt.outcome === 'processing') {
      attempt.outcome = 'interrupted';
      attempt.finishedAt = now;
      attempt.error = 'Worker stopped before recording the delivery outcome.';
    }
  }
  const endpoint = await WebhookEndpointModel.findOne({ _id: delivery.endpointId, orgId: delivery.orgId, ...getUsableWebhookEndpointFilter() })
    .select('+secretEncrypted url signatureVersion eventContractVersion active createdAt')
    .lean<WebhookDeliveryTarget | null>();
  if (!endpoint) {
    delivery.status = 'dead_letter';
    delivery.lastError = 'Webhook endpoint is missing or revoked.';
    delivery.lockedAt = null;
    await delivery.save();
    return delivery;
  }
  // A stale processing lock is claimed with one additional attempt. Do this
  // check before returning a paused endpoint to pending; otherwise a final
  // stale attempt would be decremented back to maxAttempts and become an
  // unclaimable pending delivery forever.
  if (delivery.attempts > delivery.maxAttempts) {
    delivery.status = 'dead_letter';
    delivery.lastError = 'The worker stopped during the final webhook delivery attempt.';
    delivery.lockedAt = null;
    await delivery.save();
    return delivery;
  }
  if (endpoint.active === false) {
    // This can only occur when a pause races a claim. Defer the rest of this
    // endpoint's backlog as well; a transient bulk-write error must not leave
    // the already claimed delivery stuck in processing.
    await deferDeliveriesForPausedEndpoints([delivery.endpointId]).catch(() => undefined);
    delivery.status = 'paused';
    delivery.attempts = Math.max(0, delivery.attempts - 1);
    delivery.lastError = PAUSED_WEBHOOK_DELIVERY_ERROR;
    delivery.lockedAt = null;
    delivery.pausedStateCheckedAt = null;
    await delivery.save();
    return delivery;
  }

  delivery.attemptHistory.push({
    sequence: delivery.attemptHistory.length + 1,
    startedAt: now,
    finishedAt: null,
    outcome: 'processing',
    statusCode: null,
    error: null,
  });
  // Persist the attempt before network I/O so crashes remain visible.
  await delivery.save();
  const result = await deliverWebhookEvent(endpoint, delivery.payload as WebhookPayload);
  const attempt = delivery.attemptHistory[delivery.attemptHistory.length - 1];
  attempt.finishedAt = new Date();
  attempt.outcome = result.delivered ? 'delivered' : 'failed';
  attempt.statusCode = result.statusCode;
  attempt.error = result.error?.slice(0, 1000) ?? null;
  delivery.lastStatusCode = result.statusCode;
  delivery.lastError = result.error?.slice(0, 1000) ?? null;
  delivery.lockedAt = null;
  if (result.delivered) {
    delivery.status = 'delivered';
    delivery.deliveredAt = new Date();
  } else if (delivery.attempts >= delivery.maxAttempts) {
    delivery.status = 'dead_letter';
  } else {
    delivery.status = 'failed';
    delivery.nextAttemptAt = retryAt(delivery.attempts);
  }
  await delivery.save();
  return delivery;
}

export async function processPendingWebhookDeliveries(limit = 10, timeBudgetMs = 50_000) {
  const startedAt = Date.now();
  await connectDB();
  if (Date.now() - startedAt >= timeBudgetMs) return [];
  const reconciliationNow = new Date();
  await reconcilePausedWebhookDeliveries(reconciliationNow);
  if (Date.now() - startedAt >= timeBudgetMs) return [];
  await deferClaimableDeliveriesForPausedEndpoints(reconciliationNow);
  if (Date.now() - startedAt >= timeBudgetMs) return [];
  const processed = [];
  for (let index = 0; index < Math.min(Math.max(limit, 1), 100); index += 1) {
    if (Date.now() - startedAt >= timeBudgetMs) break;
    const delivery = await processWebhookDelivery();
    if (!delivery) break;
    processed.push(delivery);
  }
  return processed;
}

export async function replayWebhookDelivery(args: { orgId: string; deliveryId: string }) {
  await connectDB();
  return WebhookDeliveryModel.findOneAndUpdate(
    { _id: args.deliveryId, orgId: args.orgId, status: { $in: ['failed', 'dead_letter'] } },
    { $set: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lockedAt: null, lastError: null } },
    { new: true }
  );
}

// Preserve the historical call site while making dispatch durable.
export async function dispatchWebhookEvent(args: { orgId?: unknown; event: string; data: unknown }) {
  return enqueueWebhookEvent(args);
}
