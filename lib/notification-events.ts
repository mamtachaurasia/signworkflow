import { EventEmitter } from 'events';

declare global {
  var __contractEsignNotificationEmitter: EventEmitter | undefined;
}

export type NotificationEventReason = 'created' | 'changed';

export type NotificationEventPayload = {
  reason: NotificationEventReason;
};

const notificationEmitter =
  globalThis.__contractEsignNotificationEmitter ?? new EventEmitter();

notificationEmitter.setMaxListeners(0);
globalThis.__contractEsignNotificationEmitter = notificationEmitter;

function normalizeUserId(userId: unknown): string {
  return typeof userId === 'string' ? userId : String(userId || '');
}

function eventName(userId: unknown): string {
  return `notifications:${normalizeUserId(userId)}`;
}

export function publishNotificationEvent(
  userId: unknown,
  payload: NotificationEventPayload = { reason: 'changed' }
) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return;

  notificationEmitter.emit(eventName(normalizedUserId), payload);
}

export function subscribeToNotificationEvents(
  userId: unknown,
  listener: (payload: NotificationEventPayload) => void
): () => void {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return () => {};
  }

  const name = eventName(normalizedUserId);
  notificationEmitter.on(name, listener);
  return () => {
    notificationEmitter.off(name, listener);
  };
}
