import { pathToFileURL } from 'node:url';

export const WORKERS = [
  { path: '/api/cron/integration-outbox', limit: 10 },
  { path: '/api/cron/webhook-deliveries', limit: 10 },
  { path: '/api/cron/cloud-exports', limit: 5 },
  { path: '/api/cron/signing-emails', limit: 10 },
];

export async function runIntegrationWorkers({ env = process.env, fetchImpl = fetch, checkOnly = false, log = console.log } = {}) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) throw new Error('CRON_SECRET is missing. Set the same secret in production and GitHub Actions, then redeploy.');
  const base = new URL(env.SIGNWORKFLOW_BASE_URL || 'https://signworkflow.com');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('SIGNWORKFLOW_BASE_URL must be an HTTPS origin without credentials, a path, or query parameters.');
  }
  const invoke = async (worker, limit) => {
    const response = await fetchImpl(new URL(worker.path, base), {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }), signal: AbortSignal.timeout(55_000),
    });
    if (limit === 0) {
      // Worker routes authenticate before parsing options. Invalid input proves
      // authorization without claiming jobs or sending customer messages.
      const body = await response.json().catch(() => ({}));
      if (response.status === 400 && body.message === 'Invalid worker options.') return;
      if (response.status === 500 && body.message === 'CRON_SECRET is not configured') {
        throw new Error(`${worker.path}: production CRON_SECRET is missing; set it and redeploy.`);
      }
      throw new Error(`${worker.path}: readiness returned HTTP ${response.status}; check deployment, matching secrets, and endpoint availability.`);
    }
    if (!response.ok) throw new Error(`${worker.path}: HTTP ${response.status}`);
    log(`${worker.path}: processed successfully`);
  };
  const readiness = await Promise.allSettled(WORKERS.map((worker) => invoke(worker, 0)));
  const unready = readiness.filter((result) => result.status === 'rejected');
  if (unready.length) throw new AggregateError(unready.map((result) => result.reason), 'Integration worker readiness checks failed.');
  if (checkOnly) { log('Integration worker configuration verified; no jobs processed.'); return; }
  const failures = [];
  // Fan out new events first; a failure must not stop independent queues from
  // draining their already-durable work.
  try { await invoke(WORKERS[0], WORKERS[0].limit); } catch (error) { failures.push(error); }
  const deliveries = await Promise.allSettled(WORKERS.slice(1).map((worker) => invoke(worker, worker.limit)));
  for (const result of deliveries) if (result.status === 'rejected') failures.push(result.reason);
  if (failures.length) throw new AggregateError(failures, 'One or more integration workers failed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runIntegrationWorkers({ checkOnly: process.argv.includes('--check-only') }).catch((error) => {
    for (const failure of error instanceof AggregateError ? error.errors : [error]) {
      console.error(failure instanceof Error ? failure.message : 'Integration worker failed.');
    }
    process.exitCode = 1;
  });
}
