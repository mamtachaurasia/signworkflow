import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  resumePendingBillingCheckoutForUser: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getUserAgent: vi.fn(() => 'unit-test'),
  isSecureRequest: vi.fn(() => true),
  validateCsrfToken: vi.fn(() => true),
  withSecurityHeaders: vi.fn((_req, res) => res),
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/lib/billing-server', () => ({
  resumePendingBillingCheckoutForUser: mocks.resumePendingBillingCheckoutForUser,
}));

vi.mock('@/lib/audit', () => ({
  writeAuditEvent: mocks.writeAuditEvent,
}));

import { POST } from '@/app/api/subscription/pending/route';

describe('subscription pending route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reopens a pending checkout for workspace owners', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.resumePendingBillingCheckoutForUser.mockResolvedValue({
      mode: 'checkout',
      sessionId: 'sub_pending_123',
      checkout: {
        provider: 'razorpay',
        key: 'rzp_test_123',
        subscriptionId: 'sub_pending_123',
        name: 'Acme Workspace',
        description: 'Business subscription',
        prefill: { email: 'owner@example.com' },
        notes: {},
        theme: { color: '#0f172a' },
      },
      organizationId: 'org-1',
      message: null,
    });

    const req = new NextRequest('https://example.com/api/subscription/pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.resumePendingBillingCheckoutForUser).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
    });
    expect(payload.sessionId).toBe('sub_pending_123');
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.checkout_resumed',
      })
    );
  });

  it('returns a conflict when the pending checkout can no longer be reopened', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.resumePendingBillingCheckoutForUser.mockRejectedValue(
      new Error(
        'This older pending billing step cannot be reopened automatically. Cancel it first, then choose your package again.'
      )
    );

    const req = new NextRequest('https://example.com/api/subscription/pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.message).toContain('cannot be reopened automatically');
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });
});
