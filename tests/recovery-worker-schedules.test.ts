import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('recovery worker scheduling', () => {
  it('declares daily serverless recovery sweeps for both durable workers', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toEqual(expect.arrayContaining([
      { path: '/api/cron/signing-emails', schedule: '0 4 * * *' },
      { path: '/api/cron/integration-outbox', schedule: '30 4 * * *' },
    ]));
  });

  it('includes both real worker routes in the frequent repository-operated sweep', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/integration-workers.yml'), 'utf8');
    const runner = readFileSync(resolve(root, 'scripts/run-integration-workers.mjs'), 'utf8');

    expect(workflow).toContain('actions/checkout@v4');
    expect(workflow).toContain('node scripts/run-integration-workers.mjs');
    expect(workflow).toContain("cron: '*/5 * * * *'");
    expect(runner).toContain("path: '/api/cron/signing-emails'");
    expect(runner).toContain("path: '/api/cron/integration-outbox'");
    expect(existsSync(resolve(root, 'app/api/cron/signing-emails/route.ts'))).toBe(true);
    expect(existsSync(resolve(root, 'app/api/cron/integration-outbox/route.ts'))).toBe(true);
  });
});
