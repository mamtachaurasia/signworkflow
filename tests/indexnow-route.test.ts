import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  submitUrls: vi.fn(),
}));

vi.mock('@/lib/indexnow/service', () => ({
  submitUrls: mocks.submitUrls,
}));

import { POST } from '@/app/api/indexnow/route';
import { indexNowConfig } from '@/lib/indexnow/config';

function request(urls: unknown) {
  return new NextRequest('https://example.com/api/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
}

describe('IndexNow route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitUrls.mockResolvedValue(undefined);
  });

  it('submits normalized URLs belonging to the configured site', async () => {
    const url = new URL('/new-page', indexNowConfig.host).toString();

    const response = await POST(request([url]));

    expect(response.status).toBe(200);
    expect(mocks.submitUrls).toHaveBeenCalledWith([url]);
  });

  it('rejects URLs for an unrelated host', async () => {
    const response = await POST(request(['https://unrelated.example/page']));

    expect(response.status).toBe(400);
    expect(mocks.submitUrls).not.toHaveBeenCalled();
  });

  it('reports an upstream submission failure', async () => {
    mocks.submitUrls.mockRejectedValue(new Error('IndexNow returned HTTP 503'));
    const url = new URL('/new-page', indexNowConfig.host).toString();

    const response = await POST(request([url]));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      success: false,
      error: 'IndexNow returned HTTP 503',
    });
  });
});
