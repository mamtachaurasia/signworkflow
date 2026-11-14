import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import UserModel from '@/models/Users';
import { authenticateRequest } from '@/middleware/authMiddleware';

export const runtime = 'nodejs';

import { DATE_FORMAT_OPTIONS } from '@/lib/date-formats';
import { normalizeUserSettings } from '@/lib/user-settings';

const DATE_FORMATS = DATE_FORMAT_OPTIONS;

const SettingsSchema = z
  .object({
    twoFactor: z.boolean().optional(),
    displayEsignId: z.boolean().optional(),
    dateFormat: z.enum(DATE_FORMATS).optional(),
    inviteSubject: z.string().trim().min(1).max(300).optional(),
    inviteMessage: z.string().trim().min(1).max(2000).optional(),
    timeZone: z.string().trim().min(1).max(80).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    weekStart: z.enum(['sunday', 'monday']).optional(),
    timeFormat: z.enum(['12h', '24h']).optional(),
    defaultSigningMode: z.enum(['parallel', 'sequential']).optional(),
    defaultExpirationDays: z.number().int().min(1).max(365).optional(),
    autoReminders: z.boolean().optional(),
    reminderIntervalDays: z.number().int().min(1).max(30).optional(),
    emailDigest: z.enum(['immediate', 'daily', 'weekly', 'off']).optional(),
    notifyOnViewed: z.boolean().optional(),
    notifyOnSigned: z.boolean().optional(),
    notifyOnCompleted: z.boolean().optional(),
    notifyOnDeclined: z.boolean().optional(),
    attachAuditTrail: z.boolean().optional(),
    attachCertificate: z.boolean().optional(),
    watermarkDownloads: z.boolean().optional(),
    sessionTimeoutMinutes: z.number().int().min(5).max(480).optional(),
    loginAlerts: z.boolean().optional(),
    requireReauthForCritical: z.boolean().optional(),
  })
  .strict();

const CRITICAL_SETTING_KEYS = new Set([
  'twoFactor',
  'loginAlerts',
  'requireReauthForCritical',
  'sessionTimeoutMinutes',
]);

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

  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return withSecurityHeaders(req, auth.response);
  }

  try {
    const user = await UserModel.findById(auth.context.user._id)
      .select('settings')
      .lean<{ settings?: unknown } | null>();

    if (!user) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'User not found' }, { status: 404 })
      );
    }

    return withSecurityHeaders(req, NextResponse.json(normalizeUserSettings(user.settings), { status: 200 }));
  } catch (error) {
    console.error('GET /api/user/settings error:', error);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    );
  }
}

export async function PATCH(req: NextRequest) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);

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

  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return withSecurityHeaders(req, auth.response);
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

  const parsed = SettingsSchema.safeParse(body);
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
    const existing = await UserModel.findById(auth.context.user._id)
      .select('settings')
      .lean<{ settings?: unknown } | null>();
    if (!existing) {
      return withSecurityHeaders(
        req,
        NextResponse.json({ message: 'User not found' }, { status: 404 })
      );
    }

    const existingSettings = normalizeUserSettings(existing.settings);
    const updateTouchesCritical = Object.keys(parsed.data).some((key) => CRITICAL_SETTING_KEYS.has(key));
    if (existingSettings.requireReauthForCritical && updateTouchesCritical) {
      const authAgeSeconds = Math.floor(Date.now() / 1000) - auth.context.token.authTime;
      if (authAgeSeconds > 10 * 60) {
        return withSecurityHeaders(
          req,
          NextResponse.json(
            { message: 'Recent authentication required', reason: 'reauth_required' },
            { status: 401 }
          )
        );
      }
    }

    const merged = normalizeUserSettings({
      ...existingSettings,
      ...parsed.data,
    });

    await UserModel.updateOne(
      { _id: auth.context.user._id },
      {
        $set: {
          settings: merged,
        },
      }
    ).exec();

    await writeAuditEvent({
      userId: auth.context.user._id,
      action: 'user.settings.updated',
      ipAddress,
      userAgent,
      metadata: {
        sessionId: auth.context.sessionId,
      },
    });

    return withSecurityHeaders(req, NextResponse.json({ success: true, settings: merged }, { status: 200 }));
  } catch (error) {
    console.error('PATCH /api/user/settings error:', error);
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    );
  }
}
