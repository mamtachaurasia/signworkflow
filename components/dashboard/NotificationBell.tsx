'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Inbox, RefreshCw, X } from 'lucide-react';

import { Button } from '@ui';
import { DASHBOARD_DOCUMENTS_REFRESH_EVENT } from '@/lib/dashboard-events';

type DashboardNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  actorName: string;
  actorEmail: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  notifications?: DashboardNotification[];
  unreadCount?: number;
  nextCursor?: string | null;
  realtimeReason?: 'snapshot' | 'created' | 'changed';
};

type NotificationMutationResponse = {
  success?: boolean;
  unreadCount?: number;
};

const DOCUMENT_NOTIFICATION_PREFIX = 'document.';

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'Now';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function unreadLabel(unreadCount: number): string {
  if (unreadCount <= 0) return 'Notifications';
  return `Notifications, ${unreadCount} unread`;
}

function notifyDocumentRefresh(notifications: DashboardNotification[]) {
  if (!notifications.some((notification) => notification.type.startsWith(DOCUMENT_NOTIFICATION_PREFIX))) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(DASHBOARD_DOCUMENTS_REFRESH_EVENT, {
      detail: { source: 'notifications' },
    })
  );
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const applyNotificationsPayload = useCallback((payload: NotificationsResponse, options: { refreshDocuments?: boolean } = {}) => {
    const nextNotifications = Array.isArray(payload.notifications) ? payload.notifications : [];
    setNotifications(nextNotifications);
    setUnreadCount(Math.max(0, Number(payload.unreadCount || 0)));
    if (options.refreshDocuments ?? true) {
      notifyDocumentRefresh(nextNotifications);
    }
  }, []);

  const loadNotifications = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/notifications?limit=10', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Unable to load notifications');
      }

      const payload = (await response.json()) as NotificationsResponse;
      applyNotificationsPayload(payload, { refreshDocuments: true });
      setError(null);
    } catch (err) {
      if (!options.silent) {
        setError(err instanceof Error ? err.message : 'Unable to load notifications');
      }
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }, [applyNotificationsPayload]);

  const patchNotifications = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('Unable to update notifications');
    }

    return (await response.json()) as NotificationMutationResponse;
  }, []);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const unreadIds = new Set(
      notifications.filter((notification) => ids.includes(notification.id) && !notification.readAt).map((notification) => notification.id)
    );

    setNotifications((current) =>
      current.map((notification) =>
        ids.includes(notification.id) ? { ...notification, readAt: notification.readAt || now } : notification
      )
    );
    setUnreadCount((current) => Math.max(0, current - unreadIds.size));

    try {
      const payload = await patchNotifications({ action: 'mark_read', ids });
      if (typeof payload.unreadCount === 'number') {
        setUnreadCount(Math.max(0, payload.unreadCount));
      }
    } catch {
      void loadNotifications({ silent: true });
    }
  }, [loadNotifications, notifications, patchNotifications]);

  const markAllRead = useCallback(async () => {
    if (unreadCount <= 0) return;
    const now = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, readAt: notification.readAt || now }))
    );
    setUnreadCount(0);

    try {
      const payload = await patchNotifications({ action: 'mark_all_read' });
      if (typeof payload.unreadCount === 'number') {
        setUnreadCount(Math.max(0, payload.unreadCount));
      }
    } catch {
      void loadNotifications({ silent: true });
    }
  }, [loadNotifications, patchNotifications, unreadCount]);

  const archiveNotification = useCallback(async (id: string) => {
    const previous = notifications;
    setNotifications((current) => current.filter((notification) => notification.id !== id));
    setUnreadCount((current) =>
      previous.some((notification) => notification.id === id && !notification.readAt)
        ? Math.max(0, current - 1)
        : current
    );

    try {
      const payload = await patchNotifications({ action: 'archive', ids: [id] });
      if (typeof payload.unreadCount === 'number') {
        setUnreadCount(Math.max(0, payload.unreadCount));
      }
    } catch {
      setNotifications(previous);
      void loadNotifications({ silent: true });
    }
  }, [loadNotifications, notifications, patchNotifications]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      void loadNotifications({ silent: true });
      return;
    }

    const source = new EventSource('/api/notifications/stream', {
      withCredentials: true,
    });

    const handleNotifications = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as NotificationsResponse;
        applyNotificationsPayload(payload, { refreshDocuments: payload.realtimeReason === 'created' });
        setError(null);
      } catch {
        // Ignore malformed stream frames and wait for the next snapshot.
      }
    };
    const handleStreamError = () => {
      setError('Live notification updates are reconnecting.');
    };
    const handleNativeStreamError = () => {
      setError('Live notification updates are reconnecting.');
      void loadNotifications({ silent: true });
    };

    source.addEventListener('notifications', handleNotifications);
    source.addEventListener('notification-error', handleStreamError);
    source.addEventListener('error', handleNativeStreamError);

    return () => {
      source.removeEventListener('notifications', handleNotifications);
      source.removeEventListener('notification-error', handleStreamError);
      source.removeEventListener('error', handleNativeStreamError);
      source.close();
    };
  }, [applyNotificationsPayload, loadNotifications]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadNotifications({ silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!isOpen) return;
    void loadNotifications({ silent: notifications.length > 0 });

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, loadNotifications, notifications.length]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="relative text-slate-700"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={unreadLabel(unreadCount)}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </Button>

      <div
        className={`absolute right-0 z-50 mt-2 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl transition duration-150 ${
          isOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
        }`}
        role="menu"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <p className="text-xs text-slate-500">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="Refresh"
              aria-label="Refresh notifications"
              onClick={() => loadNotifications()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="Mark all read"
              aria-label="Mark all notifications read"
              disabled={unreadCount <= 0}
              onClick={markAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {error ? (
          <div className="px-4 py-5 text-sm text-rose-600">{error}</div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <Inbox className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No notifications</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {notifications.map((notification) => {
              const isUnread = !notification.readAt;
              return (
                <div
                  key={notification.id}
                  className={`group flex gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
                    isUnread ? 'bg-sky-50/70' : 'bg-white'
                  }`}
                >
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      isUnread ? 'bg-sky-600' : 'bg-transparent'
                    }`}
                    aria-hidden="true"
                  />
                  <Link
                    href={notification.href || '/dashboard'}
                    className="min-w-0 flex-1"
                    role="menuitem"
                    onClick={() => {
                      setIsOpen(false);
                      if (isUnread) {
                        void markRead([notification.id]);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-900">{notification.title}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{notification.body}</p>
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    title="Dismiss"
                    aria-label={`Dismiss ${notification.title}`}
                    onClick={() => archiveNotification(notification.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
