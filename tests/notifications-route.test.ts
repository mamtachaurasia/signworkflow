import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  archiveNotifications: vi.fn(),
  listUserNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  syncRecentDocumentEventNotificationsForUser: vi.fn(),
}));

import { GET, PATCH } from '@/app/api/notifications/route';
import { getAuthContext } from '@/lib/auth-context';
import {
  listUserNotifications,
  markNotificationsRead,
  syncRecentDocumentEventNotificationsForUser,
} from '@/lib/notifications';

const userId = '507f1f77bcf86cd799439011';
const notificationId = '507f1f77bcf86cd799439012';

const getAuthContextMock = vi.mocked(getAuthContext);
const listUserNotificationsMock = vi.mocked(listUserNotifications);
const markNotificationsReadMock = vi.mocked(markNotificationsRead);
const syncRecentDocumentEventNotificationsForUserMock = vi.mocked(syncRecentDocumentEventNotificationsForUser);

function mockAuthenticatedUser() {
  getAuthContextMock.mockResolvedValue({
    userId,
    orgId: '507f1f77bcf86cd799439013',
    orgRole: 'owner',
  });
}

describe('notifications route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
  });

  it('lists notifications for the authenticated user', async () => {
    listUserNotificationsMock.mockResolvedValue({
      notifications: [
        {
          id: notificationId,
          type: 'document.viewed',
          title: 'Contract was viewed',
          body: 'Recipient opened the signing request.',
          href: '/builder/507f1f77bcf86cd799439013',
          actorName: 'Recipient',
          actorEmail: 'recipient@example.com',
          metadata: {},
          readAt: null,
          archivedAt: null,
          createdAt: '2026-04-30T10:00:00.000Z',
          updatedAt: '2026-04-30T10:00:00.000Z',
        },
      ],
      unreadCount: 1,
      nextCursor: null,
    });

    const req = new NextRequest('https://example.com/api/notifications?limit=5&unreadOnly=true');
    const res = await GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.unreadCount).toBe(1);
    expect(payload.notifications).toHaveLength(1);
    expect(syncRecentDocumentEventNotificationsForUserMock).toHaveBeenCalledWith({ userId });
    expect(listUserNotificationsMock).toHaveBeenCalledWith({
      userId,
      limit: 5,
      cursor: null,
      unreadOnly: true,
    });
  });

  it('marks specific notifications as read', async () => {
    markNotificationsReadMock.mockResolvedValue(0);

    const req = new NextRequest('https://example.com/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark_read',
        ids: [notificationId],
      }),
    });

    const res = await PATCH(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({ success: true, unreadCount: 0 });
    expect(markNotificationsReadMock).toHaveBeenCalledWith({
      userId,
      ids: [notificationId],
    });
  });
});
