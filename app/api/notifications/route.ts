import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import {
  archiveNotifications,
  listUserNotifications,
  markNotificationsRead,
  syncRecentDocumentEventNotificationsForUser,
} from '@/lib/notifications';
import { getAuthContext } from '@/lib/auth-context';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const ObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

const PatchBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_read'),
    ids: z.array(ObjectIdSchema).min(1).max(100),
  }),
  z.object({
    action: z.literal('mark_all_read'),
  }),
  z.object({
    action: z.literal('archive'),
    ids: z.array(ObjectIdSchema).min(1).max(100),
  }),
]);

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.floor(parsed), 1), 50);
}

export async function OPTIONS(req: NextRequest) {
  return withSecurityHeaders(req, new NextResponse(null, { status: 204 }));
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

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get('limit'));
  const cursor = searchParams.get('cursor');
  const unreadOnly = searchParams.get('unreadOnly') === 'true';

  try {
    await connectDB();

    try {
      await syncRecentDocumentEventNotificationsForUser({ userId: auth.userId });
    } catch (syncError) {
      console.error('Failed to sync recent document notifications:', syncError);
    }

    const result = await listUserNotifications({
      userId: auth.userId,
      limit,
      cursor,
      unreadOnly,
    });

    return withSecurityHeaders(req, NextResponse.json(result, { status: 200 }));
  } catch (error) {
    console.error('GET /api/notifications error:', error);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  if (!validateCsrfToken(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'CSRF validation failed', reason: 'csrf_mismatch' }, { status: 403 })
    );
  }

  const auth = await getAuthContext(req);
  if (!auth?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
    );
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: 'Validation failed',
          errors: parsed.error.issues.map((issue: { message: string }) => issue.message),
        },
        { status: 400 }
      )
    );
  }

  try {
    await connectDB();

    const unreadCount =
      parsed.data.action === 'mark_all_read'
        ? await markNotificationsRead({ userId: auth.userId, all: true })
        : parsed.data.action === 'mark_read'
          ? await markNotificationsRead({
              userId: auth.userId,
              ids: parsed.data.ids,
            })
          : await archiveNotifications({
              userId: auth.userId,
              ids: parsed.data.ids,
            });

    return withSecurityHeaders(
      req,
      NextResponse.json({ success: true, unreadCount }, { status: 200 })
    );
  } catch (error) {
    console.error('PATCH /api/notifications error:', error);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    );
  }
}
