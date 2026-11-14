import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  connectDB: vi.fn(),
  findById: vi.fn(),
  getExpiredTrialWriteGuard: vi.fn(),
  isAdminRole: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: {
    findById: mocks.findById,
  },
}));

vi.mock('@/lib/role-utils', () => ({
  isAdminRole: mocks.isAdminRole,
}));

vi.mock('@/lib/subscription-server', () => ({
  getExpiredTrialWriteGuard: mocks.getExpiredTrialWriteGuard,
}));

import { PATCH } from '@/app/api/documents/[documentId]/payment-request/route';

describe('document payment request route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.getExpiredTrialWriteGuard.mockResolvedValue({ allowed: true });
    mocks.isAdminRole.mockReturnValue(false);
  });

  it('lets the owner mark a payment request as paid', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    mocks.getAuthContext.mockResolvedValue({
      userId: 'owner-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.findById.mockResolvedValue({
      _id: 'doc-1',
      userId: 'owner-1',
      orgId: 'org-1',
      paymentRequest: {
        enabled: true,
        status: 'pending',
        paidAt: null,
      },
      save,
    });

    const req = new NextRequest('https://example.com/api/documents/doc-1/payment-request', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.paymentRequest.status).toBe('paid');
    expect(payload.paymentRequest.paidAt).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('blocks users who do not own the document and are not workspace admins', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'member-1',
      orgId: 'org-1',
      orgRole: 'user',
    });
    mocks.findById.mockResolvedValue({
      _id: 'doc-1',
      userId: 'owner-1',
      orgId: 'org-1',
      paymentRequest: {
        enabled: true,
        status: 'pending',
        paidAt: null,
      },
      save: vi.fn(),
    });

    const req = new NextRequest('https://example.com/api/documents/doc-1/payment-request', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ documentId: 'doc-1' }),
    });
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload.message).toBe('Forbidden');
  });
});
