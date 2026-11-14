import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import connectDB from '@/utils/db';
import TemplateModel, { type ITemplate, type ITemplateDefaultSigner } from '@/models/Template';
import { buildTemplateListFilter } from '@/lib/template-access';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { createDocumentFromTemplateRecord } from '@/lib/template-documents';
import { POST as sendForSigningRoute } from '@/app/api/documents/send-for-signing/route';
import { normalizeTemplateDefaultSigners } from '@/lib/template-signers';
import { getTemplateLayoutState } from '@/lib/template-layout';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';
import { getTemplatePdfArtifact } from '@/lib/template-artifacts';

export const runtime = 'nodejs';

const RecipientRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
});

const BulkSendSchema = z.object({
  templateId: z.string().trim().min(1),
  recipients: z.array(RecipientRowSchema).min(1).max(100),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().max(2000).optional(),
  teamId: z.string().trim().min(1).nullable().optional(),
  sendReminders: z.boolean().optional(),
  reminderDays: z.number().int().min(1).max(30).optional(),
  hasExpiry: z.boolean().optional(),
  expiryDays: z.number().int().min(1).max(365).optional(),
  captureGps: z.boolean().optional(),
  paymentRequest: z
    .object({
      enabled: z.boolean().optional(),
      amount: z.number().positive().max(1_000_000).optional(),
      currency: z.string().trim().min(3).max(3).optional(),
      description: z.string().trim().max(300).optional(),
      paymentLinkUrl: z.string().trim().url().max(2000).optional(),
    })
    .optional(),
});

type BulkRecipientSeed = {
  id: string;
  role: 'signer' | 'approver' | 'viewer';
  order: number;
};

type StaticRecipientSeed = {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'approver' | 'viewer';
  order: number;
};

type BulkRecipientLayout = {
  primary: BulkRecipientSeed;
  staticRecipients: StaticRecipientSeed[];
};

function resolveBulkRecipientLayout(template: {
  _id?: string;
  defaultSigners?: unknown[];
  fields?: unknown[];
}): BulkRecipientLayout {
  const normalizedSigners = normalizeTemplateDefaultSigners(
    Array.isArray(template.defaultSigners) ? (template.defaultSigners as ITemplateDefaultSigner[]) : [],
    template.fields ?? [],
    String(template._id || 'bulk_template')
  );

  const actionableRecipients = normalizedSigners.filter((signer) => signer.role !== 'viewer');
  if (actionableRecipients.length === 0) {
    throw new Error('Bulk send requires at least one signer or approver in the template.');
  }

  const primarySigner = actionableRecipients[0];
  const unsupportedExtraActionRecipients = actionableRecipients
    .slice(1)
    .filter((signer) => !signer.email.trim());

  if (unsupportedExtraActionRecipients.length > 0) {
    throw new Error(
      'Bulk send supports one variable signer or approver plus optional fixed recipients from the template.'
    );
  }

  const staticRecipients = normalizedSigners
    .filter((signer) => signer.id !== primarySigner.id)
    .map((signer) => ({
      id: signer.id,
      name: signer.name?.trim() || `Recipient ${signer.order}`,
      email: signer.email?.trim() || '',
      role: signer.role,
      order: signer.order,
    }));

  const missingStaticContacts = staticRecipients.some((recipient) => !recipient.email);
  if (missingStaticContacts) {
    throw new Error(
      'Additional template recipients need fixed email addresses before this template can be sent in bulk.'
    );
  }

  return {
    primary: {
      id: primarySigner.id || 'bulk_primary_recipient',
      role: primarySigner.role,
      order: primarySigner.order || 1,
    },
    staticRecipients,
  };
}

