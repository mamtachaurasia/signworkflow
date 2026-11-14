import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/contact/route';
import { sendContactInquiryEmails } from '@/lib/email';
import { consumeRateLimit } from '@/lib/rateLimit';

vi.mock('@/lib/email', () => ({
  sendContactInquiryEmails: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi.fn(),
}));

const sendContactInquiryEmailsMock = vi.mocked(sendContactInquiryEmails);
const consumeRateLimitMock = vi.mocked(consumeRateLimit);

const allowedRateLimit = {
  allowed: true,
  limit: 10,
  remaining: 9,
  resetAt: Date.now() + 60_000,
  retryAfterSeconds: 60,
};

function contactRequest(body: unknown) {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'vitest',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

const validInquiry = {
  firstName: 'Riya',
  lastName: 'Kapoor',
  workEmail: 'Riya@Example.com',
  topic: 'sales',
  subject: 'Workspace rollout',
  teamSize: '11-50',
  message: 'We would like to plan a rollout.',
};

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    sendContactInquiryEmailsMock.mockReset();
    sendContactInquiryEmailsMock.mockResolvedValue({ success: true, confirmationSent: true });
    consumeRateLimitMock.mockReset();
    consumeRateLimitMock.mockResolvedValue(allowedRateLimit);
  });

  it('delivers a business inquiry without creating a support ticket', async () => {
    const response = await POST(contactRequest(validInquiry));

    await expect(response.json()).resolves.toEqual({
      message: "Message received. We'll get back to you soon.",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(consumeRateLimitMock).toHaveBeenNthCalledWith(1, {
      key: '203.0.113.10',
      namespace: 'contact:ip',
      limit: 10,
      windowSeconds: 15 * 60,
    });
    expect(consumeRateLimitMock).toHaveBeenNthCalledWith(2, {
      key: 'riya@example.com',
      namespace: 'contact:email',
      limit: 4,
      windowSeconds: 60 * 60,
    });
    expect(sendContactInquiryEmailsMock).toHaveBeenCalledWith({
      recipientEmail: 'sales@signworkflow.com',
      firstName: 'Riya',
      lastName: 'Kapoor',
      workEmail: 'riya@example.com',
      topic: 'sales',
      subject: 'Workspace rollout',
      teamSize: '11-50',
      message: 'We would like to plan a rollout.',
      userAgent: 'vitest',
      ipAddress: '203.0.113.10',
    });
  });

  it('rejects support submissions because tickets belong to the external help center', async () => {
    const response = await POST(
      contactRequest({ ...validInquiry, topic: 'support' })
    );

    await expect(response.json()).resolves.toEqual({
      error: 'Choose a valid contact topic.',
    });
    expect(response.status).toBe(400);
    expect(sendContactInquiryEmailsMock).not.toHaveBeenCalled();
  });

  it('silently discards submissions that populate the honeypot field', async () => {
    const response = await POST(
      contactRequest({ ...validInquiry, contactConfirmation: 'automated submission' })
    );

    await expect(response.json()).resolves.toEqual({
      message: "Message received. We'll get back to you soon.",
    });
    expect(response.status).toBe(200);
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(1);
    expect(sendContactInquiryEmailsMock).not.toHaveBeenCalled();
  });

  it('rate limits repeated requests by IP', async () => {
    consumeRateLimitMock.mockResolvedValueOnce({
      ...allowedRateLimit,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 300,
    });

    const response = await POST(contactRequest(validInquiry));

    await expect(response.json()).resolves.toEqual({
      error: 'Too many contact requests. Please try again later.',
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('300');
    expect(sendContactInquiryEmailsMock).not.toHaveBeenCalled();
  });

  it('rate limits repeated requests by requester email', async () => {
    consumeRateLimitMock
      .mockResolvedValueOnce(allowedRateLimit)
      .mockResolvedValueOnce({
        ...allowedRateLimit,
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 600,
      });

    const response = await POST(contactRequest(validInquiry));

    await expect(response.json()).resolves.toEqual({
      error: 'Too many contact requests. Please try again later.',
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('600');
    expect(sendContactInquiryEmailsMock).not.toHaveBeenCalled();
  });

  it('rejects a body that exceeds the limit without relying on content-length', async () => {
    const response = await POST(
      contactRequest({ ...validInquiry, message: 'x'.repeat(17 * 1024) })
    );

    await expect(response.json()).resolves.toEqual({ error: 'Request body is too large.' });
    expect(response.status).toBe(413);
    expect(sendContactInquiryEmailsMock).not.toHaveBeenCalled();
  });

  it('cancels a chunked stream as soon as the body limit is crossed', async () => {
    let pullCount = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(new Uint8Array(4096));
        if (pullCount >= 100) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new NextRequest(
      'http://localhost/api/contact',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }
    );

    const response = await POST(request);

    await expect(response.json()).resolves.toEqual({ error: 'Request body is too large.' });
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pullCount).toBeLessThan(100);
  });

  it('fails closed when production-grade rate limiting is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consumeRateLimitMock.mockRejectedValueOnce(new Error('Shared counter unavailable'));

    const response = await POST(contactRequest(validInquiry));

    await expect(response.json()).resolves.toEqual({
      error: 'Contact service is temporarily unavailable. Please try again later.',
    });
    expect(response.status).toBe(503);
    expect(sendContactInquiryEmailsMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not expose SMTP diagnostics when delivery fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendContactInquiryEmailsMock.mockRejectedValueOnce(
      new Error('SMTP authentication failed for secret-user@example.com')
    );

    const response = await POST(contactRequest(validInquiry));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: 'We could not send your message right now. Please try again later.',
    });
    expect(JSON.stringify(payload)).not.toContain('SMTP');
    expect(JSON.stringify(payload)).not.toContain('secret-user');
    consoleError.mockRestore();
  });
});
