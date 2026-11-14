import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { writeAuditEvent } from '@/lib/audit';
import { getClientIp, getUserAgent, isSecureRequest, validateCsrfToken, withSecurityHeaders } from '@/lib/auth';
import { getAuthContext } from '@/lib/auth-context';
import { sanitizeCloudFolderSegment } from '@/lib/cloud/common';
import { listWorkspaceCloudConnections } from '@/lib/cloud/connections';
import { isCloudProviderId } from '@/lib/cloud/types';
import { isAdminRole } from '@/lib/role-utils';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { CLOUD_JOB_HISTORY_STATUSES, parseRecoveryHistoryQuery } from '@/lib/recovery-history';
import WorkspaceCloudArchiveJobModel from '@/models/WorkspaceCloudArchiveJob';
import WorkspaceCloudArchiveRuleModel from '@/models/WorkspaceCloudArchiveRule';
import WorkspaceCloudConnectionModel from '@/models/WorkspaceCloudConnection';
import connectDB from '@/utils/db';

export const runtime = 'nodejs';

const RuleSchema = z.object({
  provider: z.string().trim().min(1),
  enabled: z.boolean(),
  destinationFolder: z.string().trim().max(100).nullable().optional(),
}).strict();

type AuthResult =
  | { ok: true; context: { userId: string; orgId: string } }
  | { ok: false; response: NextResponse };

async function authenticateAdmin(req: NextRequest): Promise<AuthResult> {
  if (!isSecureRequest(req)) return { ok: false, response: NextResponse.json({ message: 'HTTPS is required.' }, { status: 400 }) };
  const context = await getAuthContext(req);
  if (!context?.userId || !context.orgId) return { ok: false, response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) };
  if (!isAdminRole(context.orgRole)) return { ok: false, response: NextResponse.json({ message: 'Workspace admin access is required.' }, { status: 403 }) };
  const gate = await getPlanGateForOrgFeature({ orgId: context.orgId, feature: 'cloud_library' });
  if (!gate.allowed) return { ok: false, response: NextResponse.json({ message: gate.message }, { status: gate.status }) };
  return { ok: true, context: { userId: context.userId, orgId: context.orgId } };
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return withSecurityHeaders(req, auth.response);
  let history;
  try {
    history = parseRecoveryHistoryQuery(req.nextUrl.searchParams, { orgId: auth.context.orgId }, CLOUD_JOB_HISTORY_STATUSES);
  } catch (error) {
    return withSecurityHeaders(req, NextResponse.json({ message: (error as Error).message }, { status: 400 }));
  }
  await connectDB();
  const [providers, rules, jobs] = await Promise.all([
    listWorkspaceCloudConnections(auth.context.orgId),
    WorkspaceCloudArchiveRuleModel.find({ orgId: auth.context.orgId })
      .select('provider enabled destinationFolder updatedAt')
      .lean(),
    WorkspaceCloudArchiveJobModel.find(history.filter)
      .select('documentId provider destinationFolder status attempts maxAttempts completedAt providerUrl lastError createdAt updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(history.limit + 1)
      .lean(),
  ]);
  const page = history.page(jobs);
  return withSecurityHeaders(req, NextResponse.json({
    providers,
    rules: rules.map(({ _id, ...rule }) => ({ ...rule, id: String(_id) })),
    jobs: page.items.map(({ _id, ...job }) => ({ ...job, id: String(_id), documentId: String(job.documentId) })),
    nextCursor: page.nextCursor,
  }));
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (!auth.ok) return withSecurityHeaders(req, auth.response);
  if (!validateCsrfToken(req)) return withSecurityHeaders(req, NextResponse.json({ message: 'CSRF validation failed.' }, { status: 403 }));
  const parsed = RuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isCloudProviderId(parsed.data.provider)) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Invalid workspace archive rule.' }, { status: 400 }));
  }

  await connectDB();
  const connection = await WorkspaceCloudConnectionModel.findOne({
    orgId: auth.context.orgId,
    provider: parsed.data.provider,
  }).select('_id').lean<{ _id: unknown } | null>();
  if (!connection) {
    return withSecurityHeaders(req, NextResponse.json({ message: 'Connect this provider as a workspace archive destination first.' }, { status: 409 }));
  }

  const destinationFolder = parsed.data.destinationFolder
    ? sanitizeCloudFolderSegment(parsed.data.destinationFolder)
    : parsed.data.enabled
      ? 'SignWorkflow Workspace Archive'
      : null;
  const rule = await WorkspaceCloudArchiveRuleModel.findOneAndUpdate(
    { orgId: auth.context.orgId, provider: parsed.data.provider },
    {
      $set: {
        connectionId: connection._id,
        configuredBy: auth.context.userId,
        enabled: parsed.data.enabled,
        destinationFolder,
      },
      $setOnInsert: { orgId: auth.context.orgId, provider: parsed.data.provider },
    },
    { new: true, upsert: true }
  ).lean<{ _id: unknown; provider: string; enabled: boolean; destinationFolder?: string | null; updatedAt?: Date } | null>();
  await writeAuditEvent({
    userId: auth.context.userId,
    orgId: auth.context.orgId,
    action: 'cloud.workspace_archive.rule_updated',
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    metadata: { provider: parsed.data.provider, enabled: parsed.data.enabled, destinationFolder },
  });
  return withSecurityHeaders(req, NextResponse.json({
    rule: {
      id: String(rule?._id),
      provider: rule?.provider,
      enabled: rule?.enabled,
      destinationFolder: rule?.destinationFolder || null,
      updatedAt: rule?.updatedAt,
    },
  }));
}
