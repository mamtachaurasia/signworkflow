import { beforeEach, describe, expect, it, vi } from 'vitest';

const notificationModelMocks = vi.hoisted(() => ({
  create: vi.fn(),
  findOne: vi.fn(),
  lean: vi.fn(),
}));

vi.mock('@/models/Notification', () => ({
  default: {
    create: notificationModelMocks.create,
    findOne: notificationModelMocks.findOne,
  },
}));

vi.mock('@/models/Users', () => ({
  default: {},
}));

vi.mock('@/models/Document', () => ({
  default: {},
}));

vi.mock('@/lib/org-settings-server', () => ({
  getEffectiveUserSettingsByUserId: vi.fn(),
}));

vi.mock('@/lib/notification-events', () => ({
  publishNotificationEvent: vi.fn(),
}));

import { createDocumentEventNotification, createNotification } from '@/lib/notifications';
import { getEffectiveUserSettingsByUserId } from '@/lib/org-settings-server';
import { publishNotificationEvent } from '@/lib/notification-events';

const getEffectiveUserSettingsByUserIdMock = vi.mocked(getEffectiveUserSettingsByUserId);
const publishNotificationEventMock = vi.mocked(publishNotificationEvent);

function mockCreateNotificationDocument(overrides: Record<string, unknown> = {}) {
  return {
    toObject: () => ({
      _id: '507f1f77bcf86cd799439012',
      type: 'document.declined',
      title: 'Document was declined',
      body: 'A recipient declined this document.',
      href: '/builder/507f1f77bcf86cd799439013',
      actorName: '',
      actorEmail: '',
      metadata: {},
      readAt: null,
      archivedAt: null,
      createdAt: new Date('2026-04-30T10:00:00.000Z'),
      updatedAt: new Date('2026-04-30T10:00:00.000Z'),
      ...overrides,
    }),
  };
}

describe('notification helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEffectiveUserSettingsByUserIdMock.mockResolvedValue({});
    notificationModelMocks.findOne.mockReturnValue({
      lean: notificationModelMocks.lean,
    });
    notificationModelMocks.lean.mockResolvedValue(null);
    notificationModelMocks.create.mockResolvedValue(mockCreateNotificationDocument());
  });

  it('creates deduped notifications without timestamp-conflicting upserts', async () => {
    const userId = '507f1f77bcf86cd799439011';

    await createNotification({
      userId,
      type: 'document.declined',
      title: 'Document was declined',
      body: 'A recipient declined this document.',
      dedupeKey: 'document.declined:507f1f77bcf86cd799439013',
    });

    expect(notificationModelMocks.findOne).toHaveBeenCalledTimes(1);
    const [filter] = notificationModelMocks.findOne.mock.calls[0];
    expect(String(filter.userId)).toBe(userId);
    expect(filter.dedupeKey).toBe('document.declined:507f1f77bcf86cd799439013');
    expect(notificationModelMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'document.declined:507f1f77bcf86cd799439013',
        type: 'document.declined',
      })
    );
    expect(publishNotificationEventMock).toHaveBeenCalledWith(userId, { reason: 'created' });
  });

  it('returns existing deduped notifications without emitting a live event', async () => {
    notificationModelMocks.lean.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      type: 'document.declined',
      title: 'Document was declined',
      body: 'A recipient declined this document.',
      href: '/builder/507f1f77bcf86cd799439013',
      actorName: '',
      actorEmail: '',
      metadata: {},
      readAt: null,
      archivedAt: null,
      createdAt: new Date('2026-04-30T10:00:00.000Z'),
      updatedAt: new Date('2026-04-30T10:00:00.000Z'),
    });

    await createNotification({
      userId: '507f1f77bcf86cd799439011',
      type: 'document.declined',
      title: 'Document was declined',
      body: 'A recipient declined this document.',
      dedupeKey: 'document.declined:507f1f77bcf86cd799439013',
    });

    expect(notificationModelMocks.create).not.toHaveBeenCalled();
    expect(publishNotificationEventMock).not.toHaveBeenCalled();
  });

  it('includes the action timestamp in document event dedupe keys', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const documentId = '507f1f77bcf86cd799439013';
    const actionAt = new Date('2026-04-30T10:15:00.000Z');

    await createDocumentEventNotification({
      type: 'document.declined',
      ownerUserId: userId,
      documentId,
      documentName: 'Contract.pdf',
      recipient: {
        id: 'recipient-1',
        email: 'recipient@example.com',
        name: 'Recipient',
        role: 'signer',
      },
      actionAt,
    });

    const [filter] = notificationModelMocks.findOne.mock.calls[0];
    expect(filter.dedupeKey).toBe(
      'document.declined:507f1f77bcf86cd799439013:recipient-1:2026-04-30T10:15:00.000Z'
    );
    expect(notificationModelMocks.create.mock.calls[0][0].dedupeKey).toBe(filter.dedupeKey);
  });
});
