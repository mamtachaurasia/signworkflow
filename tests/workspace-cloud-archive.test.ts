import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  jobFindOneAndUpdate: vi.fn(),
  jobUpdateOne: vi.fn(),
  jobInsertMany: vi.fn(),
  ruleFind: vi.fn(),
  ruleFindOne: vi.fn(),
  documentFindOne: vi.fn(),
  organizationFindById: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
  buildSignedDocumentPdf: vi.fn(),
  exportPdfToWorkspaceProvider: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/models/WorkspaceCloudArchiveJob', () => ({ default: {
  findOneAndUpdate: mocks.jobFindOneAndUpdate,
  updateOne: mocks.jobUpdateOne,
  insertMany: mocks.jobInsertMany,
} }));
vi.mock('@/models/WorkspaceCloudArchiveRule', () => ({ default: { find: mocks.ruleFind, findOne: mocks.ruleFindOne } }));
vi.mock('@/models/Document', () => ({ default: { findOne: mocks.documentFindOne } }));
vi.mock('@/models/Organization', () => ({ default: { findById: mocks.organizationFindById } }));
vi.mock('@/lib/subscription-server', () => ({ getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature }));
vi.mock('@/lib/signed-document-pdf', () => ({ buildSignedDocumentPdf: mocks.buildSignedDocumentPdf }));
vi.mock('@/lib/cloud/connections', () => ({ exportPdfToWorkspaceProvider: mocks.exportPdfToWorkspaceProvider }));
vi.mock('@/lib/audit', () => ({ writeAuditEvent: mocks.writeAuditEvent }));

import { enqueueWorkspaceCloudArchives, processWorkspaceCloudArchiveJob } from '@/lib/cloud/workspace-archive';

function queryResult<T>(value: T) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function archiveJob() {
  return {
    _id: 'workspace-job-1', orgId: 'org-1', ruleId: 'rule-1', documentId: 'document-1', provider: 'google_drive' as const,
    destinationFolder: 'Workspace Archive', status: 'processing', attempts: 1, maxAttempts: 8, lockedAt: new Date(),
    lastError: null as string | null, providerFileId: null as string | null, providerUrl: null as string | null,
    completedAt: null as Date | null, nextAttemptAt: new Date(0), save: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(),
  };
}

describe('workspace-owned cloud archive queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.getPlanGateForOrgFeature.mockResolvedValue({ allowed: true, plan: 'business' });
    mocks.buildSignedDocumentPdf.mockResolvedValue({ buffer: Buffer.from('signed'), fileName: 'Agreement-signed.pdf' });
    mocks.exportPdfToWorkspaceProvider.mockResolvedValue({ providerFileId: 'drive-file-1', providerUrl: 'https://drive.example/file-1' });
    mocks.organizationFindById.mockReturnValue(queryResult({ name: 'Acme' }));
    mocks.writeAuditEvent.mockResolvedValue(undefined);
    mocks.jobUpdateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });
  });

  it('persists a single idempotent archive job for each enabled workspace rule', async () => {
    mocks.ruleFind.mockReturnValue(queryResult([
      { _id: 'rule-1', provider: 'google_drive', destinationFolder: 'Workspace Archive' },
    ]));
    mocks.jobInsertMany.mockResolvedValue([{ _id: 'workspace-job-1' }]);

    await enqueueWorkspaceCloudArchives({ orgId: 'org-1', documentId: 'document-1' });

    expect(mocks.jobInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ orgId: 'org-1', ruleId: 'rule-1', documentId: 'document-1', provider: 'google_drive' }),
    ], { ordered: false });
  });

  it('archives a finalized workspace document without borrowing a member personal connection', async () => {
    const job = archiveJob();
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue(queryResult({ configuredBy: 'workspace-admin-1' }));
    mocks.documentFindOne.mockResolvedValue({ _id: 'document-1', orgId: 'org-1', status: 'completed' });

    await processWorkspaceCloudArchiveJob('workspace-job-1');

    expect(mocks.exportPdfToWorkspaceProvider).toHaveBeenCalledWith({
      orgId: 'org-1', provider: 'google_drive', fileName: 'Agreement-signed.pdf', contentType: 'application/pdf',
      fileBuffer: Buffer.from('signed'), workspaceName: 'Acme', destinationFolder: 'Workspace Archive', idempotencyKey: 'workspace-job-1',
    });
    expect(job.status).toBe('completed');
    expect(job.set).toHaveBeenCalledWith(expect.stringMatching(/^integrationOutbox\./), expect.objectContaining({
      event: 'cloud.export.completed', data: expect.objectContaining({ documentId: 'document-1' }),
    }));
    expect(job.save).toHaveBeenCalledOnce();
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'cloud.workspace_archive.completed',
      metadata: expect.objectContaining({ workspaceOwned: true }),
    }));
  });

  it('dead-letters a job after its workspace rule is disabled', async () => {
    const job = archiveJob();
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue(queryResult(null));

    await processWorkspaceCloudArchiveJob('workspace-job-1');

    expect(job.status).toBe('dead_letter');
    expect(job.lastError).toContain('missing or disabled');
    expect(mocks.buildSignedDocumentPdf).not.toHaveBeenCalled();
  });

  it('keeps a successfully uploaded archive completed when its audit write fails', async () => {
    const job = archiveJob();
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue(queryResult({ configuredBy: 'workspace-admin-1' }));
    mocks.documentFindOne.mockResolvedValue({ _id: 'document-1', orgId: 'org-1', status: 'completed' });
    mocks.writeAuditEvent.mockRejectedValueOnce(new Error('audit database unavailable'));

    const result = await processWorkspaceCloudArchiveJob('workspace-job-1');

    expect(result).toBe(job);
    expect(job.status).toBe('completed');
    expect(job.lastError).toBeNull();
    expect(job.save).toHaveBeenCalledOnce();
    expect(mocks.exportPdfToWorkspaceProvider).toHaveBeenCalledOnce();
  });

  it('links the workspace archive event to the persisted audit record', async () => {
    const job = archiveJob();
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue(queryResult({ configuredBy: 'workspace-admin-1' }));
    mocks.documentFindOne.mockResolvedValue({ _id: 'document-1', orgId: 'org-1', status: 'completed' });
    mocks.writeAuditEvent.mockResolvedValue('audit-1');

    await processWorkspaceCloudArchiveJob('workspace-job-1');

    const [filter, update, options] = mocks.jobUpdateOne.mock.calls[0];
    const eventPath = Object.keys(filter).find((path) => path.endsWith('.eventId'));
    expect(eventPath).toMatch(/^integrationOutbox\.[^.]+\.eventId$/);
    expect(filter[eventPath!]).toMatch(/^evt_/);
    expect(update).toEqual({
      $set: { [eventPath!.replace(/\.eventId$/, '.data.auditLogId')]: 'audit-1' },
    });
    expect(options).toEqual({ timestamps: false });
  });
});
