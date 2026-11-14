import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  documentFindOne: vi.fn(),
  applySigningAction: vi.fn(),
  computeRetentionFields: vi.fn(),
  applyRetentionToDocument: vi.fn(),
  writeAuditEvent: vi.fn(),
  createDocumentEventNotification: vi.fn(),
  userFindById: vi.fn(),
  getEffectiveUserSettingsByUserId: vi.fn(),
  stageNextSigningEmails: vi.fn(),
  processSigningEmailJobs: vi.fn(),
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/models/Document', () => ({ default: { findOne: mocks.documentFindOne } }));
vi.mock('@/models/Users', () => ({ default: { findById: mocks.userFindById } }));
vi.mock('@/lib/signing-token', () => ({
  buildSigningTokenLookup: vi.fn(() => ({ token: 'token' })),
  recipientMatchesSigningToken: vi.fn(() => true),
}));
vi.mock('@/lib/signing-utils', () => ({
  getLatestPreparedVersion: vi.fn(() => null),
  isRecipientTurn: vi.fn(() => true),
  normalizeIp: vi.fn(() => ({ ip: '203.0.113.10', ipUnavailableReason: undefined })),
}));
vi.mock('@/lib/signing-actions', () => ({ applySigningAction: mocks.applySigningAction }));
vi.mock('@/lib/retention', () => ({
  computeRetentionFields: mocks.computeRetentionFields,
  applyRetentionToDocument: mocks.applyRetentionToDocument,
}));
vi.mock('@/lib/audit', () => ({ writeAuditEvent: mocks.writeAuditEvent }));
vi.mock('@/lib/notifications', () => ({
  createDocumentEventNotification: mocks.createDocumentEventNotification,
}));
vi.mock('@/lib/org-settings-server', () => ({
  getEffectiveUserSettingsByUserId: mocks.getEffectiveUserSettingsByUserId,
}));
vi.mock('@/lib/esign-disclosure', () => ({ hasAcceptedEsignDisclosure: vi.fn(() => true) }));
vi.mock('@/lib/email', () => ({
  sendOwnerDocumentEventEmail: vi.fn(),
  sendSigningRejectedEmail: vi.fn(),
  sendSigningRequestEmail: vi.fn(),
}));
vi.mock('@/lib/signing-email-jobs', () => ({
  stageNextSigningEmails: mocks.stageNextSigningEmails,
  processSigningEmailJobs: mocks.processSigningEmailJobs,
}));

import { POST } from '@/app/api/signedDocument/route';

describe('approver finalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.computeRetentionFields.mockResolvedValue({});
    mocks.writeAuditEvent.mockResolvedValue(undefined);
    mocks.createDocumentEventNotification.mockResolvedValue(undefined);
    mocks.getEffectiveUserSettingsByUserId.mockResolvedValue({
      emailDigest: 'daily',
      notifyOnDeclined: true,
      notifyOnSigned: true,
      notifyOnCompleted: true,
    });
    mocks.processSigningEmailJobs.mockResolvedValue([]);
    mocks.userFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
  });

  it('emits document_finalized when the last approver completes the workflow', async () => {
    const recipient = {
      id: 'approver-1',
      email: 'approver@example.com',
      name: 'Approver',
      role: 'approver',
      status: 'sent',
      order: 2,
      consent: { accepted: true },
    };
    const document = {
      _id: 'document-1',
      userId: 'owner-1',
      orgId: 'org-1',
      documentName: 'Agreement',
      currentVersion: 2,
      status: 'in_progress',
      signingMode: 'parallel',
      recipients: [recipient],
      versions: [{ version: 2, label: 'signed_final', hash: 'final-hash' }],
      signingEvents: [],
      deletedAt: null,
      toObject: vi.fn(() => ({})),
      set: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.applySigningAction.mockImplementation(() => {
      recipient.status = 'approved';
      document.status = 'completed';
      return { nextRecipientsToNotify: [] };
    });

    const response = await POST(new NextRequest('https://signworkflow.com/api/signedDocument', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vitest',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ token: 'token', action: 'approved' }),
    }));

    expect(response.status).toBe(200);
    expect(document.set).toHaveBeenCalledWith(expect.stringMatching(/^integrationOutbox\./), expect.objectContaining({
      event: 'document_finalized', data: expect.objectContaining({ documentId: 'document-1' }),
    }));
    expect(document.set.mock.invocationCallOrder[0]).toBeLessThan(document.save.mock.invocationCallOrder[0]);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'owner-1',
      orgId: 'org-1',
      documentId: 'document-1',
      actor: 'approver-1',
      action: 'document_finalized',
      metadata: {
        version: 2,
        finalHash: 'final-hash',
        completionAction: 'approved',
      },
    }));
  });

  it('stages a sequential successor before a later audit write can fail', async () => {
    const recipient = {
      id: 'approver-1', email: 'approver@example.com', name: 'Approver', role: 'approver', status: 'sent', order: 1,
      consent: { accepted: true },
    };
    const nextRecipient = {
      id: 'approver-2', email: 'next@example.com', name: 'Next approver', role: 'approver', status: 'sent', order: 2,
    };
    const document = {
      _id: 'document-1', userId: 'owner-1', orgId: 'org-1', documentName: 'Agreement', currentVersion: 2,
      status: 'in_progress', signingMode: 'sequential', recipients: [recipient, nextRecipient], versions: [], signingEvents: [],
      deletedAt: null, toObject: vi.fn(() => ({})), set: vi.fn(), save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.applySigningAction.mockImplementation(() => {
      document.status = 'completed';
      return { nextRecipientsToNotify: [{ recipient: nextRecipient, signingToken: 'next-token' }] };
    });
    mocks.writeAuditEvent.mockRejectedValueOnce(new Error('audit storage unavailable'));

    const response = await POST(new NextRequest('https://signworkflow.com/api/signedDocument', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'token', action: 'approved' }),
    }));

    expect(response.status).toBe(500);
    expect(mocks.stageNextSigningEmails).toHaveBeenCalledWith(document, expect.any(Array), expect.any(Date));
    expect(mocks.stageNextSigningEmails.mock.invocationCallOrder[0]).toBeLessThan(document.save.mock.invocationCallOrder[0]);
    expect(document.save).toHaveBeenCalledOnce();
    expect(mocks.processSigningEmailJobs).not.toHaveBeenCalled();
  });
});
