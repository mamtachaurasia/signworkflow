import mongoose, { type FilterQuery } from 'mongoose';

import NotificationModel, {
  type INotification,
  type NotificationType,
} from '@/models/Notification';
import { getEffectiveUserSettingsByUserId } from '@/lib/org-settings-server';
import UserModel from '@/models/Users';
import DocumentModel from '@/models/Document';
import { publishNotificationEvent } from '@/lib/notification-events';

export type ClientNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  actorName: string;
  actorEmail: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListNotificationsResult = {
  notifications: ClientNotification[];
  unreadCount: number;
  nextCursor: string | null;
};

type NotificationLean = {
  _id: unknown;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  actorName?: string;
  actorEmail?: string;
  metadata?: Record<string, unknown>;
  readAt?: Date | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreateNotificationInput = {
  userId: unknown;
  orgId?: unknown | null;
  documentId?: unknown | null;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  actorName?: string;
  actorEmail?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
};

type DocumentEventType =
  | 'document.viewed'
  | 'document.signed'
  | 'document.completed'
  | 'document.declined'
  | 'document.voided';

type DocumentEventNotificationInput = {
  type: DocumentEventType;
  ownerUserId: unknown;
  orgId?: unknown | null;
  documentId: unknown;
  documentName: string;
  recipient?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  actionAt?: Date;
  metadata?: Record<string, unknown>;
};

type RecipientSentNotificationInput = {
  senderUserId: unknown;
  orgId?: unknown | null;
  documentId: unknown;
  documentName: string;
  recipients: Array<{
    id?: string | null;
    email?: string | null;
    name?: string | null;
    role?: string | null;
    signingUrl?: string | null;
  }>;
};

type NotificationRecipientSnapshot = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  viewedAt?: Date | string | null;
  signedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  rejectedAt?: Date | string | null;
};

type NotificationDocumentSnapshot = {
  _id: unknown;
  userId?: unknown;
  orgId?: unknown | null;
  documentName?: string;
  status?: string | null;
  updatedAt?: Date | string | null;
  completedAt?: Date | string | null;
  recipients?: NotificationRecipientSnapshot[];
};

const DOCUMENT_EVENT_SETTING_KEY: Partial<
  Record<DocumentEventType, 'notifyOnViewed' | 'notifyOnSigned' | 'notifyOnCompleted' | 'notifyOnDeclined'>
> = {
  'document.viewed': 'notifyOnViewed',
  'document.signed': 'notifyOnSigned',
  'document.completed': 'notifyOnCompleted',
  'document.declined': 'notifyOnDeclined',
};

