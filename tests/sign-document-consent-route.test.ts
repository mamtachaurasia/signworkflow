import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/utils/db', () => ({
  default: vi.fn(async () => undefined),
}));

vi.mock('@/models/Document', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/signing-token', () => ({
  buildSigningTokenLookup: vi.fn(() => ({ token: 'hashed-token' })),
  recipientMatchesSigningToken: vi.fn(() => true),
}));

vi.mock('@/lib/signing-utils', () => ({
  buildEventClient: vi.fn(() => undefined),
  buildEventConsent: vi.fn(() => ({ esignDisclosureAccepted: true })),
  normalizeIp: vi.fn(() => ({ ip: undefined, ipUnavailableReason: 'unavailable' })),
}));

import { POST } from '@/app/api/sign-document/consent/route';
import DocumentModel from '@/models/Document';

const documentModelMock = DocumentModel as unknown as {
  findOne: ReturnType<typeof vi.fn>;
};

describe('sign document consent route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not preserve undefined nested network fields when recording consent', async () => {
    const recipient = {
      id: 'recipient-1',
      order: 1,
      consent: {},
      network: {
        ipLocation: undefined,
      },
    };
    const document = {
      deletedAt: null,
      recipients: [recipient],
      signingEvents: [],
      save: vi.fn(async () => undefined),
    };
    documentModelMock.findOne.mockResolvedValue(document);

    const req = new NextRequest('https://example.com/api/sign-document/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'signing-token',
        accepted: true,
        device: {
          type: 'desktop',
          os: 'MacIntel',
          browser: 'Netscape',
          userAgent: 'unit-test',
        },
      }),
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(document.save).toHaveBeenCalled();
    expect(recipient.network).toEqual({ ipUnavailableReason: 'unavailable' });
    expect(Object.prototype.hasOwnProperty.call(recipient.network, 'ipLocation')).toBe(false);
  });
});
