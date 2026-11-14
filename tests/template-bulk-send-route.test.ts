import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  connectDB: vi.fn(),
  findOne: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
  getExpiredTrialWriteGuard: vi.fn(),
  createDocumentFromTemplateRecord: vi.fn(),
  sendForSigningRoute: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: {
    findOne: mocks.findOne,
  },
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature,
  getExpiredTrialWriteGuard: mocks.getExpiredTrialWriteGuard,
}));

vi.mock('@/lib/template-documents', () => ({
  createDocumentFromTemplateRecord: mocks.createDocumentFromTemplateRecord,
}));

vi.mock('@/app/api/documents/send-for-signing/route', () => ({
  POST: mocks.sendForSigningRoute,
}));

import { POST } from '@/app/api/templates/bulk-send/route';

describe('template bulk-send route', () => {
  let forwardedBody: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    forwardedBody = null;
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.getAuthContext.mockResolvedValue({
      userId: 'owner-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.getExpiredTrialWriteGuard.mockResolvedValue({ allowed: true });
    mocks.getPlanGateForOrgFeature.mockResolvedValue({
      allowed: true,
      status: 200,
      message: '',
    });
    mocks.createDocumentFromTemplateRecord.mockResolvedValue({
      documentId: 'doc-1',
      sessionId: 'session-1',
      guestId: null,
    });
    mocks.sendForSigningRoute.mockImplementation(async (req: NextRequest) => {
      const body = await req.json();
      forwardedBody = body as Record<string, unknown>;
      return NextResponse.json({
        success: true,
        documentId: body.documentId,
        recipients: body.recipients,
      });
    });
  });

  it('supports one variable recipient plus fixed template recipients', async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Sales Order',
        artifacts: { pdf: { storage: { provider: 's3', bucket: 'templates-test', key: 'templates/sales.pdf' }, contentType: 'application/pdf', size: 123 } },
        defaultSigners: [
          {
            id: 'customer',
            name: 'Customer',
            email: '',
            role: 'signer',
            order: 1,
          },
          {
            id: 'finance',
            name: 'Finance Team',
            email: 'finance@example.com',
            role: 'viewer',
            order: 2,
          },
        ],
        fields: [{ recipientId: 'customer' }],
      }),
    });

    const req = new NextRequest('https://example.com/api/templates/bulk-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'csrf_token=test-csrf-token',
        'X-CSRF-Token': 'test-csrf-token',
      },
      body: JSON.stringify({
        templateId: '507f1f77bcf86cd799439012',
        recipients: [{ name: 'Asha Mehta', email: 'asha@example.com' }],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.sentCount).toBe(1);
    expect(mocks.sendForSigningRoute).toHaveBeenCalledTimes(1);

    expect(forwardedBody?.recipients).toEqual([
      expect.objectContaining({
        id: 'customer',
        name: 'Asha Mehta',
        email: 'asha@example.com',
        role: 'signer',
        order: 1,
      }),
      expect.objectContaining({
        id: 'finance',
        name: 'Finance Team',
        email: 'finance@example.com',
        role: 'viewer',
        order: 2,
      }),
    ]);
  });

  it('blocks bulk send while template fields need layout review', async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Sales Order',
        artifacts: { pdf: { storage: { provider: 's3', bucket: 'templates-test', key: 'templates/sales.pdf' }, contentType: 'application/pdf', size: 123 } },
        defaultSigners: [],
        fields: [{ recipientId: 'customer' }],
        fieldLayoutStatus: 'needs_review',
        layoutRevision: 2,
        fieldLayoutRevision: 1,
      }),
    });

    const req = new NextRequest('https://example.com/api/templates/bulk-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'csrf_token=test-csrf-token',
        'X-CSRF-Token': 'test-csrf-token',
      },
      body: JSON.stringify({
        templateId: '507f1f77bcf86cd799439012',
        recipients: [{ name: 'Asha Mehta', email: 'asha@example.com' }],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.code).toBe('TEMPLATE_FIELD_LAYOUT_NEEDS_REVIEW');
    expect(mocks.createDocumentFromTemplateRecord).not.toHaveBeenCalled();
  });

  it('rejects a cookie-authenticated bulk send without a CSRF token before processing the request', async () => {
    const req = new NextRequest('https://example.com/api/templates/bulk-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: '507f1f77bcf86cd799439012',
        recipients: [{ name: 'Asha Mehta', email: 'asha@example.com' }],
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      message: 'CSRF validation failed',
      reason: 'csrf_mismatch',
    });
    expect(mocks.connectDB).not.toHaveBeenCalled();
  });
});
