import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { writeAuditEvent } from '@/lib/audit';
import AuditLogModel from '@/models/AuditLog';
import CloudExportJobModel from '@/models/CloudExportJob';
import CloudExportRuleModel from '@/models/CloudExportRule';
import WebhookDeliveryModel from '@/models/WebhookDelivery';
import WebhookEndpointModel from '@/models/WebhookEndpoint';
import { connectTestDb, disconnectTestDb, resetTestDb } from '../helpers/db';

describe('developer integration completion lifecycle', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('turns a finalized audit event into durable webhook and cloud-export jobs', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const documentId = new mongoose.Types.ObjectId();
    const endpoint = await WebhookEndpointModel.create({
      orgId,
      createdBy: userId,
      url: 'https://hooks.example.test/signworkflow',
      secretHash: 'hash',
      secretEncrypted: 'encrypted',
      secretPrefix: 'whsec_example',
      events: ['document_finalized'],
      active: true,
    });
    const rule = await CloudExportRuleModel.create({
      orgId,
      userId,
      provider: 'google_drive',
      enabled: true,
      destinationFolder: 'Signed Contracts',
    });

    await writeAuditEvent({
      userId,
      orgId,
      documentId,
      actor: 'signer-1',
      action: 'document_finalized',
      metadata: { version: 2, finalHash: 'pdf-hash' },
    });

    const audit = await AuditLogModel.findOne({ orgId, documentId, action: 'document_finalized' }).lean();
    const webhook = await WebhookDeliveryModel.findOne({ orgId, endpointId: endpoint._id }).lean();
    const cloudJob = await CloudExportJobModel.findOne({ orgId, ruleId: rule._id, documentId }).lean();

    expect(audit).toBeTruthy();
    expect(webhook).toEqual(expect.objectContaining({
      event: 'document_finalized',
      status: 'pending',
      attempts: 0,
    }));
    expect(webhook?.payload).toEqual(expect.objectContaining({
      type: 'document_finalized',
      data: expect.objectContaining({ documentId: String(documentId) }),
    }));
    expect(cloudJob).toEqual(expect.objectContaining({
      provider: 'google_drive',
      destinationFolder: 'Signed Contracts',
      status: 'pending',
      attempts: 0,
    }));
  });
});
