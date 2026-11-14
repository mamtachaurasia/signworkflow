// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../lib/api';

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'csrf_token=; Max-Age=0; path=/';
  });

  it('sends the csrf token for patch requests', async () => {
    document.cookie = 'csrf_token=test-csrf; path=/';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'user-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.patch('/user/profile', { signatures: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user/profile',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-csrf',
        }),
        body: JSON.stringify({ signatures: [] }),
      })
    );
  });

  it('throws api error messages for failed requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'CSRF validation failed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(api.patch('/user/profile', { signatures: [] })).rejects.toThrow(
      'CSRF validation failed'
    );
  });
});
