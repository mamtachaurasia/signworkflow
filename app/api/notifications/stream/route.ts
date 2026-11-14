import { NextRequest, NextResponse } from 'next/server';

import { isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import {
  listUserNotifications,
  syncRecentDocumentEventNotificationsForUser,
} from '@/lib/notifications';
import {
  type NotificationEventPayload,
  subscribeToNotificationEvents,
} from '@/lib/notification-events';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL_MS = 25_000;
type StreamSnapshotReason = NotificationEventPayload['reason'] | 'snapshot';

function encodeSseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function encodeSseComment(comment: string): Uint8Array {
  return encoder.encode(`: ${comment}\n\n`);
}

export async function GET(req: NextRequest) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  const auth = await getAuthContext(req);
  if (!auth?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  const userId = String(auth.userId);
  await connectDB();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let sending = false;
      let queued = false;
      let queuedReason: StreamSnapshotReason = 'snapshot';

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const sendSnapshot = async (reason: StreamSnapshotReason = 'snapshot') => {
        if (closed) return;
        if (sending) {
          queued = true;
          queuedReason = queuedReason === 'created' || reason === 'created' ? 'created' : reason;
          return;
        }

        sending = true;
        try {
          await syncRecentDocumentEventNotificationsForUser({ userId });
          const result = await listUserNotifications({ userId, limit: 10 });
          safeEnqueue(encodeSseEvent('notifications', { ...result, realtimeReason: reason }));
        } catch (error) {
          safeEnqueue(
            encodeSseEvent('notification-error', {
              message: error instanceof Error ? error.message : 'Unable to load notifications',
            })
          );
        } finally {
          sending = false;
          if (queued) {
            const nextReason = queuedReason;
            queued = false;
            queuedReason = 'snapshot';
            void sendSnapshot(nextReason);
          }
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      unsubscribe = subscribeToNotificationEvents(userId, (payload) => {
        void sendSnapshot(payload.reason);
      });

      heartbeat = setInterval(() => {
        safeEnqueue(encodeSseComment('keep-alive'));
      }, HEARTBEAT_INTERVAL_MS);

      req.signal.addEventListener('abort', cleanup, { once: true });
      safeEnqueue(encodeSseEvent('ready', { success: true }));
      void sendSnapshot();
    },
    cancel() {
      unsubscribe();
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    },
  });

  const response = new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });

  return withSecurityHeaders(req, response);
}
