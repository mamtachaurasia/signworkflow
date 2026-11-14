import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateMock, cookiesMock, redirectMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  cookiesMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/api-helpers', () => ({
  getAuthenticatedUserIdFromRefreshToken: authenticateMock,
}));

import { requireRefreshSessionOrRedirect } from '@/lib/requireRefreshSession';

describe('refresh-session redirect continuation', () => {
  const builderHref =
    '/dashboard/builder/507f1f77bcf86cd799439012' +
    '?templateOrigin=dashboard&templateReturnTo=%2Fdashboard%3Fview%3Dmy';

  beforeEach(() => {
    authenticateMock.mockReset();
    cookiesMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation((href: string) => {
      throw new Error(`redirect:${href}`);
    });
  });

  it('preserves a safe Builder target when the refresh cookie is missing', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });

    await expect(requireRefreshSessionOrRedirect(builderHref)).rejects.toThrow('redirect:');

    expect(redirectMock).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent(builderHref)}`
    );
    expect(authenticateMock).not.toHaveBeenCalled();
  });

  it('preserves a safe Builder target when the refresh token is invalid', async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: 'invalid-refresh-token' })),
    });
    authenticateMock.mockResolvedValue(null);

    await expect(requireRefreshSessionOrRedirect(builderHref)).rejects.toThrow('redirect:');

    expect(redirectMock).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent(builderHref)}`
    );
  });

  it('keeps the existing plain login redirect for account and unsafe callers', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });

    await expect(requireRefreshSessionOrRedirect()).rejects.toThrow('redirect:/login');
    expect(redirectMock).toHaveBeenLastCalledWith('/login');

    await expect(requireRefreshSessionOrRedirect('//evil.example')).rejects.toThrow(
      'redirect:/login'
    );
    expect(redirectMock).toHaveBeenLastCalledWith('/login');
  });
});
