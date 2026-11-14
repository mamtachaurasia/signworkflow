import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';
import DocumentModel, { IDocumentRecipient, ISigningEvent, IVersionDoc } from '@/models/Document';
import SignatureModel from '@/models/Signature';
import AuditLogModel from '@/models/AuditLog';
import { connectTestDb, disconnectTestDb, resetTestDb } from '../helpers/db';

vi.mock('@/lib/s3', () => ({
  getObjectStream: vi.fn(async () => Readable.from([Buffer.from('%PDF-1.4 base')])),
  putObjectStream: vi.fn(async () => undefined),
  getRegion: vi.fn(() => 'us-east-1'),
  getStorageBucketName: vi.fn(() => 'test-bucket'),
  normalizeStorageProvider: vi.fn(() => 's3'),
}));

vi.mock('@/lib/pdf', () => ({
  mergeFieldsIntoPdfServer: vi.fn(async () => Buffer.from('%PDF-1.4 merged')),
}));

vi.mock('@/lib/email', () => ({
  sendSigningRequestEmail: vi.fn(async () => undefined),
}));

import { POST as signDocument } from '@/app/api/sign-document/route';

type RecipientSeed = Partial<IDocumentRecipient>;
type EventFieldSeed = Record<string, unknown>;

function buildBaseVersions(fieldOverrides?: EventFieldSeed) {
  const baseStorage = {
    provider: 's3',
    bucket: 'test-bucket',
    region: 'us-east-1',
    key: 'original.pdf',
    url: 's3://test-bucket/original.pdf',
  };

  const preparedStorage = {
    provider: 's3',
    bucket: 'test-bucket',
    region: 'us-east-1',
    key: 'prepared.pdf',
    url: 's3://test-bucket/prepared.pdf',
  };

  const now = new Date();
  return [
    {
      version: 0,
      label: 'original',
      storage: baseStorage,
      hash: 'hash-original',
      size: 10,
      mimeType: 'application/pdf',
      locked: true,
      documentName: 'Contract v1',
      status: 'locked',
      createdAt: now,
      updatedAt: now,
    },
    {
      version: 1,
      label: 'prepared',
      derivedFromVersion: 0,
      storage: preparedStorage,
      hash: 'hash-prepared',
      size: 10,
      mimeType: 'application/pdf',
      locked: true,
      fields: [
        {
          id: 'f1',
          type: 'text',
          x: 10,
          y: 20,
          width: 120,
          height: 24,
          pageNumber: 1,
          recipientId: 'r1',
          fieldOwner: 'recipients',
          required: true,
          ...fieldOverrides,
        },
      ],
      documentName: 'Contract v1',
      status: 'locked',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function buildRecipients(overrides?: RecipientSeed[]) {
  const base = [
    {
      id: 'r1',
      email: 'r1@example.com',
      name: 'Signer One',
      role: 'signer',
      order: 1,
      signingToken: 'token-r1',
      status: 'sent',
      sendReminders: false,
      consent: {
        esignDisclosureAccepted: true,
        esignDisclosureAcceptedAt: new Date('2026-04-08T00:00:00.000Z'),
        esignDisclosureVersion: '2026-04-08',
        esignDisclosureMethod: 'checkbox',
      },
    },
    {
      id: 'r2',
      email: 'r2@example.com',
      name: 'Signer Two',
      role: 'signer',
      order: 2,
      signingToken: 'token-r2',
      status: 'pending',
      sendReminders: false,
      consent: {
        esignDisclosureAccepted: true,
        esignDisclosureAcceptedAt: new Date('2026-04-08T00:00:00.000Z'),
        esignDisclosureVersion: '2026-04-08',
        esignDisclosureMethod: 'checkbox',
      },
    },
  ];
  if (!overrides) return base;
  return base.map((rec, idx) => ({ ...rec, ...overrides[idx] }));
}

async function seedDocument(args: {
  signingMode: 'sequential' | 'parallel';
  recipients?: RecipientSeed[];
  fieldOverrides?: EventFieldSeed;
}) {
  return DocumentModel.create({
    userId: '507f1f77bcf86cd799439011',
    documentName: 'Contract v1',
    originalFileName: 'contract.pdf',
    currentVersion: 1,
    signingMode: args.signingMode,
    versions: buildBaseVersions(args.fieldOverrides),
    recipients: buildRecipients(args.recipients),
    status: 'sent',
  });
}

describe('signing lifecycle (integration)', () => {
  beforeAll(async () => {
    process.env.S3_BUCKET_NAME = 'test-bucket';
    await connectTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('sequential: first signer creates signed version and advances next recipient', async () => {
    const document = await seedDocument({ signingMode: 'sequential' });

    const req = new NextRequest('http://localhost/api/sign-document', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
        'user-agent': 'vitest',
      },
      body: JSON.stringify({
        token: 'token-r1',
        fields: [{ id: 'f1', value: 'John Doe' }],
      }),
    });

    const res = await signDocument(req);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.success).toBe(true);
    expect(await AuditLogModel.countDocuments({ documentId: document._id, action: 'recipient_signed' })).toBe(1);

    const updated = await DocumentModel.findById(document._id).lean();
    expect(updated?.currentVersion).toBe(2);
    expect(updated?.status).toBe('in_progress');

    const signedVersion = updated?.versions.find((v: IVersionDoc) => v.version === 2);
    expect(signedVersion?.label).toBe('signed_by_order_1');
    expect(signedVersion?.derivedFromVersion).toBe(1);
    expect(signedVersion?.signedBy).toEqual(['r1']);
    expect(signedVersion?.fields).toBeUndefined();

    const r1 = updated?.recipients.find((r: IDocumentRecipient) => r.id === 'r1');
    const r2 = updated?.recipients.find((r: IDocumentRecipient) => r.id === 'r2');
    expect(r1?.status).toBe('signed');
    expect(r1?.signedVersion).toBe(2);
    expect(r2?.status).toBe('sent');

    const signedEvent = updated?.signingEvents.find(
      (e: ISigningEvent) => e.action === 'signed' && e.recipientId === 'r1'
    );
    expect(signedEvent?.version).toBe(2);
    expect(signedEvent?.baseVersion).toBe(1);
    expect(signedEvent?.fields?.[0]?.fieldId).toBe('f1');

    const sentEvents = updated?.signingEvents.filter((e: ISigningEvent) => e.action === 'sent');
    expect(sentEvents?.length).toBe(1);
    expect(sentEvents?.[0]?.recipientId).toBe('r2');

    const signatures = await SignatureModel.find({
      documentId: document._id,
      recipientId: 'r1',
    }).lean();
    expect(signatures).toHaveLength(1);
    expect(signatures[0]?.fieldValue).toBe('John Doe');
  });

  it('sequential: blocks out-of-turn signer', async () => {
    const document = await seedDocument({ signingMode: 'sequential' });

    const req = new NextRequest('http://localhost/api/sign-document', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'token-r2',
        fields: [{ id: 'f1', value: 'Should fail' }],
      }),
    });

    const res = await signDocument(req);
    expect(res.status).toBe(403);

    const updated = await DocumentModel.findById(document._id).lean();
    expect(updated?.currentVersion).toBe(1);
    expect(updated?.versions.find((v: IVersionDoc) => v.label?.startsWith('signed'))).toBeUndefined();
  });

  it('parallel: allows any signer and does not advance others', async () => {
    const document = await seedDocument({
      signingMode: 'parallel',
      recipients: [
        { status: 'sent' },
        { status: 'sent' },
      ],
      fieldOverrides: { recipientId: 'r2' },
    });

    const req = new NextRequest('http://localhost/api/sign-document', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.20',
      },
      body: JSON.stringify({
        token: 'token-r2',
        fields: [{ id: 'f1', value: 'Parallel Sign' }],
      }),
    });

    const res = await signDocument(req);
    expect(res.status).toBe(200);

    const updated = await DocumentModel.findById(document._id).lean();
    expect(updated?.status).toBe('in_progress');

    const r1 = updated?.recipients.find((r: IDocumentRecipient) => r.id === 'r1');
    const r2 = updated?.recipients.find((r: IDocumentRecipient) => r.id === 'r2');
    expect(r1?.status).toBe('sent');
    expect(r2?.status).toBe('signed');

    const signedVersion = updated?.versions.find((v: IVersionDoc) => v.version === 2);
    expect(signedVersion?.label).toBe('signed_by_order_2');

    const sentEvents = updated?.signingEvents.filter((e: ISigningEvent) => e.action === 'sent');
    expect(sentEvents?.length).toBe(0);
  });

  it('blocks signing until the recipient accepts the e-sign disclosure', async () => {
    const document = await seedDocument({
      signingMode: 'parallel',
      recipients: [
        {
          status: 'sent',
          consent: {
            esignDisclosureAccepted: false,
          },
        },
        { status: 'sent' },
      ],
    });

    const req = new NextRequest('http://localhost/api/sign-document', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: 'token-r1',
        fields: [{ id: 'f1', value: 'John Doe' }],
      }),
    });

    const res = await signDocument(req);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.reason).toBe('esign_consent_required');

    const updated = await DocumentModel.findById(document._id).lean();
    expect(updated?.currentVersion).toBe(1);
  });

  it('honors read-only prepared field value over incoming recipient edits', async () => {
    const document = await seedDocument({
      signingMode: 'parallel',
      recipients: [{ status: 'sent' }, { status: 'sent' }],
      fieldOverrides: {
        recipientId: 'r1',
        value: 'Locked by sender',
        settings: {
          readOnly: true,
        },
      },
    });

    const req = new NextRequest('http://localhost/api/sign-document', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: 'token-r1',
        fields: [{ id: 'f1', value: 'Recipient tried changing it' }],
      }),
    });

    const res = await signDocument(req);
    expect(res.status).toBe(200);

    const signatures = await SignatureModel.find({
      documentId: document._id,
      recipientId: 'r1',
      fieldId: 'f1',
    }).lean();

    expect(signatures).toHaveLength(1);
    expect(signatures[0]?.fieldValue).toBe('Locked by sender');
  });
});
