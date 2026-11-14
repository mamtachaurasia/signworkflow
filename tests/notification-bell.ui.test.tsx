// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NotificationBell from '@/components/dashboard/NotificationBell';
import { DASHBOARD_DOCUMENTS_REFRESH_EVENT } from '@/lib/dashboard-events';

const listPayload = {
  notifications: [
    {
      id: '507f1f77bcf86cd799439012',
      type: 'document.viewed',
      title: 'Contract was viewed',
      body: 'Recipient opened the signing request.',
      href: '/builder/507f1f77bcf86cd799439013',
      actorName: 'Recipient',
      actorEmail: 'recipient@example.com',
      readAt: null,
      createdAt: new Date().toISOString(),
    },
  ],
  unreadCount: 1,
  nextCursor: null,
};

describe('NotificationBell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads notifications and marks them all read', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return new Response(JSON.stringify({ success: true, unreadCount: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(listPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NotificationBell />);

    const trigger = await screen.findByRole('button', { name: /1 unread/i });
    fireEvent.click(trigger);

    expect(await screen.findByText('Contract was viewed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /mark all notifications read/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ action: 'mark_all_read' }),
        })
      );
    });

    expect(screen.getByText('All caught up')).toBeInTheDocument();
  });

  it('requests a dashboard document refresh when document notifications load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify(listPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const refreshListener = vi.fn();
    window.addEventListener(DASHBOARD_DOCUMENTS_REFRESH_EVENT, refreshListener);

    try {
      render(<NotificationBell />);

      await waitFor(() => {
        expect(refreshListener).toHaveBeenCalled();
      });
    } finally {
      window.removeEventListener(DASHBOARD_DOCUMENTS_REFRESH_EVENT, refreshListener);
    }
  });

  it('uses the notification event stream when EventSource is available', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ notifications: [], unreadCount: 0, nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const eventSources: Array<{
      url: string;
      init?: EventSourceInit;
      close: ReturnType<typeof vi.fn>;
      emit: (type: string, payload?: unknown) => void;
    }> = [];

    class MockEventSource {
      url: string;
      init?: EventSourceInit;
      close = vi.fn();
      private listeners = new Map<string, EventListener[]>();

      constructor(url: string, init?: EventSourceInit) {
        this.url = url;
        this.init = init;
        eventSources.push({
          url,
          init,
          close: this.close,
          emit: (type, payload = {}) => {
            const event = new MessageEvent(type, { data: JSON.stringify(payload) });
            this.listeners.get(type)?.forEach((listener) => listener(event));
          },
        });
      }

      addEventListener(type: string, listener: EventListener) {
        this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
      }

      removeEventListener(type: string, listener: EventListener) {
        this.listeners.set(
          type,
          (this.listeners.get(type) || []).filter((candidate) => candidate !== listener)
        );
      }
    }

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', MockEventSource);

    render(<NotificationBell />);

    expect(eventSources).toHaveLength(1);
    expect(eventSources[0].url).toBe('/api/notifications/stream');
    expect(eventSources[0].init).toEqual({ withCredentials: true });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      eventSources[0].emit('notifications', listPayload);
    });

    expect(await screen.findByRole('button', { name: /1 unread/i })).toBeInTheDocument();

    act(() => {
      eventSources[0].emit('error');
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications?limit=10',
        expect.objectContaining({ credentials: 'include' })
      );
    });
  });

  it('does not request a document refresh for read/archive stream updates', async () => {
    const eventSources: Array<{
      emit: (type: string, payload?: unknown) => void;
    }> = [];

    class MockEventSource {
      close = vi.fn();
      private listeners = new Map<string, EventListener[]>();

      constructor() {
        eventSources.push({
          emit: (type, payload = {}) => {
            const event = new MessageEvent(type, { data: JSON.stringify(payload) });
            this.listeners.get(type)?.forEach((listener) => listener(event));
          },
        });
      }

      addEventListener(type: string, listener: EventListener) {
        this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
      }

      removeEventListener(type: string, listener: EventListener) {
        this.listeners.set(
          type,
          (this.listeners.get(type) || []).filter((candidate) => candidate !== listener)
        );
      }
    }

    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('EventSource', MockEventSource);
    const refreshListener = vi.fn();
    window.addEventListener(DASHBOARD_DOCUMENTS_REFRESH_EVENT, refreshListener);

    try {
      render(<NotificationBell />);

      act(() => {
        eventSources[0].emit('notifications', {
          ...listPayload,
          realtimeReason: 'changed',
        });
      });

      expect(await screen.findByRole('button', { name: /1 unread/i })).toBeInTheDocument();
      expect(refreshListener).not.toHaveBeenCalled();

      act(() => {
        eventSources[0].emit('notifications', {
          ...listPayload,
          realtimeReason: 'created',
        });
      });

      await waitFor(() => {
        expect(refreshListener).toHaveBeenCalled();
      });
    } finally {
      window.removeEventListener(DASHBOARD_DOCUMENTS_REFRESH_EVENT, refreshListener);
    }
  });
});
