import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  authenticateRequest: vi.fn(),
  getOrgContextForUser: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
  getExpiredTrialWriteGuard: vi.fn(),
  getEffectiveUserSettingsByUserId: vi.fn(),
  connectDB: vi.fn(),
  documentFindOne: vi.fn(),
  documentUpdateOne: vi.fn(),
  getLatestPreparedVersion: vi.fn(),
  issueSigningToken: vi.fn(),
  processSigningEmailJobs: vi.fn(),
  getSigningEmailDeliverySummary: vi.fn(),
  createRecipientDocumentSentNotifications: vi.fn(),
  writeAuditEvent: vi.fn(),
  updateDocumentStatus: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'vitest'),
  isSecureRequest: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
  validateCsrfToken: vi.fn(() => true),
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

vi.mock('@/lib/signing-email-jobs', () => ({
  createSigningEmailDelivery: (recipientId: string) => ({ recipientId, status: 'queued', tokenEncrypted: 'encrypted', attempts: 0, nextAttemptAt: new Date() }),
  processSigningEmailJobs: mocks.processSigningEmailJobs,
  getSigningEmailDeliverySummary: mocks.getSigningEmailDeliverySummary,
}));

vi.mock('@/lib/signing-token', () => ({
  issueSigningToken: mocks.issueSigningToken,
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

vi.mock('@/lib/signing-utils', () => ({
  buildEventClient: vi.fn(),
  buildEventConsent: vi.fn(),
  buildEventGeo: vi.fn(),
  getLatestPreparedVersion: mocks.getLatestPreparedVersion,
  getNextSequentialOrder: vi.fn(),
  normalizeIp: vi.fn(() => ({ ip: null, ipUnavailableReason: 'test' })),
}));

vi.mock('@/lib/s3', () => ({
  copyObject: vi.fn(),
  getRegion: vi.fn(() => 'ap-south-1'),
}));

vi.mock('@/lib/statusLogic', () => ({
  updateDocumentStatus: mocks.updateDocumentStatus,
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

vi.mock('@/middleware/authMiddleware', () => ({
  authenticateRequest: mocks.authenticateRequest,
  enforceMfaForSensitiveAction: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: {
    findOne: mocks.documentFindOne,
    updateOne: mocks.documentUpdateOne,
  },
}));

vi.mock('@/models/Team', () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/orgs', () => ({
  getOrgContextForUser: mocks.getOrgContextForUser,
  getRequestedOrgId: vi.fn(() => null),
}));

vi.mock('@/lib/org-settings-server', () => ({
  getEffectiveUserSettingsByUserId: mocks.getEffectiveUserSettingsByUserId,
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature,
  getExpiredTrialWriteGuard: mocks.getExpiredTrialWriteGuard,
}));

vi.mock('@/lib/role-utils', () => ({
  isAdminRole: vi.fn(() => false),
}));

vi.mock('@/lib/workspace-scope', () => ({
  buildWorkspaceOwnedFilter: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  createRecipientDocumentSentNotifications: mocks.createRecipientDocumentSentNotifications,
}));

import { POST } from '@/app/api/documents/send-for-signing/route';

const VALID_RECIPIENT = {
  id: 'recipient-1',
  name: 'Asha',
  email: 'asha@example.com',
  role: 'signer' as const,
  order: 1,
};

const VALID_SIGNER_FIELD = {
  id: 'signature-1',
  type: 'signature' as const,
  x: 10,
  y: 10,
  width: 100,
  height: 40,
  pageNumber: 1,
  recipientId: 'recipient-1',
  required: true,
  fieldOwner: 'recipients' as const,
};

function signingRequest(fields: unknown[] = [VALID_SIGNER_FIELD], includeFields = true) {
  const body: Record<string, unknown> = {
    documentId: '507f1f77bcf86cd799439012',
    recipients: [VALID_RECIPIENT],
    signingMode: 'parallel',
  };
  if (includeFields) body.fields = fields;

  return new NextRequest('https://example.com/api/documents/send-for-signing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sendableDocument() {
  const preparedVersion = {
    version: 1,
    label: 'prepared',
    storage: { provider: 's3', bucket: 'documents-test', key: 'prepared.pdf' },
    fields: [VALID_SIGNER_FIELD],
    locked: false,
    status: 'draft',
  };
  const document = {
    _id: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439011',
    orgId: 'org-1',
    documentName: 'NDA',
    status: 'draft',
    signingMode: 'parallel',
    currentVersion: 1,
    versions: [preparedVersion],
    recipients: [],
    signingEvents: [],
    templatePreparation: { completed: true, fieldsNeedReview: false },
    toObject: vi.fn(),
    save: vi.fn(async () => undefined),
    set: vi.fn(),
  };
  document.toObject.mockReturnValue(document);
  return document;
}

describe('send-for-signing route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true });
    mocks.authenticateRequest.mockResolvedValue({
      ok: true,
      context: { user: { _id: '507f1f77bcf86cd799439011', email: 'owner@example.com' } },
    });
    mocks.getOrgContextForUser.mockResolvedValue({
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getExpiredTrialWriteGuard.mockResolvedValue({ allowed: true });
    mocks.getEffectiveUserSettingsByUserId.mockResolvedValue({});
    mocks.issueSigningToken.mockReturnValue({ token: 'raw-signing-token', tokenHash: 'token-hash' });
    mocks.processSigningEmailJobs.mockResolvedValue([]);
    mocks.getSigningEmailDeliverySummary.mockResolvedValue({ failures: [], pending: 0, completed: 1 });
    mocks.createRecipientDocumentSentNotifications.mockResolvedValue(undefined);
    mocks.writeAuditEvent.mockResolvedValue(undefined);
    mocks.documentUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it('rejects duplicate recipient email addresses before document mutation', async () => {
    const req = new NextRequest('https://example.com/api/documents/send-for-signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: '507f1f77bcf86cd799439012',
        recipients: [
          { id: 'recipient-1', name: 'Asha', email: 'ASHA@example.com', role: 'signer' },
          { id: 'recipient-2', name: 'Asha CC', email: 'asha@example.com', role: 'viewer' },
        ],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.message).toMatch(/email addresses must be unique/i);
    expect(mocks.connectDB).not.toHaveBeenCalled();
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
  });

  it('rejects sending when any signer has no required assigned field', async () => {
    const req = new NextRequest('https://example.com/api/documents/send-for-signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: '507f1f77bcf86cd799439012',
        recipients: [
          { id: 'recipient-1', name: 'Asha', email: 'asha@example.com', role: 'signer' },
          { id: 'recipient-2', name: 'Ravi', email: 'ravi@example.com', role: 'signer' },
        ],
        fields: [
          {
            id: 'signature-1',
            type: 'signature',
            x: 10,
            y: 10,
            width: 100,
            height: 40,
            recipientId: 'recipient-1',
            required: true,
            fieldOwner: 'recipients',
          },
        ],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.message).toMatch(/required field to every signer/i);
    expect(payload.message).toContain('Ravi');
    expect(mocks.connectDB).not.toHaveBeenCalled();
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
  });

  it('does not treat an optional field as a signer assignment', async () => {
    const req = new NextRequest('https://example.com/api/documents/send-for-signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: '507f1f77bcf86cd799439012',
        recipients: [
          { id: 'recipient-1', name: 'Asha', email: 'asha@example.com', role: 'signer' },
        ],
        fields: [
          {
            id: 'text-1', type: 'text', x: 10, y: 10, width: 100, height: 40,
            recipientId: 'recipient-1', required: false, fieldOwner: 'recipients',
          },
        ],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.message).toMatch(/required field to every signer/i);
    expect(mocks.connectDB).not.toHaveBeenCalled();
  });

  it('requires complete payment details when payment is enabled', async () => {
    const req = new NextRequest('https://example.com/api/documents/send-for-signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: '507f1f77bcf86cd799439012',
        recipients: [
          { id: 'recipient-1', name: 'Asha', email: 'asha@example.com', role: 'signer' },
        ],
        paymentRequest: { enabled: true },
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.message).toBe('Validation failed');
    expect(payload.errors).toEqual(expect.arrayContaining([
      'Payment amount is required.',
      'Payment link is required.',
    ]));
    expect(mocks.getPlanGateForOrgFeature).not.toHaveBeenCalled();
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'negative x', patch: { x: -1 } },
    { label: 'zero width', patch: { width: 0 } },
    { label: 'negative page rectangle width', patch: { pageRect: { width: -10, height: 792 } } },
  ])('rejects malformed field geometry ($label) before document mutation', async ({ patch }) => {
    const res = await POST(signingRequest([{ ...VALID_SIGNER_FIELD, ...patch }]));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.message).toBe('Validation failed');
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
    expect(mocks.documentUpdateOne).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'blank required value',
      field: { id: 'sender-text', type: 'text', value: '', required: true, fieldOwner: 'me' },
      reason: /field is required/i,
    },
    {
      label: 'invalid email value',
      field: {
        id: 'sender-email', type: 'text', value: 'not-an-email', required: true, fieldOwner: 'me',
        settings: { inputType: 'email' },
      },
      reason: /valid email address/i,
    },
    {
      label: 'invalid regex value',
      field: {
        id: 'sender-code', type: 'text', value: 'abc', required: true, fieldOwner: 'me',
        settings: { validationKind: 'regex', validationPattern: '^\\d{4}$' },
      },
      reason: /field format is invalid/i,
    },
  ])('rejects a sender-owned field with $label before document mutation', async ({ field, reason }) => {
    const res = await POST(signingRequest([VALID_SIGNER_FIELD, {
      ...field,
      x: 10,
      y: 70,
      width: 100,
      height: 30,
      pageNumber: 1,
    }]));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.message).toMatch(/complete sender field/i);
    expect(payload.message).toMatch(reason);
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
  });

  it('accepts a valid configured default for a sender-owned field', async () => {
    mocks.documentFindOne.mockResolvedValue(null);
    const res = await POST(signingRequest([VALID_SIGNER_FIELD, {
      id: 'sender-email',
      type: 'text',
      x: 10,
      y: 70,
      width: 100,
      height: 30,
      pageNumber: 1,
      required: true,
      fieldOwner: 'me',
      settings: { inputType: 'email', defaultValue: 'sender@example.com' },
    }]));

    expect(res.status).toBe(404);
    expect(mocks.documentFindOne).toHaveBeenCalledTimes(1);
  });

  it('validates saved prepared fields when the request omits fields', async () => {
    const document = sendableDocument();
    (document.versions[0] as { fields: unknown[] }).fields = [
      VALID_SIGNER_FIELD,
      {
        id: 'sender-text',
        type: 'text',
        x: 10,
        y: 70,
        width: 100,
        height: 30,
        pageNumber: 1,
        required: true,
        fieldOwner: 'me',
        value: '',
      },
    ];
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.getLatestPreparedVersion.mockImplementation((versions: unknown[]) => versions[0]);

    const res = await POST(signingRequest([], false));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.message).toMatch(/complete sender field/i);
    expect(mocks.documentUpdateOne).not.toHaveBeenCalled();
    expect(document.save).not.toHaveBeenCalled();
  });

  it('blocks payment requests for workspaces below Business Plus', async () => {
    mocks.getPlanGateForOrgFeature.mockResolvedValue({
      allowed: false,
      status: 403,
      message: 'Business Plus is required to attach payment requests to signing flows.',
    });

    const req = new NextRequest('https://example.com/api/documents/send-for-signing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId: '507f1f77bcf86cd799439012',
        recipients: [
          {
            id: 'recipient-1',
            name: 'Asha',
            email: 'asha@example.com',
            role: 'signer',
          },
        ],
        fields: [
          {
            id: 'signature-1',
            type: 'signature',
            x: 10,
            y: 10,
            width: 100,
            height: 40,
            recipientId: 'recipient-1',
            required: true,
            fieldOwner: 'recipients',
          },
        ],
        paymentRequest: {
          enabled: true,
          amount: 2500,
          currency: 'INR',
          paymentLinkUrl: 'https://example.com/pay/123',
        },
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.message).toMatch(/business plus/i);
    expect(mocks.getPlanGateForOrgFeature).toHaveBeenCalledWith({
      orgId: 'org-1',
      feature: 'payment_requests',
    });
    expect(mocks.getEffectiveUserSettingsByUserId).not.toHaveBeenCalled();
    expect(mocks.connectDB).not.toHaveBeenCalled();
    expect(mocks.documentFindOne).not.toHaveBeenCalled();
  });

  it('blocks sending until preserved fields are explicitly reviewed and saved', async () => {
    const save = vi.fn();
    mocks.documentFindOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439011',
      orgId: 'org-1',
      status: 'draft',
      currentVersion: 2,
      versions: [{ version: 2, label: 'prepared', fields: [] }],
      recipients: [],
      templatePreparation: { completed: true, fieldsNeedReview: true },
      save,
    });

    const req = new NextRequest('https://example.com/api/documents/send-for-signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: '507f1f77bcf86cd799439012',
        recipients: [
          { id: 'recipient-1', name: 'Asha', email: 'asha@example.com', role: 'signer' },
        ],
        fields: [
          {
            id: 'signature-1', type: 'signature', x: 10, y: 10, width: 100, height: 40,
            recipientId: 'recipient-1', required: true, fieldOwner: 'recipients',
          },
        ],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.code).toBe('DOCUMENT_FIELDS_NEED_REVIEW');
    expect(save).not.toHaveBeenCalled();
  });

  it('blocks a deferred editable template until its required details are prepared', async () => {
    const save = vi.fn();
    mocks.documentFindOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439011',
      orgId: 'org-1',
      status: 'draft',
      currentVersion: 1,
      versions: [{ version: 1, label: 'prepared', fields: [VALID_SIGNER_FIELD] }],
      recipients: [],
      templatePreparation: { completed: false, fieldsNeedReview: false },
      save,
    });

    const res = await POST(signingRequest());
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.code).toBe('DOCUMENT_TEMPLATE_PREPARATION_REQUIRED');
    expect(mocks.documentUpdateOne).not.toHaveBeenCalled();
    expect(mocks.issueSigningToken).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['is marked incomplete', false],
    ['has stale complete state', true],
  ])('blocks a scratch document with a blank required Smart variable when it %s', async (_state, completed) => {
    const document = Object.assign(sendableDocument(), {
      templatePreparation: { completed, fieldsNeedReview: false },
      editableContent: {
        version: 1,
        blocks: [{
          id: 'body',
          type: 'paragraph',
          text: 'Agreement with {{client_name}}',
          html: '<p>Agreement with {{client_name}}</p>',
          align: 'left',
        }],
        variables: [{
          key: 'client_name',
          label: 'Client name',
          defaultValue: '',
          required: true,
        }],
      },
    });
    mocks.documentFindOne.mockResolvedValue(document);

    const res = await POST(signingRequest());
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload).toMatchObject({
      code: 'DOCUMENT_TEMPLATE_PREPARATION_REQUIRED',
      message: expect.stringMatching(/Client name/),
    });
    expect(mocks.documentUpdateOne).not.toHaveBeenCalled();
    expect(mocks.issueSigningToken).not.toHaveBeenCalled();
    expect(document.save).not.toHaveBeenCalled();
  });

  it('rejects a retry after the envelope has already been dispatched', async () => {
    const save = vi.fn();
    mocks.documentFindOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439011',
      orgId: 'org-1',
      status: 'sent',
      currentVersion: 1,
      versions: [{ version: 1, label: 'prepared', sentAt: new Date() }],
      recipients: [{
        id: 'recipient-1',
        name: 'Asha',
        email: 'asha@example.com',
        role: 'signer',
        status: 'sent',
      }],
      templatePreparation: { completed: true, fieldsNeedReview: false },
      save,
    });

    const req = new NextRequest('https://example.com/api/documents/send-for-signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: '507f1f77bcf86cd799439012',
        recipients: [
          { id: 'recipient-1', name: 'Asha', email: 'asha@example.com', role: 'signer' },
        ],
        fields: [
          {
            id: 'signature-1', type: 'signature', x: 10, y: 10, width: 100, height: 40,
            recipientId: 'recipient-1', required: true, fieldOwner: 'recipients',
          },
        ],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.code).toBe('DOCUMENT_ALREADY_SENT');
    expect(save).not.toHaveBeenCalled();
  });

  it('atomically allows only one concurrent send to issue tokens and notifications', async () => {
    let claimed = false;
    mocks.documentFindOne.mockImplementation(async () => sendableDocument());
    mocks.getLatestPreparedVersion.mockImplementation((versions: unknown[]) => versions[0]);
    mocks.updateDocumentStatus.mockImplementation((document: Record<string, unknown>) => {
      document.status = 'sent';
    });
    mocks.documentUpdateOne.mockImplementation(async (filter: Record<string, unknown>) => {
      if (Array.isArray(filter.$or)) {
        if (claimed) return { modifiedCount: 0 };
        claimed = true;
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 1 };
    });

    const [first, second] = await Promise.all([
      POST(signingRequest()),
      POST(signingRequest()),
    ]);

    expect([first.status, second.status].sort((left, right) => left - right)).toEqual([200, 409]);
    expect(mocks.issueSigningToken).toHaveBeenCalledTimes(1);
    expect(mocks.createRecipientDocumentSentNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.processSigningEmailJobs).toHaveBeenCalledTimes(1);
  });

  it('records the sent document ID at the top level of the audit event', async () => {
    const document = sendableDocument();
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.getLatestPreparedVersion.mockImplementation((versions: unknown[]) => versions[0]);
    mocks.updateDocumentStatus.mockImplementation((target: Record<string, unknown>) => {
      target.status = 'sent';
    });

    const res = await POST(signingRequest());

    expect(res.status).toBe(200);
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'document.send_for_signing.success',
      documentId: '507f1f77bcf86cd799439012',
      metadata: expect.objectContaining({
        documentId: '507f1f77bcf86cd799439012',
      }),
    }));
  });

  it('returns a committed success even when post-send audit persistence fails', async () => {
    const document = sendableDocument();
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.getLatestPreparedVersion.mockImplementation((versions: unknown[]) => versions[0]);
    mocks.updateDocumentStatus.mockImplementation((target: Record<string, unknown>) => {
      target.status = 'sent';
    });
    mocks.writeAuditEvent.mockRejectedValue(new Error('audit storage unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await POST(signingRequest());
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.message).toMatch(/sent for signing/i);
    expect(document.save).toHaveBeenCalledTimes(1);
    expect(mocks.processSigningEmailJobs).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to audit successful signing dispatch',
      expect.any(Error)
    );
    consoleError.mockRestore();
  });

  it('commits recoverable deliveries with a fenced claim before starting the worker', async () => {
    const document = sendableDocument();
    mocks.documentFindOne.mockResolvedValue(document);
    mocks.getLatestPreparedVersion.mockImplementation((versions: unknown[]) => versions[0]);
    mocks.updateDocumentStatus.mockImplementation((target: Record<string, unknown>) => { target.status = 'sent'; });
    mocks.processSigningEmailJobs.mockImplementation(async () => {
      expect(document.save).toHaveBeenCalledTimes(1);
      expect(document).toMatchObject({
        sendDispatch: { status: 'processing', deliveries: [{ recipientId: 'recipient-1', status: 'queued', tokenEncrypted: 'encrypted' }] },
        $where: { 'sendDispatch.claimId': expect.any(String), 'sendDispatch.status': 'processing' },
      });
      return [];
    });
    mocks.getSigningEmailDeliverySummary.mockResolvedValue({ failures: [], pending: 1, completed: 0 });
    const response = await POST(signingRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).emailDelivery).toMatchObject({ delivered: 0, pending: 1 });
  });
});
