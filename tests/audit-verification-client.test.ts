import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyAuditChains } from '@/lib/audit-verification-client';

function page(overrides: Record<string, unknown> = {}) {
  return {
    ok: true, complete: false, checked: 1, partialChains: 0,
    unverifiable: 0, mismatchCount: 0, mismatches: [], hasMore: false,
    ...overrides,
  };
}

function mockPages(pages: Array<ReturnType<typeof page> | Error>) {
  const fetchMock = vi.fn();
  for (const payload of pages) {
    if (payload instanceof Error) fetchMock.mockRejectedValueOnce(payload);
    else fetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('audit verification pagination in the UI', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps progress incomplete and follows all pages before reporting completion', async () => {
    const fetchMock = mockPages([
      page({ hasMore: true, nextCursor: 'second' }),
      page({ hasMore: true, nextCursor: 'third' }),
      page(),
    ]);
    const progress = vi.fn();
    const result = await verifyAuditChains('action=selected&limit=1', progress);
    expect(result).toMatchObject({ ok: true, complete: true, checked: 3 });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.every(([value]) => value.complete === false)).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url, 'https://example.test').searchParams.get('cursor'))).toEqual([null, 'second', 'third']);
    expect(fetchMock.mock.calls.every(([url]) => url.includes('action=selected'))).toBe(true);
  });

  it('retains an issue from a later page', async () => {
    mockPages([
      page({ hasMore: true, nextCursor: 'second' }),
      page({ ok: false, mismatchCount: 1, mismatches: [{ id: 'bad', reason: 'hash_mismatch' }] }),
    ]);
    expect(await verifyAuditChains('', vi.fn())).toMatchObject({ ok: false, complete: true, checked: 2, mismatchCount: 1 });
  });

  it('retains progress but does not report completion after a network error', async () => {
    mockPages([page({ hasMore: true, nextCursor: 'second' }), new Error('Connection interrupted')]);
    expect(await verifyAuditChains('', vi.fn())).toMatchObject({ complete: false, checked: 1, message: 'Connection interrupted' });
  });

  it('keeps a result incomplete when legacy history cannot be verified', async () => {
    mockPages([page({ partialChains: 1, unverifiable: 1 })]);
    expect(await verifyAuditChains('', vi.fn())).toMatchObject({ complete: false, partialChains: 1, unverifiable: 1 });
  });

  it('does not mark a truncated response verified when its next cursor is missing', async () => {
    mockPages([page({ hasMore: true })]);
    expect(await verifyAuditChains('', vi.fn())).toMatchObject({ complete: false, checked: 1, message: expect.stringContaining('next page') });
  });
});
