import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const sendMailMock = vi.hoisted(() =>
  vi.fn(async () => ({ messageId: '<mock-message@signworkflow.test>' }))
);

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
      verify: vi.fn(async () => true),
    })),
  },
}));

import { resolvePublicBaseUrl } from '@/lib/app-url';
import { sendTrialExpirationEmail } from '@/lib/email';

describe('resolvePublicBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sendMailMock.mockClear();
  });

  it('prefers APP_URL over unset or localhost NEXT_PUBLIC_BASE_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000');
    vi.stubEnv('APP_URL', 'https://ais-pre-example.asia-east1.run.app');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');

    expect(resolvePublicBaseUrl()).toBe('https://ais-pre-example.asia-east1.run.app');
  });

  it('prefers an explicit non-localhost NEXT_PUBLIC_BASE_URL over APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://signworkflow.com/app');
    vi.stubEnv('APP_URL', 'https://ais-pre-example.asia-east1.run.app');

    expect(resolvePublicBaseUrl()).toBe('https://signworkflow.com');
  });

  it('falls back to forwarded request host when env vars are unset or localhost', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NEXTAUTH_URL', '');
    vi.stubEnv('VERCEL_URL', '');

    const req = new NextRequest('http://127.0.0.1:3000/api/cron/trial-expiration-emails', {
      headers: {
        'x-forwarded-host': 'ais-pre-example.asia-east1.run.app',
        'x-forwarded-proto': 'https',
      },
    });

    expect(resolvePublicBaseUrl({ req })).toBe('https://ais-pre-example.asia-east1.run.app');
  });

  it('falls back to localhost:3000 when no public URL is available', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NEXTAUTH_URL', '');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');

    expect(resolvePublicBaseUrl()).toBe('http://localhost:3000');
  });

  it('builds Choose a plan button pointing to APP_URL instead of localhost in trial expiration email', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.stubEnv('APP_URL', 'https://ais-pre-example.asia-east1.run.app');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '587');
    vi.stubEnv('SMTP_USER', 'noreply@example.com');
    vi.stubEnv('SMTP_PASS', 'secret');

    await sendTrialExpirationEmail({
      email: 'owner@example.com',
      messageId: '<trial-1@example.com>',
      recipientName: 'Owner',
      workspaceName: 'Acme Corp',
      trialEndsAt: '2026-11-15T00:00:00.000Z',
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mailPayload = sendMailMock.mock.calls[0]?.[0] as { html: string; text: string };
    expect(mailPayload.html).toContain(
      'href="https://ais-pre-example.asia-east1.run.app/dashboard/account/subscription"'
    );
    expect(mailPayload.text).toContain(
      'Choose a plan: https://ais-pre-example.asia-east1.run.app/dashboard/account/subscription'
    );
    expect(mailPayload.html).not.toContain('localhost:3000');
  });

  it('prefers non-localhost request origin over APP_URL when NEXT_PUBLIC_BASE_URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.stubEnv('APP_URL', 'https://ais-dev-example.asia-east1.run.app');

    const req = new NextRequest('https://custom.example.com/api/subscription');
    expect(resolvePublicBaseUrl({ req })).toBe('https://custom.example.com');
  });
});

