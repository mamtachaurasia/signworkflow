import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  isSecureRequest: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/utils/db', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  listUserNotifications: vi.fn(),
  syncRecentDocumentEventNotificationsForUser: vi.fn(),
}));

vi.mock('@/lib/notification-events', () => ({
  subscribeToNotificationEvents: vi.fn(),
}));

import { GET } from '@/app/api/notifications/stream/route';
import { getAuthContext } from '@/lib/auth-context';
import {
  listUserNotifications,
  syncRecentDocumentEventNotificationsForUser,
} from '@/lib/notifications';
import { subscribeToNotificationEvents } from '@/lib/notification-events';
import { withSecurityHeaders } from '@/lib/auth';

const userId = '507f1f77bcf86cd799439011';
const getAuthContextMock = vi.mocked(getAuthContext);
const listUserNotificationsMock = vi.mocked(listUserNotifications);
const syncRecentDocumentEventNotificationsForUserMock = vi.mocked(
  syncRecentDocumentEventNotificationsForUser
);
const subscribeToNotificationEventsMock = vi.mocked(subscribeToNotificationEvents);
const withSecurityHeadersMock = vi.mocked(withSecurityHeaders);

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, pattern: string) {
  const decoder = new TextDecoder();
  let output = '';

  for (let i = 0; i < 10 && !output.includes(pattern); i += 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    output += decoder.decode(chunk.value, { stream: true });
  }

  return output;
}

describe('notifications stream route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthContextMock.mockResolvedValue({
      userId,
      orgId: '507f1f77bcf86cd799439013',
      orgRole: 'owner',
    });
    syncRecentDocumentEventNotificationsForUserMock.mockResolvedValue(undefined);
    listUserNotificationsMock.mockResolvedValue({
      notifications: [],
      unreadCount: 0,
      nextCursor: null,
    });
    subscribeToNotificationEventsMock.mockReturnValue(vi.fn());
  });

  it('opens an authenticated server-sent notification stream', async () => {
    const req = new NextRequest('https://example.com/api/notifications/stream');

    const res = await GET(req);
    const reader = res.body?.getReader();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(withSecurityHeadersMock).toHaveBeenCalledWith(req, res);
    expect(subscribeToNotificationEventsMock).toHaveBeenCalledWith(userId, expect.any(Function));
    expect(reader).toBeDefined();

    const output = await readUntil(reader!, 'event: notifications');
    await reader!.cancel();

    expect(output).toContain('event: ready');
    expect(output).toContain('event: notifications');
    expect(output).toContain('"realtimeReason":"snapshot"');
    expect(syncRecentDocumentEventNotificationsForUserMock).toHaveBeenCalledWith({ userId });
    expect(listUserNotificationsMock).toHaveBeenCalledWith({ userId, limit: 10 });
  });

  it('pushes a fresh snapshot when a notification event is published', async () => {
    let listener: ((payload: { reason: 'created' | 'changed' }) => void) | null = null;
    subscribeToNotificationEventsMock.mockImplementation((_userId, callback) => {
      listener = callback;
      return vi.fn();
    });

    const req = new NextRequest('https://example.com/api/notifications/stream');
    const res = await GET(req);
    const reader = res.body!.getReader();

    await readUntil(reader, 'event: notifications');
    listener?.({ reason: 'created' });
    const output = await readUntil(reader, '"realtimeReason":"created"');
    await reader.cancel();

    expect(output).toContain('"realtimeReason":"created"');
  });
});
