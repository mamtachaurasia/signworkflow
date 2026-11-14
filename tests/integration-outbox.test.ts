import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setImmediate } from 'node:timers/promises';

const mocks = vi.hoisted(() => ({ webhooks: vi.fn(), personal: vi.fn(), workspace: vi.fn() }));
vi.mock('@/utils/db', () => ({ default: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({ enqueueWebhookEvent: mocks.webhooks }));
vi.mock('@/lib/cloud/auto-export', () => ({ enqueueAutomaticCloudExports: mocks.personal }));
vi.mock('@/lib/cloud/workspace-archive', () => ({ enqueueWorkspaceCloudArchives: mocks.workspace }));

import DocumentModel from '@/models/Document';
import AuditLogModel from '@/models/AuditLog';
import CloudExportJobModel from '@/models/CloudExportJob';
import { writeAuditEvent } from '@/lib/audit';
import { documentIntegrationUpdate, stageDocumentIntegrationEvent } from '@/lib/integration-outbox-event';
import { processDocumentIntegrationEvents, processPendingIntegrationEvents } from '@/lib/integration-outbox';
import { isDuplicateKeyOnly } from '@/lib/mongo-duplicate-only';

let database: MongoMemoryServer;
const orgId = new mongoose.Types.ObjectId();

async function createDocument(event = 'document_finalized') {
  const document = new DocumentModel({ orgId, userId: 'owner', documentName: 'Agreement', originalFileName: 'agreement.pdf', status: 'completed' });
  stageDocumentIntegrationEvent(document, { event, metadata: { version: 1, finalHash: 'pdf-hash' } });
  await document.save();
  return document;
}

describe('durable integration intent', () => {
  beforeAll(async () => {
    database = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    await mongoose.connect(database.getUri());
  });
  afterAll(async () => { await mongoose.disconnect(); await database?.stop(); });
  beforeEach(async () => {
    vi.restoreAllMocks();
    mocks.webhooks.mockReset().mockResolvedValue([]);
    mocks.personal.mockReset().mockResolvedValue([]);
    mocks.workspace.mockReset().mockResolvedValue([]);
    await DocumentModel.deleteMany({});
    await AuditLogModel.deleteMany({});
  });

  it('recovers an event saved with the document when no audit call ever runs', async () => {
    const document = await createDocument();
    expect(await AuditLogModel.countDocuments()).toBe(0);
    expect((await DocumentModel.findById(document._id).lean()).integrationOutbox).toBeUndefined();

    const result = await processPendingIntegrationEvents();

    expect(result).toEqual({ acknowledged: 1, retrying: 0 });
    expect(mocks.webhooks).toHaveBeenCalledWith(expect.objectContaining({
      orgId, event: 'document_finalized', eventId: expect.stringMatching(/^evt_/),
      data: { auditLogId: null, documentId: String(document._id), metadata: { version: 1, finalHash: 'pdf-hash' } },
    }));
    expect(mocks.personal).toHaveBeenCalledOnce();
    expect(mocks.workspace).toHaveBeenCalledOnce();
    expect((await DocumentModel.findById(document._id).select('+integrationOutbox').lean()).integrationOutbox ?? {}).toEqual({});
  });

  it('stores intent in an atomic update without a second database insert', async () => {
    const document = await DocumentModel.create({ orgId, userId: 'owner', documentName: 'Draft', originalFileName: 'draft.pdf' });
    await DocumentModel.updateOne({ _id: document._id }, { $set: {
      status: 'voided', ...documentIntegrationUpdate({ orgId, documentId: document._id, event: 'document_voided' }),
    } });
    await processPendingIntegrationEvents();
    expect(mocks.webhooks).toHaveBeenCalledWith(expect.objectContaining({ event: 'document_voided' }));
  });

  it('persists create-route dotted intent paths together with the new document', async () => {
    const id = new mongoose.Types.ObjectId();
    await DocumentModel.create({ _id: id, orgId, userId: 'owner', documentName: 'New', originalFileName: 'new.pdf',
      ...documentIntegrationUpdate({ orgId, documentId: id, event: 'document_created' }),
    });
    await processPendingIntegrationEvents();
    expect(mocks.webhooks).toHaveBeenCalledWith(expect.objectContaining({ event: 'document_created',
      data: { auditLogId: null, documentId: String(id), metadata: {} },
    }));
  });

  it('preserves other pending events when two stale readers stage different events', async () => {
    const document = await createDocument('document_created');
    const first = await DocumentModel.findById(document._id);
    const second = await DocumentModel.findById(document._id);
    stageDocumentIntegrationEvent(first, { event: 'document_prepared' });
    stageDocumentIntegrationEvent(second, { event: 'document_voided' });
    await first.save();
    await second.save();
    const stored = await DocumentModel.findById(document._id).select('+integrationOutbox').lean();
    expect(Object.values(stored.integrationOutbox).map((entry) => (entry as { event: string }).event).sort())
      .toEqual(['document_created', 'document_prepared', 'document_voided']);
  });

  it('retains failed fan-out and retries with the same event identity', async () => {
    const document = await createDocument();
    mocks.personal.mockRejectedValueOnce(new Error('temporary queue insert failure'));
    expect(await processDocumentIntegrationEvents(document._id)).toEqual({ acknowledged: 0, retrying: 1 });
    expect(await processDocumentIntegrationEvents(document._id)).toEqual({ acknowledged: 1, retrying: 0 });
    expect(mocks.webhooks.mock.calls[0][0].eventId).toBe(mocks.webhooks.mock.calls[1][0].eventId);
    expect(mocks.workspace).toHaveBeenCalledTimes(2);
  });

  it('retains the source if the acknowledgement fails after destinations accept it', async () => {
    const document = await createDocument();
    const update = DocumentModel.updateOne.bind(DocumentModel);
    let failAck = true;
    vi.spyOn(DocumentModel, 'updateOne').mockImplementation((filter: unknown, change: Record<string, unknown>, options: unknown) => {
      if (failAck && change.$unset) {
        failAck = false;
        return { exec: async () => { throw new Error('lost acknowledgement'); } };
      }
      return update(filter, change, options);
    });
    expect(await processDocumentIntegrationEvents(document._id)).toEqual({ acknowledged: 0, retrying: 1 });
    expect(await processDocumentIntegrationEvents(document._id)).toEqual({ acknowledged: 1, retrying: 0 });
    expect(mocks.webhooks.mock.calls[0][0]).toEqual(mocks.webhooks.mock.calls[1][0]);
  });

  it('waits for the other archive queue after one rejects', async () => {
    const document = await createDocument();
    let release!: () => void;
    let started!: () => void;
    const start = new Promise<void>((resolve) => { started = resolve; });
    mocks.personal.mockRejectedValueOnce(new Error('personal queue failed'));
    mocks.workspace.mockImplementationOnce(() => { started(); return new Promise<void>((resolve) => { release = resolve; }); });
    const complete = vi.fn();
    const pending = processDocumentIntegrationEvents(document._id).then(complete);
    await start;
    await setImmediate();
    expect(complete).not.toHaveBeenCalled();
    release();
    await pending;
    expect(complete).toHaveBeenCalledWith({ acknowledged: 0, retrying: 1 });
  });

  it('recovers non-document events from their durable audit row', async () => {
    const audit = await AuditLogModel.create({ orgId, action: 'cloud.export.completed', metadata: { provider: 'google_drive' } });
    await processPendingIntegrationEvents();
    expect(mocks.webhooks).toHaveBeenCalledWith(expect.objectContaining({ eventId: `evt_audit_${audit._id}` }));
    expect((await AuditLogModel.findById(audit._id).select('+integrationPending').lean())?.integrationPending).toBe(false);
  });

  it('delivers a direct lifecycle audit with the auditLogId promised by the webhook contract', async () => {
    const audit = await AuditLogModel.create({ orgId, action: 'document_finalized', documentId: new mongoose.Types.ObjectId() });

    await processPendingIntegrationEvents();

    expect(mocks.webhooks).toHaveBeenCalledWith(expect.objectContaining({
      event: 'document_finalized',
      eventId: `evt_audit_${audit._id}`,
      data: expect.objectContaining({ auditLogId: String(audit._id) }),
    }));
  });

  it('adds the persisted auditLogId to a document source event before fan-out', async () => {
    const document = await createDocument('document_finalized');

    await writeAuditEvent({
      orgId,
      userId: new mongoose.Types.ObjectId(),
      documentId: document._id,
      action: 'document_finalized',
      metadata: { version: 1, finalHash: 'pdf-hash' },
    });

    const audit = await AuditLogModel.findOne({ documentId: document._id, action: 'document_finalized' }).lean();
    expect(mocks.webhooks).toHaveBeenCalledWith(expect.objectContaining({
      event: 'document_finalized',
      data: expect.objectContaining({ auditLogId: String(audit?._id) }),
    }));
    expect((await AuditLogModel.findById(audit?._id).select('+integrationPending').lean())?.integrationPending).toBe(false);
  });

  it('preserves an auditLogId from a job-owned event in its webhook payload', async () => {
    const documentId = new mongoose.Types.ObjectId();
    const job = await CloudExportJobModel.create({
      orgId,
      userId: new mongoose.Types.ObjectId(),
      ruleId: new mongoose.Types.ObjectId(),
      documentId,
      provider: 'google_drive',
      ...documentIntegrationUpdate({
        orgId,
        documentId,
        event: 'cloud.export.completed',
        metadata: { automatic: true, provider: 'google_drive', providerFileId: 'provider-file-1' },
      }),
    });
    const stored = await CloudExportJobModel.findById(job._id).select('+integrationOutbox').lean();
    const [outboxKey] = Object.keys(stored?.integrationOutbox ?? {});
    await CloudExportJobModel.updateOne({ _id: job._id }, {
      $set: { [`integrationOutbox.${outboxKey}.data.auditLogId`]: 'audit-job-1' },
    });

    await processPendingIntegrationEvents();

    expect(mocks.webhooks).toHaveBeenCalledWith(expect.objectContaining({
      event: 'cloud.export.completed',
      data: expect.objectContaining({ auditLogId: 'audit-job-1', documentId: String(documentId) }),
    }));
  });
});

describe('partial batch failures', () => {
  it('acknowledges only duplicate-only failures, never mixed write errors', () => {
    expect(isDuplicateKeyOnly({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyOnly({ code: 11000, writeErrors: [{ code: 11000 }, { code: 121 }] })).toBe(false);
    expect(isDuplicateKeyOnly({ code: 11000, writeConcernError: {} })).toBe(false);
    expect(isDuplicateKeyOnly({ code: 11000, mongoose: { validationErrors: [new Error('invalid')] } })).toBe(false);
  });
});
