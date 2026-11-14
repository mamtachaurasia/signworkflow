import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';

import {
  getClientIp,
  getUserAgent,
  isSecureRequest,
  validateCsrfToken,
  withSecurityHeaders,
} from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { writeAuditEvent } from '@/lib/audit';
import { ensurePdfFileName, getCloudProviderLabel } from '@/lib/cloud/common';
import { exportPdfToConnectedProvider } from '@/lib/cloud/connections';
import { isCloudProviderId } from '@/lib/cloud/types';
import { canReadDocument, resolveDocumentReadScope } from '@/lib/document-access';
import { buildSignedDocumentPdf } from '@/lib/signed-document-pdf';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import DocumentModel from '@/models/Document';
import OrganizationModel from '@/models/Organization';
import UserModel from '@/models/Users';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const ExportSchema = z
  .object({
    provider: z.string().trim().min(1),
    documentId: z.string().trim().min(1),
  })
  .strict();

export async function POST(req: NextRequest) {
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

  const authContext = await getAuthContext(req);
  if (!authContext?.userId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  }

  if (!authContext.orgId) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Workspace context is missing.' }, { status: 400 }));
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 }));
  }

  const parsed = ExportSchema.safeParse(rawBody);
  if (!parsed.success) {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Validation failed' }, { status: 400 })
    );
  }

  if (!isCloudProviderId(parsed.data.provider)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Unsupported cloud provider.' }, { status: 400 }));
  }

  const planGate = await getPlanGateForOrgFeature({ orgId: authContext.orgId, feature: 'cloud_library' });
  if (!planGate.allowed) {
    return withSecurityHeaders(req, NextResponse.json({ message: planGate.message }, { status: planGate.status }));
  }

  await connectDB();

  const document = await DocumentModel.findById(parsed.data.documentId);
  if (!document) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Document not found.' }, { status: 404 }));
  }

  if (document.deletedAt) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Document has been trashed.' }, { status: 410 }));
  }

  if (document.status !== 'signed' && document.status !== 'completed') {
    return withSecurityHeaders(
      req,
      NextResponse.json({ message: 'Only completed signed documents can be exported.' }, { status: 409 })
    );
  }

  const readScope = await resolveDocumentReadScope(authContext.userId, authContext.orgId, authContext.orgRole);
  const requester = mongoose.Types.ObjectId.isValid(authContext.userId)
    ? await UserModel.findById(authContext.userId)
        .select('email')
        .lean<{ email?: unknown } | null>()
    : null;
  const requesterEmail = typeof requester?.email === 'string' ? requester.email : null;
  const hasAccess = canReadDocument({
    userId: authContext.userId,
    orgId: authContext.orgId,
    orgRole: authContext.orgRole,
    documentUserId: String(document.userId),
    documentOrgId: document.orgId ? String(document.orgId) : null,
    documentTeamId: document.teamId ? String(document.teamId) : null,
    requesterEmail,
    sharedWith: document.sharedWith,
    accessibleTeamIds: readScope.accessibleTeamIds,
  });

  if (!hasAccess) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Forbidden' }, { status: 403 }));
  }

  const workspace = document.orgId
    ? await OrganizationModel.findById(document.orgId).select('name').lean<{ name?: string } | null>()
    : null;

  try {
    const pdf = await buildSignedDocumentPdf({
      document,
      requesterUserId: authContext.userId,
    });

    const upload = await exportPdfToConnectedProvider({
      userId: authContext.userId,
      provider: parsed.data.provider,
      fileName: ensurePdfFileName(pdf.fileName),
      contentType: 'application/pdf',
      fileBuffer: pdf.buffer,
      workspaceName: workspace?.name || null,
    });

    await writeAuditEvent({
      userId: authContext.userId,
      orgId: authContext.orgId,
      documentId: document._id,
      action: 'cloud.export.completed',
      ipAddress,
      userAgent,
      metadata: {
        provider: parsed.data.provider,
        providerFileId: upload.providerFileId,
      },
    });

    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          success: true,
          provider: parsed.data.provider,
          providerLabel: getCloudProviderLabel(parsed.data.provider),
          fileId: upload.providerFileId,
          fileName: upload.providerFileName,
          providerUrl: upload.providerUrl,
          message: `Signed PDF exported to ${getCloudProviderLabel(parsed.data.provider)}.`,
        },
        { status: 200 }
      )
    );
  } catch (error) {
    console.error('Cloud export failed:', error);
    return withSecurityHeaders(
      req,
      NextResponse.json(
        {
          message: error instanceof Error ? error.message : 'Unable to export the signed PDF.',
        },
        { status: 500 }
      )
    );
  }
}