export const POST = withTrialWriteAccessFromAuthContext(async function POST(req: NextRequest, _context, authContext) {
  try {
    await connectDB();

    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const planGuard = await getPlanGateForOrgFeature({
      orgId: authContext.orgId,
      feature: 'bulk_send',
    });
    if (!planGuard.allowed) {
      return NextResponse.json({ message: planGuard.message }, { status: planGuard.status });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = BulkSendSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: 'Validation failed',
          errors: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      );
    }

    const template = (await TemplateModel.findOne({
      _id: parsed.data.templateId,
      ...buildTemplateListFilter({
        userId: authContext.userId,
        orgId: authContext.orgId,
        orgRole: authContext.orgRole,
      }),
    }).lean()) as ITemplate | null;

    if (!template) {
      return NextResponse.json({ message: 'Template not found' }, { status: 404 });
    }

    if (!getTemplatePdfArtifact(template)) {
      return NextResponse.json({
        message: 'This template is being migrated to secure object storage. Please try again after migration completes.',
        code: 'TEMPLATE_ARTIFACT_UNAVAILABLE',
      }, { status: 409 });
    }

    if (getTemplateLayoutState(template).fieldLayoutStatus === 'needs_review') {
      return NextResponse.json({
        message: 'Review and save the template fields before using bulk send.',
        code: 'TEMPLATE_FIELD_LAYOUT_NEEDS_REVIEW',
      }, { status: 409 });
    }

    const recipientLayout = resolveBulkRecipientLayout(template);
    const url = new URL('/api/documents/send-for-signing', req.url);
    const results: Array<{
      name: string;
      email: string;
      documentId?: string;
      status: 'sent' | 'failed';
      message?: string;
    }> = [];

    for (const row of parsed.data.recipients) {
      try {
        const createdDocument = await createDocumentFromTemplateRecord({
          template,
          ownerId: authContext.userId,
          orgId: authContext.orgId,
          documentName: `${template.name} - ${row.name}`,
        });

        const expiresAt =
          parsed.data.hasExpiry === false || !parsed.data.expiryDays
            ? undefined
            : new Date(Date.now() + parsed.data.expiryDays * 24 * 60 * 60 * 1000);

        const sendPayload = {
          documentId: createdDocument.documentId,
          recipients: [
            {
              id: recipientLayout.primary.id,
              name: row.name,
              email: row.email,
              role: recipientLayout.primary.role,
              order: recipientLayout.primary.order,
              sendReminders: parsed.data.sendReminders ?? true,
              reminderDays: parsed.data.sendReminders === false ? undefined : parsed.data.reminderDays,
              expiresAt,
              captureGpsLocation: parsed.data.captureGps ?? false,
            },
            ...recipientLayout.staticRecipients.map((recipient) => ({
              id: recipient.id,
              name: recipient.name,
              email: recipient.email,
              role: recipient.role,
              order: recipient.order,
              sendReminders: parsed.data.sendReminders ?? true,
              reminderDays: parsed.data.sendReminders === false ? undefined : parsed.data.reminderDays,
              expiresAt,
              captureGpsLocation: parsed.data.captureGps ?? false,
            })),
          ].sort((left, right) => (left.order || 0) - (right.order || 0)),
          subject: parsed.data.subject,
          message: parsed.data.message,
          signingMode: 'parallel',
          teamId: parsed.data.teamId,
          paymentRequest: parsed.data.paymentRequest,
        };

        const headers = new Headers(req.headers);
        headers.set('content-type', 'application/json');
        const sendRequest = new NextRequest(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(sendPayload),
        });
        const sendResponse = await sendForSigningRoute(sendRequest);
        const sendResult = await sendResponse.json().catch(() => ({}));

        if (!sendResponse.ok) {
          throw new Error(sendResult?.message || 'Unable to send signing request');
        }

        results.push({
          name: row.name,
          email: row.email,
          documentId: createdDocument.documentId,
          status: 'sent',
        });
      } catch (error) {
        results.push({
          name: row.name,
          email: row.email,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Unable to send signing request',
        });
      }
    }

    const sentCount = results.filter((result) => result.status === 'sent').length;
    const failedCount = results.length - sentCount;

    return NextResponse.json({
      success: failedCount === 0,
      sentCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error('Bulk send route failed:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}, { requireCsrf: true, useSecurityHeaders: true });
