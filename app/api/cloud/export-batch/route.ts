import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClientIp, getUserAgent, isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { writeAuditEvent } from '@/lib/audit';
import { ensurePdfFileName } from '@/lib/cloud/common';
import { exportPdfToConnectedProvider } from '@/lib/cloud/connections';
import { isCloudProviderId } from '@/lib/cloud/types';
import { buildSignedDocumentPdf } from '@/lib/signed-document-pdf';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { isAdminRole } from '@/lib/role-utils';
import DocumentModel from '@/models/Document';
import OrganizationModel from '@/models/Organization';
import connectDB from '@/utils/db';

const BatchSchema = z.object({ provider: z.string().trim().min(1), documentIds: z.array(z.string().trim().min(1)).min(1).max(50) }).strict();

export async function POST(req: NextRequest) {
  if (!isSecureRequest(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 }));
  if (!validateCsrfToken(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 }));
  const auth = await getAuthContext(req);
  if (!auth?.userId || !auth.orgId) return withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 }));
  if (!isAdminRole(auth.orgRole)) return withSecurityHeaders(req, NextResponse.json({ message: 'Admin access required for batch export.' }, { status: 403 }));
  const parsed = BatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isCloudProviderId(parsed.data.provider)) return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid provider or documentIds.' }, { status: 400 }));
  const gate = await getPlanGateForOrgFeature({ orgId: auth.orgId, feature: 'cloud_library' });
  if (!gate.allowed) return withSecurityHeaders(req, NextResponse.json({ message: gate.message }, { status: gate.status }));
  await connectDB();
  const docs = await DocumentModel.find({ _id: { $in: parsed.data.documentIds }, orgId: auth.orgId, deletedAt: null, status: { $in: ['signed', 'completed'] } }).limit(50);
  const workspace = await OrganizationModel.findById(auth.orgId).select('name').lean<{ name?: string } | null>();
  const results: Array<{ documentId: string; success: boolean; message?: string; providerFileId?: string }> = [];
  for (const document of docs) {
    try {
      const pdf = await buildSignedDocumentPdf({ document, requesterUserId: auth.userId });
      const upload = await exportPdfToConnectedProvider({ userId: auth.userId, provider: parsed.data.provider, fileName: ensurePdfFileName(pdf.fileName), contentType: 'application/pdf', fileBuffer: pdf.buffer, workspaceName: workspace?.name || null });
      await writeAuditEvent({ userId: auth.userId, orgId: auth.orgId, documentId: document._id, action: 'cloud.export.completed', ipAddress: getClientIp(req), userAgent: getUserAgent(req), metadata: { provider: parsed.data.provider, providerFileId: upload.providerFileId, batch: true } });
      results.push({ documentId: String(document._id), success: true, providerFileId: upload.providerFileId });
    } catch (error) {
      results.push({ documentId: String(document._id), success: false, message: error instanceof Error ? error.message : 'Export failed.' });
    }
  }
  const found = new Set(docs.map((doc) => String(doc._id)));
  for (const id of parsed.data.documentIds.filter((value) => !found.has(value))) results.push({ documentId: id, success: false, message: 'Document not found or is not completed.' });
  return withSecurityHeaders(req, NextResponse.json({ provider: parsed.data.provider, requested: parsed.data.documentIds.length, succeeded: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length, results }));
}
