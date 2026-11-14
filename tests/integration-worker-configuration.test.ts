import { describe, expect, it, vi } from 'vitest';
import { runIntegrationWorkers, WORKERS } from '@/scripts/run-integration-workers.mjs';

const env = { CRON_SECRET: 'private-test-value', SIGNWORKFLOW_BASE_URL: 'https://signworkflow.com' };
const ready = () => Response.json({ message: 'Invalid worker options.' }, { status: 400 });

describe('integration worker configuration', () => {
  it('fails clearly without a secret and never invokes a worker', async () => {
    const fetchImpl = vi.fn();
    await expect(runIntegrationWorkers({ env: {}, fetchImpl })).rejects.toThrow('CRON_SECRET is missing');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('uses only invalid limit requests in the non-mutating readiness check', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ready());
    const log = vi.fn();
    await runIntegrationWorkers({ env, fetchImpl, checkOnly: true, log });
    expect(fetchImpl).toHaveBeenCalledTimes(WORKERS.length);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url.origin).toBe('https://signworkflow.com');
      expect(JSON.parse(init.body)).toEqual({ limit: 0 });
      expect(init.redirect).toBe('error');
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.CRON_SECRET);
  });
  it('does not run jobs when production authentication is absent', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => Response.json({ message: 'CRON_SECRET is not configured' }, { status: 500 }));
    await expect(runIntegrationWorkers({ env, fetchImpl })).rejects.toBeInstanceOf(AggregateError);
    expect(fetchImpl).toHaveBeenCalledTimes(WORKERS.length);
    expect(fetchImpl.mock.calls.every(([, init]) => JSON.parse(init.body).limit === 0)).toBe(true);
  });
  it('drains independent queues even when outbox processing fails', async () => {
    const processing: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (url: URL, init: RequestInit) => {
      if (JSON.parse(String(init.body)).limit === 0) return ready();
      processing.push(url.pathname);
      return Response.json({}, { status: url.pathname.endsWith('integration-outbox') ? 503 : 200 });
    });
    await expect(runIntegrationWorkers({ env, fetchImpl, log: vi.fn() })).rejects.toBeInstanceOf(AggregateError);
    expect(processing).toEqual(WORKERS.map((worker) => worker.path));
  });
});
