import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('@/lib/api-helpers', () => ({
  getAuthSession: mocks.getAuthSession,
}));

vi.mock('@/models/Users', () => ({
  default: {
    findById: mocks.findById,
  },
}));

import { GET as getSupportSso } from '@/app/api/support/sso/route';
import { GET as getSupportSsoComplete } from '@/app/api/support/sso/complete/route';

describe('support SSO route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthSession.mockResolvedValue(null);
  });

  it.each([
    ['/api/support/sso', getSupportSso],
    ['/api/support/sso/complete', getSupportSsoComplete],
  ] as const)('preserves %s as the post-login callback', async (path, handler) => {
    const response = await handler(new NextRequest(`https://signworkflow.com${path}`));
    const destination = new URL(response.headers.get('location') || '');

    expect(response.status).toBe(307);
    expect(destination.origin).toBe('https://signworkflow.com');
    expect(destination.pathname).toBe('/login');
    expect(destination.searchParams.get('next')).toBe(path);
    expect(mocks.findById).not.toHaveBeenCalled();
  });
  it('carries a safe support return path through main login', async () => {
    const response = await getSupportSsoComplete(new NextRequest(
      'https://signworkflow.com/api/support/sso/complete?returnTo=%2Ftickets'
    ));
    const destination = new URL(response.headers.get('location') || '');

    expect(destination.searchParams.get('next')).toBe('/api/support/sso/complete?returnTo=%2Ftickets');
  });

  it('replaces an unsafe support return path with the local create page', async () => {
    const response = await getSupportSso(new NextRequest(
      'https://signworkflow.com/api/support/sso?returnTo=%2F%5Cevil.example'
    ));
    const destination = new URL(response.headers.get('location') || '');

    expect(destination.searchParams.get('next')).toBe('/api/support/sso?returnTo=%2Fcreate');
  });

  it('issues a staff-purpose token only for the staff handoff', async () => {
    process.env.SUPPORT_SSO_SECRET = 'a-32-character-secret-for-staff-handoff';
    process.env.SUPPORT_PUBLIC_ORIGIN = 'https://support.example.com';
    mocks.getAuthSession.mockResolvedValue('user-1');
    mocks.findById.mockReturnValue({ select: () => ({ lean: async () => ({ email: 'owner@example.com', firstName: 'Owner', lastName: 'User' }) }) });
    const response = await getSupportSso(new NextRequest(
      'https://signworkflow.com/api/support/sso?purpose=staff&returnTo=%2Fdesk'
    ));
    const destination = new URL(response.headers.get('location') || '');
    const encoded = destination.searchParams.get('token')!.split('.')[0];
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    expect(destination.origin).toBe('https://support.example.com');
    expect(destination.searchParams.get('purpose')).toBe('staff');
    expect(destination.searchParams.get('returnTo')).toBe('/desk');
    expect(payload.purpose).toBe('staff');
});
});
