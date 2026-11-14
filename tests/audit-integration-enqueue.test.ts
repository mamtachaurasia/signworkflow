import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers/promises';

const mocks = vi.hoisted(() => ({
  auditFindOne: vi.fn(), auditCreate: vi.fn(),
  documentFindById: vi.fn(), documentUpdateOne: vi.fn(),
  documentOutbox: vi.fn(), auditOutbox: vi.fn(),
}));
vi.mock('@/models/AuditLog', () => ({ default: { findOne: mocks.auditFindOne, create: mocks.auditCreate } }));
vi.mock('@/models/Document', () => ({ default: {
  findById: mocks.documentFindById,
  updateOne: mocks.documentUpdateOne,
} }));
vi.mock('@/lib/integration-outbox', () => ({
  processDocumentIntegrationEvents: mocks.documentOutbox,
  processAuditIntegrationEvent: mocks.auditOutbox,
}));

import { writeAuditEvent } from '@/lib/audit';

describe('audit integration nudges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditFindOne.mockReturnValue({ sort: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    }) });
    mocks.auditCreate.mockResolvedValue({ _id: 'audit-1' });
    mocks.documentFindById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    mocks.documentOutbox.mockResolvedValue({ acknowledged: 1, retrying: 0 });
    mocks.auditOutbox.mockResolvedValue({ acknowledged: 1, retrying: 0 });
  });

  it('reports audit persistence failures to the caller', async () => {
    mocks.auditCreate.mockRejectedValue(new Error('audit database unavailable'));

    await expect(writeAuditEvent({
      userId: 'user-1',
      orgId: 'org-1',
      documentId: 'document-1',
      action: 'document_finalized',
      metadata: { version: 2 },
    })).rejects.toThrow('audit database unavailable');

    expect(mocks.documentOutbox).not.toHaveBeenCalled();
    expect(mocks.auditOutbox).not.toHaveBeenCalled();
  });

  it('nudges persisted source records instead of constructing an ephemeral event', async () => {
    await writeAuditEvent({ orgId: 'org-1', documentId: 'doc-1', action: 'document_finalized' });
    expect(mocks.documentOutbox).toHaveBeenCalledWith('doc-1');
    expect(mocks.auditOutbox).toHaveBeenCalledWith('audit-1');
  });
  it('links a staged lifecycle source event before its audit row is nudged', async () => {
    const select = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({
      integrationOutbox: {
        signing: {
          eventId: 'evt_signing',
          event: 'recipient_signed',
          createdAt: new Date('2026-10-18T00:00:00.000Z'),
          data: { auditLogId: null, documentId: 'doc-1', metadata: { recipientId: 'recipient-1' } },
        },
      },
    }) });
    mocks.documentFindById.mockReturnValue({ select });
    const exec = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    mocks.documentUpdateOne.mockReturnValue({ exec });

    await writeAuditEvent({ orgId: 'org-1', documentId: 'doc-1', action: 'recipient_signed' });

    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ integrationPending: false }));
    expect(mocks.documentUpdateOne).toHaveBeenCalledWith(
      { _id: 'doc-1', 'integrationOutbox.signing.eventId': 'evt_signing' },
      { $set: { 'integrationOutbox.signing.data.auditLogId': 'audit-1' } },
      { timestamps: false }
    );
    expect(mocks.documentOutbox).toHaveBeenCalledWith('doc-1');
  });
  it('waits for both independent nudges even when one fails', async () => {
    mocks.documentOutbox.mockRejectedValueOnce(new Error('temporary document lookup failure'));
    let release!: () => void;
    let started!: () => void;
    const start = new Promise<void>((resolve) => { started = resolve; });
    mocks.auditOutbox.mockImplementationOnce(() => { started(); return new Promise<void>((resolve) => { release = resolve; }); });
    const complete = vi.fn();
    const writing = writeAuditEvent({ orgId: 'org-1', documentId: 'doc-1', action: 'document_finalized' }).then(complete);
    await start;
    await setImmediate();
    expect(complete).not.toHaveBeenCalled();
    release();
    await writing;
    expect(complete).toHaveBeenCalledOnce();
  });
  it('does not look up a document for workspace-only audit events', async () => {
    await writeAuditEvent({ orgId: 'org-1', action: 'workspace.updated' });
    expect(mocks.documentOutbox).not.toHaveBeenCalled();
    expect(mocks.auditOutbox).toHaveBeenCalledWith('audit-1');
  });
});
