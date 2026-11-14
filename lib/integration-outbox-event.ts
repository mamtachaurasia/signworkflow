import { randomBytes } from 'node:crypto';

export type IntegrationEvent = {
  eventId: string;
  event: string;
  createdAt: Date;
  // Kept on every lifecycle payload for backwards compatibility with the
  // public webhook contract. Domain events are written before their audit row
  // is available, so it can legitimately be null until an audit is persisted.
  data: { auditLogId: string | null; documentId: string | null; metadata: Record<string, unknown> };
};

export type IntegrationEventInput = {
  event: string;
  documentId: unknown;
  orgId: unknown;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
};

export type StagedIntegrationEvent = {
  key: string;
  eventId: string;
};

/** Merge these narrow paths into the SAME atomic write as the domain change.
 * Never replace the whole map: another request may have staged another event. */
export function documentIntegrationUpdate(input: IntegrationEventInput): Record<string, unknown> {
  if (!input.orgId) return {};
  const id = randomBytes(16).toString('hex');
  const createdAt = input.createdAt ?? new Date();
  const entry: IntegrationEvent = {
    eventId: `evt_${id}`,
    event: input.event,
    createdAt,
    data: {
      auditLogId: null,
      documentId: input.documentId ? String(input.documentId) : null,
      metadata: input.metadata ?? {},
    },
  };
  return { [`integrationOutbox.${id}`]: entry, integrationNextAttemptAt: createdAt };
}

export function stageDocumentIntegrationEvent(
  document: { _id: unknown; orgId?: unknown; set: (path: string, value: unknown) => unknown },
  input: Omit<IntegrationEventInput, 'documentId' | 'orgId'> & { documentId?: unknown }
): StagedIntegrationEvent | null {
  let staged: StagedIntegrationEvent | null = null;
  for (const [path, value] of Object.entries(documentIntegrationUpdate({
    ...input, documentId: input.documentId ?? document._id, orgId: document.orgId,
  }))) {
    document.set(path, value);
    const matched = /^integrationOutbox\.([^.]+)$/.exec(path);
    if (matched && value && typeof value === 'object' && 'eventId' in value) {
      staged = { key: matched[1], eventId: String((value as IntegrationEvent).eventId) };
    }
  }
  return staged;
}

/** Narrow, conditional update for linking a later audit record to the durable
 * event that caused it. The event ID predicate prevents a stale worker from
 * updating a replacement event at the same map key. */
export function integrationAuditLogUpdate(staged: StagedIntegrationEvent, auditLogId: string) {
  return {
    filter: { [`integrationOutbox.${staged.key}.eventId`]: staged.eventId },
    update: { $set: { [`integrationOutbox.${staged.key}.data.auditLogId`]: auditLogId } },
  };
}

export const DOCUMENT_OUTBOX_EVENTS = new Set([
  'document_created', 'document_prepared', 'document_sent_for_signing',
  'document.send_for_signing.success', 'recipient_signed', 'document_finalized', 'document_voided',
]);
