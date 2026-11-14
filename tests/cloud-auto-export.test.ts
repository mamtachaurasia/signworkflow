import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  jobFindOneAndUpdate: vi.fn(),
  jobUpdateOne: vi.fn(),
  jobInsertMany: vi.fn(),
  ruleFindOne: vi.fn(),
  ruleFind: vi.fn(),
  membershipFindOne: vi.fn(),
  documentFindOne: vi.fn(),
  organizationFindById: vi.fn(),
  userFindById: vi.fn(),
  resolveDocumentReadScope: vi.fn(),
  canReadDocument: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
  buildSignedDocumentPdf: vi.fn(),
  exportPdfToConnectedProvider: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/models/CloudExportJob', () => ({
  default: {
    findOneAndUpdate: mocks.jobFindOneAndUpdate,
    updateOne: mocks.jobUpdateOne,
    insertMany: mocks.jobInsertMany,
  },
}));
vi.mock('@/models/CloudExportRule', () => ({
  default: {
    findOne: mocks.ruleFindOne,
    find: mocks.ruleFind,
  },
}));
vi.mock('@/models/Membership', () => ({ default: { findOne: mocks.membershipFindOne } }));
vi.mock('@/models/Document', () => ({ default: { findOne: mocks.documentFindOne } }));
vi.mock('@/models/Organization', () => ({ default: { findById: mocks.organizationFindById } }));
vi.mock('@/models/Users', () => ({ default: { findById: mocks.userFindById } }));
vi.mock('@/lib/document-access', () => ({
  resolveDocumentReadScope: mocks.resolveDocumentReadScope,
  canReadDocument: mocks.canReadDocument,
}));
vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature,
}));
vi.mock('@/lib/signed-document-pdf', () => ({
  buildSignedDocumentPdf: mocks.buildSignedDocumentPdf,
}));
vi.mock('@/lib/cloud/connections', () => ({
  exportPdfToConnectedProvider: mocks.exportPdfToConnectedProvider,
}));
vi.mock('@/lib/audit', () => ({ writeAuditEvent: mocks.writeAuditEvent }));

import {
  enqueueAutomaticCloudExports,
  processCloudExportJob,
} from '@/lib/cloud/auto-export';

function queryResult<T>(value: T) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function cloudExportJob() {
  return {
    _id: 'job-1',
    orgId: 'org-1',
    userId: 'user-1',
    ruleId: 'rule-1',
    documentId: 'doc-1',
    provider: 'google_drive' as const,
    destinationFolder: 'Contracts',
    status: 'processing',
    attempts: 1,
    maxAttempts: 8,
    lockedAt: new Date(),
    lastError: null as string | null,
    providerFileId: null as string | null,
    providerUrl: null as string | null,
    completedAt: null as Date | null,
    nextAttemptAt: new Date(0),
    save: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(),
  };
}

