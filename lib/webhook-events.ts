export const WEBHOOK_EVENT_CONTRACT_VERSION = '2026-09-08';

export const WEBHOOK_EVENT_CATALOG = {
  document_created: {
    description: 'A document was created in the workspace.',
    data: ['auditLogId', 'documentId', 'metadata.source'],
  },
  document_prepared: {
    description: 'A document field layout was prepared.',
    data: ['auditLogId', 'documentId', 'metadata.version', 'metadata.fieldCount'],
  },
  document_sent_for_signing: {
    description: 'A signing request was sent to recipients.',
    data: ['auditLogId', 'documentId', 'metadata.recipientCount'],
  },
  recipient_signed: {
    description: 'A recipient completed their signing action.',
    data: ['auditLogId', 'documentId', 'metadata'],
  },
  document_finalized: {
    description: 'All required signing and approval actions completed.',
    data: ['auditLogId', 'documentId', 'metadata.version', 'metadata.finalHash'],
  },
  document_voided: {
    description: 'A document was voided before completion.',
    data: ['auditLogId', 'documentId', 'metadata'],
  },
  'cloud.export.completed': {
    description: 'An automatic cloud archive export completed.',
    data: ['auditLogId', 'documentId', 'metadata.provider', 'metadata.providerFileId'],
  },
  'webhook.test': {
    description: 'A workspace administrator requested a test delivery.',
    data: ['message', 'requestedAt'],
  },
} as const;

export type PublishedWebhookEvent = keyof typeof WEBHOOK_EVENT_CATALOG;

const EVENT_ALIASES: Record<string, PublishedWebhookEvent> = {
  document_created: 'document_created',
  document_prepared: 'document_prepared',
  document_sent_for_signing: 'document_sent_for_signing',
  'document.send_for_signing.success': 'document_sent_for_signing',
  recipient_signed: 'recipient_signed',
  document_finalized: 'document_finalized',
  document_voided: 'document_voided',
  'cloud.export.completed': 'cloud.export.completed',
  'webhook.test': 'webhook.test',
};

export function getPublishedWebhookEvent(event: string): PublishedWebhookEvent | null {
  return EVENT_ALIASES[event] || null;
}

export function normalizeWebhookEventSubscriptions(events: string[]): string[] | null {
  const normalized = [...new Set(events.map((event) => event.trim()).filter(Boolean))];
  if (normalized.length === 0 || normalized.length > 50) return null;
  if (normalized.includes('*')) return normalized.length === 1 ? ['*'] : null;
  return normalized.every((event) => getPublishedWebhookEvent(event) === event)
    ? normalized
    : null;
}

export function isWebhookEventSubscriptionMatch(events: string[], event: string): boolean {
  return events.includes('*') || events.includes(event);
}