function toObjectId(value: unknown): mongoose.Types.ObjectId | null {
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }

  if (value && typeof (value as { toString?: () => string }).toString === 'function') {
    const stringValue = (value as { toString: () => string }).toString();
    if (mongoose.Types.ObjectId.isValid(stringValue)) {
      return new mongoose.Types.ObjectId(stringValue);
    }
  }

  return null;
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function toIsoDate(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toClientNotification(notification: NotificationLean): ClientNotification {
  return {
    id: String(notification._id),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    href: notification.href || '/dashboard',
    actorName: notification.actorName || '',
    actorEmail: notification.actorEmail || '',
    metadata: notification.metadata || {},
    readAt: toIsoDate(notification.readAt),
    archivedAt: toIsoDate(notification.archivedAt),
    createdAt: new Date(notification.createdAt).toISOString(),
    updatedAt: new Date(notification.updatedAt).toISOString(),
  };
}

function normalizeIds(ids: string[]): mongoose.Types.ObjectId[] {
  return ids
    .map((id) => toObjectId(id))
    .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(Math.max(Math.floor(limit || 20), 1), 50);
}

function buildDocumentHref(documentId: unknown): string {
  const normalized = toObjectId(documentId);
  return normalized ? `/builder/${normalized.toString()}` : '/dashboard';
}

function recipientLabel(recipient: DocumentEventNotificationInput['recipient']): string {
  return sanitizeText(recipient?.name, sanitizeText(recipient?.email, 'A recipient', 120), 120);
}

function buildDocumentEventDedupeKey(input: DocumentEventNotificationInput, fallbackKey?: string): string {
  const documentId = String(input.documentId);
  const recipientKey =
    sanitizeText(input.recipient?.id, '', 120) ||
    sanitizeText(input.recipient?.email, '', 320) ||
    fallbackKey ||
    'event';
  const eventKey = input.actionAt?.toISOString();

  return [input.type, documentId, recipientKey, eventKey].filter(Boolean).join(':');
}

function buildDocumentEventContent(input: DocumentEventNotificationInput): {
  title: string;
  body: string;
  dedupeKey: string;
} {
  const documentName = sanitizeText(input.documentName, 'Untitled document', 140);
  const recipientName = recipientLabel(input.recipient);
  const dedupeKey = buildDocumentEventDedupeKey(input);

  if (input.type === 'document.viewed') {
    return {
      title: `${documentName} was viewed`,
      body: `${recipientName} opened the signing request.`,
      dedupeKey,
    };
  }

  if (input.type === 'document.signed') {
    const verb = input.recipient?.role === 'approver' ? 'approved' : 'signed';
    return {
      title: `${documentName} was ${verb}`,
      body: `${recipientName} ${verb} the document.`,
      dedupeKey,
    };
  }

  if (input.type === 'document.completed') {
    return {
      title: `${documentName} is complete`,
      body: 'All required recipients have completed the signing flow.',
      dedupeKey: buildDocumentEventDedupeKey(input, 'completed'),
    };
  }

  if (input.type === 'document.declined') {
    return {
      title: `${documentName} was declined`,
      body: `${recipientName} declined the signing request.`,
      dedupeKey,
    };
  }

  return {
    title: `${documentName} was voided`,
    body: 'The signing request is no longer active.',
    dedupeKey: buildDocumentEventDedupeKey(input, 'voided'),
  };
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
  );
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<ClientNotification | null> {
  const userId = toObjectId(input.userId);
  if (!userId) {
    return null;
  }

  const orgId = input.orgId ? toObjectId(input.orgId) : null;
  const documentId = input.documentId ? toObjectId(input.documentId) : null;
  const now = new Date();
  const payload = {
    userId,
    orgId,
    documentId,
    type: input.type,
    title: sanitizeText(input.title, 'Notification', 200),
    body: sanitizeText(input.body, '', 600),
    href: sanitizeText(input.href, documentId ? `/builder/${documentId.toString()}` : '/dashboard', 500),
    actorName: sanitizeText(input.actorName, '', 200),
    actorEmail: sanitizeText(input.actorEmail, '', 320).toLowerCase(),
    metadata: input.metadata || {},
    dedupeKey: input.dedupeKey ? sanitizeText(input.dedupeKey, '', 300) : undefined,
    readAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const publishCreated = () => publishNotificationEvent(userId.toString(), { reason: 'created' });

  if (payload.dedupeKey) {
    const existingNotification = await NotificationModel.findOne({
      userId,
      dedupeKey: payload.dedupeKey,
    }).lean<NotificationLean | null>();

    if (existingNotification) {
      return toClientNotification(existingNotification);
    }

    try {
      const notification = await NotificationModel.create(payload);
      publishCreated();
      return toClientNotification(notification.toObject() as NotificationLean);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const notification = await NotificationModel.findOne({
        userId,
        dedupeKey: payload.dedupeKey,
      }).lean<NotificationLean | null>();
      return notification ? toClientNotification(notification) : null;
    }
  }

  const notification = await NotificationModel.create(payload);
  publishCreated();
  return toClientNotification(notification.toObject() as NotificationLean);
}

export async function createDocumentEventNotification(
  input: DocumentEventNotificationInput
): Promise<ClientNotification | null> {
  const ownerUserId = toObjectId(input.ownerUserId);
  if (!ownerUserId) {
    return null;
  }

  const orgId = input.orgId ? toObjectId(input.orgId) : null;
  const documentId = toObjectId(input.documentId);
  if (!documentId) {
    return null;
  }

  const settingKey = DOCUMENT_EVENT_SETTING_KEY[input.type];
  if (settingKey) {
    const settings = await getEffectiveUserSettingsByUserId(
      ownerUserId.toString(),
      orgId ? orgId.toString() : null
    );
    if (settings[settingKey] === false) {
      return null;
    }
  }

  const content = buildDocumentEventContent(input);

  return createNotification({
    userId: ownerUserId,
    orgId,
    documentId,
    type: input.type,
    title: content.title,
    body: content.body,
    href: buildDocumentHref(documentId),
    actorName: input.recipient?.name || '',
    actorEmail: input.recipient?.email || '',
    metadata: {
      documentName: sanitizeText(input.documentName, 'Untitled document', 140),
      recipientId: input.recipient?.id || null,
      recipientName: input.recipient?.name || null,
      recipientEmail: input.recipient?.email || null,
      recipientRole: input.recipient?.role || null,
      actionAt: input.actionAt?.toISOString() || null,
      ...input.metadata,
    },
    dedupeKey: content.dedupeKey,
  });
}

export async function createRecipientDocumentSentNotifications(
  input: RecipientSentNotificationInput
): Promise<ClientNotification[]> {
  const senderUserId = toObjectId(input.senderUserId);
  const documentId = toObjectId(input.documentId);
  if (!documentId) {
    return [];
  }

  const orgId = input.orgId ? toObjectId(input.orgId) : null;
  const recipientByEmail = new Map(
    input.recipients
      .map((recipient) => [normalizeEmail(recipient.email), recipient] as const)
      .filter(([email]) => Boolean(email))
  );

  if (recipientByEmail.size === 0) {
    return [];
  }

  const users = await UserModel.find({
    email: { $in: [...recipientByEmail.keys()] },
    isActive: { $ne: false },
    isDeleted: { $ne: true },
  })
    .select('_id email')
    .lean<Array<{ _id: unknown; email?: string }>>();

  const notifications: ClientNotification[] = [];
  const documentName = sanitizeText(input.documentName, 'Untitled document', 140);

  for (const user of users) {
    const userId = toObjectId(user._id);
    if (!userId || (senderUserId && userId.equals(senderUserId))) {
      continue;
    }

    const recipient = recipientByEmail.get(normalizeEmail(user.email));
    if (!recipient) {
      continue;
    }

    const role = recipient.role === 'approver'
      ? 'approve'
      : recipient.role === 'viewer'
        ? 'view'
        : 'sign';
    const notification = await createNotification({
      userId,
      orgId,
      documentId,
      type: 'document.sent',
      title: `Signature request: ${documentName}`,
      body: `You have been invited to ${role} this document.`,
      href: recipient.signingUrl || buildDocumentHref(documentId),
      actorName: recipient.name || '',
      actorEmail: recipient.email || '',
      metadata: {
        documentName,
        recipientId: recipient.id || null,
        recipientName: recipient.name || null,
        recipientEmail: recipient.email || null,
        recipientRole: recipient.role || null,
      },
      dedupeKey: `document.sent:${documentId.toString()}:${recipient.id || normalizeEmail(recipient.email)}`,
    });

    if (notification) {
      notifications.push(notification);
    }
  }

  return notifications;
}

export async function syncRecentDocumentEventNotificationsForUser(input: {
  userId: unknown;
  lookbackDays?: number;
  limit?: number;
}): Promise<void> {
  const userId = toObjectId(input.userId);
  if (!userId) {
    return;
  }

  const lookbackDays = Math.min(Math.max(input.lookbackDays ?? 30, 1), 90);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 250);

  const documents = await DocumentModel.find({
    userId: userId.toString(),
    updatedAt: { $gte: since },
    $or: [
      { status: 'rejected' },
      { status: 'completed' },
      { 'recipients.viewedAt': { $ne: null } },
      { 'recipients.signedAt': { $ne: null } },
      { 'recipients.approvedAt': { $ne: null } },
      { 'recipients.rejectedAt': { $ne: null } },
      { 'recipients.status': { $in: ['viewed', 'signed', 'approved', 'rejected'] } },
    ],
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('_id userId orgId documentName status updatedAt completedAt recipients')
    .lean<NotificationDocumentSnapshot[]>();

  for (const document of documents) {
    const documentName = document.documentName || 'Untitled document';
    const recipients = Array.isArray(document.recipients) ? document.recipients : [];
    const fallbackAt = toDate(document.updatedAt) || new Date();

    for (const recipient of recipients) {
      if (recipient.rejectedAt || recipient.status === 'rejected') {
        await createDocumentEventNotification({
          type: 'document.declined',
          ownerUserId: userId,
          orgId: document.orgId,
          documentId: document._id,
          documentName,
          recipient,
          actionAt: toDate(recipient.rejectedAt) || fallbackAt,
        });
        continue;
      }

      if (recipient.signedAt || recipient.approvedAt || recipient.status === 'signed' || recipient.status === 'approved') {
        await createDocumentEventNotification({
          type: 'document.signed',
          ownerUserId: userId,
          orgId: document.orgId,
          documentId: document._id,
          documentName,
          recipient,
          actionAt: toDate(recipient.signedAt) || toDate(recipient.approvedAt) || fallbackAt,
        });
      }

      if (recipient.viewedAt || recipient.status === 'viewed') {
        await createDocumentEventNotification({
          type: 'document.viewed',
          ownerUserId: userId,
          orgId: document.orgId,
          documentId: document._id,
          documentName,
          recipient,
          actionAt: toDate(recipient.viewedAt) || fallbackAt,
        });
      }
    }

    if (document.status === 'completed') {
      await createDocumentEventNotification({
        type: 'document.completed',
        ownerUserId: userId,
        orgId: document.orgId,
        documentId: document._id,
        documentName,
        recipient: recipients.find((recipient) => recipient.signedAt || recipient.approvedAt) || recipients[0] || null,
        actionAt: toDate(document.completedAt) || fallbackAt,
      });
    }
  }
}

export async function listUserNotifications(input: {
  userId: unknown;
  limit?: number;
  cursor?: string | null;
  unreadOnly?: boolean;
}): Promise<ListNotificationsResult> {
  const userId = toObjectId(input.userId);
  if (!userId) {
    return { notifications: [], unreadCount: 0, nextCursor: null };
  }

  const limit = clampLimit(input.limit);
  const filter: FilterQuery<INotification> = {
    userId,
    archivedAt: null,
  };

  if (input.unreadOnly) {
    filter.readAt = null;
  }

  if (input.cursor) {
    const cursorDate = new Date(input.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      filter.createdAt = { $lt: cursorDate };
    }
  }

  const [records, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<NotificationLean[]>(),
    NotificationModel.countDocuments({
      userId,
      archivedAt: null,
      readAt: null,
    }),
  ]);

  const pageRecords = records.slice(0, limit);
  const lastRecord = pageRecords[pageRecords.length - 1];

  return {
    notifications: pageRecords.map(toClientNotification),
    unreadCount,
    nextCursor: records.length > limit && lastRecord ? new Date(lastRecord.createdAt).toISOString() : null,
  };
}

export async function getUnreadNotificationCount(userId: unknown): Promise<number> {
  const normalizedUserId = toObjectId(userId);
  if (!normalizedUserId) return 0;

  return NotificationModel.countDocuments({
    userId: normalizedUserId,
    archivedAt: null,
    readAt: null,
  });
}

export async function markNotificationsRead(input: {
  userId: unknown;
  ids?: string[];
  all?: boolean;
}): Promise<number> {
  const userId = toObjectId(input.userId);
  if (!userId) return 0;

  const filter: FilterQuery<INotification> = {
    userId,
    archivedAt: null,
    readAt: null,
  };

  if (!input.all) {
    const ids = normalizeIds(input.ids || []);
    if (ids.length === 0) {
      return getUnreadNotificationCount(userId);
    }
    filter._id = { $in: ids };
  }

  const result = await NotificationModel.updateMany(filter, {
    $set: {
      readAt: new Date(),
    },
  }).exec();

  if (result.modifiedCount > 0) {
    publishNotificationEvent(userId.toString(), { reason: 'changed' });
  }

  return getUnreadNotificationCount(userId);
}

export async function archiveNotifications(input: {
  userId: unknown;
  ids: string[];
}): Promise<number> {
  const userId = toObjectId(input.userId);
  if (!userId) return 0;

  const ids = normalizeIds(input.ids || []);
  if (ids.length === 0) {
    return getUnreadNotificationCount(userId);
  }

  const now = new Date();
  const result = await NotificationModel.updateMany(
    {
      userId,
      _id: { $in: ids },
      archivedAt: null,
    },
    {
      $set: {
        archivedAt: now,
        readAt: now,
      },
    }
  ).exec();

  if (result.modifiedCount > 0) {
    publishNotificationEvent(userId.toString(), { reason: 'changed' });
  }

  return getUnreadNotificationCount(userId);
}
