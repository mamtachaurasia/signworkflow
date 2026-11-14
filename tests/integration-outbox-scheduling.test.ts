import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('integration outbox scheduling', () => {
  it('registers a daily Vercel recovery sweep for the durable outbox', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toContainEqual({
      path: '/api/cron/integration-outbox',
      schedule: '30 4 * * *',
    });
  });

  it('includes the reconciler in the five-minute repository worker', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/integration-workers.yml'), 'utf8');
    const runner = readFileSync(resolve(process.cwd(), 'scripts/run-integration-workers.mjs'), 'utf8');

    expect(workflow).toContain("cron: '*/5 * * * *'");
    expect(workflow).toContain('node scripts/run-integration-workers.mjs');
    expect(runner).toContain("path: '/api/cron/integration-outbox'");
  });
});