describe('automatic cloud export queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.membershipFindOne.mockReturnValue(queryResult({ _id: 'membership-1', role: 'user' }));
    mocks.userFindById.mockReturnValue(queryResult({ email: 'member@example.com' }));
    mocks.resolveDocumentReadScope.mockResolvedValue({ hasOrgWideReadAccess: false, accessibleTeamIds: [] });
    mocks.canReadDocument.mockReturnValue(true);
    mocks.getPlanGateForOrgFeature.mockResolvedValue({ allowed: true, plan: 'business' });
    mocks.buildSignedDocumentPdf.mockResolvedValue({
      buffer: Buffer.from('signed-pdf'),
      fileName: 'Agreement-signed.pdf',
    });
    mocks.exportPdfToConnectedProvider.mockResolvedValue({
      providerFileId: 'drive-file-1',
      providerFileName: 'Agreement-signed.pdf',
      providerUrl: 'https://drive.example/file-1',
    });
    mocks.writeAuditEvent.mockResolvedValue(undefined);
    mocks.jobUpdateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });
    mocks.organizationFindById.mockReturnValue(queryResult({ name: 'Acme' }));
  });

  it('persists one idempotent job per enabled rule when a document finalizes', async () => {
    mocks.ruleFind.mockReturnValue(queryResult([
      { _id: 'rule-1', userId: 'user-1', provider: 'google_drive', destinationFolder: 'Contracts' },
      { _id: 'rule-2', userId: 'user-2', provider: 'dropbox', destinationFolder: 'Signed' },
    ]));
    mocks.jobInsertMany.mockResolvedValue([{ _id: 'job-1' }, { _id: 'job-2' }]);

    await enqueueAutomaticCloudExports({ orgId: 'org-1', documentId: 'doc-1' });

    expect(mocks.jobInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ ruleId: 'rule-1', documentId: 'doc-1', provider: 'google_drive', destinationFolder: 'Contracts' }),
      expect.objectContaining({ ruleId: 'rule-2', documentId: 'doc-1', provider: 'dropbox', destinationFolder: 'Signed' }),
    ], { ordered: false });
  });

  it('renders and uploads a completed document, then records completion', async () => {
    const job = cloudExportJob();
    const document = { _id: 'doc-1', orgId: 'org-1', userId: 'user-1', status: 'completed' };
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'rule-1', enabled: true }) });
    mocks.documentFindOne.mockResolvedValue(document);

    const result = await processCloudExportJob('job-1');

    expect(result).toBe(job);
    expect(mocks.exportPdfToConnectedProvider).toHaveBeenCalledWith({
      userId: 'user-1',
      provider: 'google_drive',
      fileName: 'Agreement-signed.pdf',
      contentType: 'application/pdf',
      fileBuffer: Buffer.from('signed-pdf'),
      workspaceName: 'Acme',
      destinationFolder: 'Contracts',
      idempotencyKey: 'job-1',
    });
    expect(job.status).toBe('completed');
    expect(job.providerFileId).toBe('drive-file-1');
    expect(job.set).toHaveBeenCalledWith(expect.stringMatching(/^integrationOutbox\./), expect.objectContaining({
      event: 'cloud.export.completed', data: expect.objectContaining({ documentId: 'doc-1' }),
    }));
    expect(job.save).toHaveBeenCalledOnce();
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'cloud.export.completed',
      metadata: expect.objectContaining({ automatic: true, jobId: 'job-1' }),
    }));
  });

  it('moves a transient upload error into the retry schedule', async () => {
    const job = { ...cloudExportJob(), provider: 'dropbox' as const, destinationFolder: 'Signed' };
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'rule-1', enabled: true }) });
    mocks.documentFindOne.mockResolvedValue({ _id: 'doc-1', orgId: 'org-1', userId: 'user-1', status: 'completed' });
    mocks.exportPdfToConnectedProvider.mockRejectedValue(new Error('Dropbox unavailable'));

    await processCloudExportJob('job-1');

    expect(job.status).toBe('failed');
    expect(job.lastError).toBe('Dropbox unavailable');
    expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(job.lockedAt).toBeNull();
    expect(job.save).toHaveBeenCalledOnce();
  });

  it('keeps a successfully uploaded job completed when its audit write fails', async () => {
    const job = cloudExportJob();
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'rule-1', enabled: true }) });
    mocks.documentFindOne.mockResolvedValue({ _id: 'doc-1', orgId: 'org-1', userId: 'user-1', status: 'completed' });
    mocks.writeAuditEvent.mockRejectedValueOnce(new Error('audit database unavailable'));

    const result = await processCloudExportJob('job-1');

    expect(result).toBe(job);
    expect(job.status).toBe('completed');
    expect(job.lastError).toBeNull();
    expect(job.save).toHaveBeenCalledOnce();
    expect(mocks.exportPdfToConnectedProvider).toHaveBeenCalledOnce();
  });

  it('links the completed job event to its audit record before the outbox can fan out', async () => {
    const job = cloudExportJob();
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'rule-1', enabled: true }) });
    mocks.documentFindOne.mockResolvedValue({ _id: 'doc-1', orgId: 'org-1', userId: 'user-1', status: 'completed' });
    mocks.writeAuditEvent.mockResolvedValue('audit-1');

    await processCloudExportJob('job-1');

    const [filter, update, options] = mocks.jobUpdateOne.mock.calls[0];
    const eventPath = Object.keys(filter).find((path) => path.endsWith('.eventId'));
    expect(eventPath).toMatch(/^integrationOutbox\.[^.]+\.eventId$/);
    expect(filter[eventPath!]).toMatch(/^evt_/);
    expect(update).toEqual({
      $set: { [eventPath!.replace(/\.eventId$/, '.data.auditLogId')]: 'audit-1' },
    });
    expect(options).toEqual({ timestamps: false });
  });

  it('permanently rejects an export when the rule owner cannot read the document', async () => {
    const job = cloudExportJob();
    const document = {
      _id: 'doc-1',
      orgId: 'org-1',
      userId: 'another-user',
      teamId: 'private-team',
      sharedWith: [],
      status: 'completed',
    };
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'rule-1', enabled: true }) });
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.canReadDocument.mockReturnValue(false);

    await processCloudExportJob('job-1');

    expect(mocks.canReadDocument).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'user',
      documentUserId: 'another-user',
      documentTeamId: 'private-team',
    }));
    expect(job.status).toBe('dead_letter');
    expect(job.lastError).toBe('The export owner no longer has access to this document.');
    expect(job.lockedAt).toBeNull();
    expect(mocks.buildSignedDocumentPdf).not.toHaveBeenCalled();
    expect(mocks.exportPdfToConnectedProvider).not.toHaveBeenCalled();
    expect(job.save).toHaveBeenCalledOnce();
  });

  it('dead-letters a stale processing job that crashed on its final attempt', async () => {
    const job = { ...cloudExportJob(), attempts: 9, maxAttempts: 8 };
    mocks.jobFindOneAndUpdate.mockResolvedValue(job);

    await processCloudExportJob('job-1');

    expect(job.status).toBe('dead_letter');
    expect(job.lastError).toBe('The worker stopped during the final automatic export attempt.');
    expect(job.lockedAt).toBeNull();
    expect(mocks.ruleFindOne).not.toHaveBeenCalled();
    expect(mocks.exportPdfToConnectedProvider).not.toHaveBeenCalled();
    expect(job.save).toHaveBeenCalledOnce();
    expect(mocks.jobFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ status: 'processing' }),
        ]),
      }),
      expect.anything(),
      expect.anything()
    );
  });
});
