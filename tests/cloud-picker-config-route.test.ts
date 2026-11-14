import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/cloud/picker-config/route';

const ORIGINAL_ENV = { ...process.env };

describe('cloud picker config route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
  });

  it('exposes public picker configuration without provider secrets', async () => {
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'google-client-id');
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'google-secret');
    vi.stubEnv('DROPBOX_CLIENT_ID', 'dropbox-app-key');
    vi.stubEnv('DROPBOX_CLIENT_SECRET', 'dropbox-secret');

    const response = await GET(new NextRequest('https://example.com/api/cloud/picker-config'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.googleDrive).toMatchObject({
      clientId: 'google-client-id',
      configured: true,
    });
    expect(payload.dropbox).toMatchObject({
      appKey: 'dropbox-app-key',
      configured: true,
    });
    expect(JSON.stringify(payload)).not.toContain('secret');
  });
});
