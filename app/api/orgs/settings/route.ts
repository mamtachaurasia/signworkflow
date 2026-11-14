import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { writeAuditEvent } from '@/lib/audit';
import { getAuthContext } from '@/lib/auth-context';
import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import {
  getOrganizationSettingsByOrgId,
} from '@/lib/org-settings-server';
import { normalizeOrganizationSettings } from '@/lib/org-settings';
import { isAdminRole } from '@/lib/role-utils';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import OrganizationModel from '@/models/Organization';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const BrandingSchema = z
  .object({
    brandName: z.string().trim().max(120).optional(),
    primaryColor: z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    supportEmail: z.union([z.string().trim().email(), z.literal('')]).optional(),
  })
  .strict();

const DocumentDefaultsSchema = z
  .object({
    defaultSigningMode: z.enum(['parallel', 'sequential']).optional(),
    defaultExpirationDays: z.number().int().min(1).max(365).optional(),
    autoReminders: z.boolean().optional(),
    reminderIntervalDays: z.number().int().min(1).max(30).optional(),
  })
  .strict();

const NotificationRulesSchema = z
  .object({
    emailDigest: z.enum(['immediate', 'daily', 'weekly', 'off']).optional(),
    notifyOnViewed: z.boolean().optional(),
    notifyOnSigned: z.boolean().optional(),
    notifyOnCompleted: z.boolean().optional(),
    notifyOnDeclined: z.boolean().optional(),
    inviteSubject: z.string().trim().min(1).max(300).optional(),
    inviteMessage: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

const DefaultRetentionSchema = z
  .object({
    enabled: z.boolean().optional(),
    triggerEvent: z.enum(['createdAt', 'completedAt', 'finalizedAt', 'expiresAt', 'custom']).optional(),
    durationDays: z.number().int().min(1).max(365 * 25).optional(),
    regime: z.string().trim().max(160).optional(),
  })
  .strict();

const OrganizationSettingsPatchSchema = z
  .object({
    branding: BrandingSchema.optional(),
    documentDefaults: DocumentDefaultsSchema.optional(),
    notificationRules: NotificationRulesSchema.optional(),
    defaultRetention: DefaultRetentionSchema.optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  if (!isSecureRequest(req)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'HTTPS is required for authenticated endpoints.' }, { status: 400 })
    );
  }

  const context = await getAuthContext(req);
  if (!context?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  if (!context.orgId) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace context is missing' }, { status: 400 })
    );
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'org_settings' });
  if (!planGate.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGate.message }, { status: planGate.status })
    );
  }

  await connectDB();
  const settingsRecord = await getOrganizationSettingsByOrgId(context.orgId);
  if (!settingsRecord) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace not found' }, { status: 404 })
    );
  }

  return withSecurityHeaders(
    req,
    NextResponse.json(
      {
        organizationId: settingsRecord.organizationId,
        organizationName: settingsRecord.organizationName,
        brandName: settingsRecord.brandName,
        orgRole: context.orgRole,
        settings: settingsRecord.settings,
      },
      { status: 200 }
    )
  );
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

  const context = await getAuthContext(req);
  if (!context?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  if (!context.orgId) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace context is missing' }, { status: 400 })
    );
  }

  if (!isAdminRole(context.orgRole)) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Insufficient permissions to update workspace settings.' }, { status: 403 })
    );
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'org_settings' });
  if (!planGate.allowed) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: planGate.message }, { status: planGate.status })
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 })
    );
  }

  const parsed = OrganizationSettingsPatchSchema.safeParse(rawBody);
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

  await connectDB();

  const organization = await OrganizationModel.findById(context.orgId)
    .select('name settings')
    .lean<{ _id: unknown; name?: string; settings?: unknown } | null>();

  if (!organization) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Workspace not found' }, { status: 404 })
    );
  }

  const currentSettings = normalizeOrganizationSettings(organization.settings);
  const mergedSettings = normalizeOrganizationSettings({
    ...currentSettings,
    ...parsed.data,
    branding: {
      ...currentSettings.branding,
      ...(parsed.data.branding || {}),
    },
    documentDefaults: {
      ...currentSettings.documentDefaults,
      ...(parsed.data.documentDefaults || {}),
    },
    notificationRules: {
      ...currentSettings.notificationRules,
      ...(parsed.data.notificationRules || {}),
    },
    defaultRetention: {
      ...currentSettings.defaultRetention,
      ...(parsed.data.defaultRetention || {}),
    },
  });

  await OrganizationModel.updateOne(
    { _id: context.orgId },
    {
      $set: {
        settings: mergedSettings,
      },
    }
  ).exec();

  await writeAuditEvent({
    userId: context.userId,
    orgId: context.orgId,
    action: 'org.settings.updated',
    ipAddress,
    userAgent,
    metadata: {
      updatedSections: Object.keys(parsed.data),
    },
  });

  return withSecurityHeaders(
    req,
    NextResponse.json(
      {
        success: true,
        organizationId: String(organization._id),
        organizationName: organization.name?.trim() || 'Workspace',
        settings: mergedSettings,
      },
      { status: 200 }
    )
  );
}
