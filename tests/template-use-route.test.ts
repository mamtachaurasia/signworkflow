import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type TrialHandler = (
  req: NextRequest,
  context: unknown,
  authContext: { userId: string; orgId: string; orgRole: string }
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  createDocumentFromTemplateRecord: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: { findOne: mocks.findOne },
}));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/template-access', () => ({
  buildTemplateListFilter: vi.fn(() => ({ isActive: { $ne: false } })),
}));
vi.mock('@/lib/template-documents', () => ({
  createDocumentFromTemplateRecord: mocks.createDocumentFromTemplateRecord,
}));
vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, {
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    }),
}));

import { POST } from '@/app/api/templates/use/route';

const TEMPLATE_ID = '507f1f77bcf86cd799439011';

function request() {
  return new NextRequest('https://example.com/api/templates/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId: TEMPLATE_ID }),
  });
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    _id: TEMPLATE_ID,
    name: 'NDA',
    artifacts: {
      pdf: {
        storage: { provider: 's3', bucket: 'templates-test', region: 'ap-south-1', key: 'templates/nda.pdf' },
        contentType: 'application/pdf',
        size: 123,
      },
    },
    editableContent: undefined,
    fields: [],
    defaultSigners: [],
    ...overrides,
  };
}

describe('template use layout guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.createDocumentFromTemplateRecord.mockResolvedValue({
      documentId: 'document-1',
      sessionId: 'session-1',
      guestId: null,
      recipients: [],
      fields: [],
    });
  });

  it('rejects an invalid template identifier before querying the database', async () => {
    const response = await POST(new NextRequest('https://example.com/api/templates/use', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: 'not-an-object-id' }),
    }), {});

    expect(response.status).toBe(400);
    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(mocks.createDocumentFromTemplateRecord).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without exposing an internal error', async () => {
    const response = await POST(new NextRequest('https://example.com/api/templates/use', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }), {});
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe('Invalid JSON body');
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it('blocks an agreement when fields need review', async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(template({
        fieldLayoutStatus: 'needs_review',
        layoutRevision: 2,
        fieldLayoutRevision: 1,
      })),
    });

    const response = await POST(request(), {});
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe('TEMPLATE_FIELD_LAYOUT_NEEDS_REVIEW');
    expect(mocks.createDocumentFromTemplateRecord).not.toHaveBeenCalled();
  });

  it('keeps legacy templates without layout metadata usable', async () => {
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(template()) });

    const response = await POST(request(), {});

    expect(response.status).toBe(201);
    expect(mocks.createDocumentFromTemplateRecord).toHaveBeenCalledTimes(1);
  });

  it('keeps unassigned reusable roles available in the draft Builder', async () => {
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(template({
      defaultSigners: [{
        id: 'buyer-role',
        name: 'Buyer',
        email: '',
        role: 'signer',
        order: 1,
      }],
    })) });

    const response = await POST(request(), {});

    expect(response.status).toBe(201);
    expect(mocks.createDocumentFromTemplateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientAssignments: [{
          id: 'buyer-role',
          name: 'Buyer',
          email: '',
          role: 'signer',
          order: 1,
        }],
      })
    );
  });

  it('uses the field recipient ID for a legacy reusable role without an explicit ID', async () => {
    mocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(template({
      fields: [{
        id: 'signature-1',
        type: 'signature',
        x: 10,
        y: 20,
        width: 120,
        height: 40,
        pageNumber: 1,
        recipientId: 'legacy-buyer-role',
        fieldOwner: 'recipients',
      }],
      defaultSigners: [{
        name: 'Buyer',
        email: '',
        role: 'signer',
        order: 1,
      }],
    })) });

    const response = await POST(request(), {});

    expect(response.status).toBe(201);
    expect(mocks.createDocumentFromTemplateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientAssignments: [{
          id: 'legacy-buyer-role',
          name: 'Buyer',
          email: '',
          role: 'signer',
          order: 1,
        }],
      })
    );
  });
});
