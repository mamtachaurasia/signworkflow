#!/usr/bin/env node
const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const token =
  process.env.RETENTION_PURGE_TOKEN ||
  process.env.RETENTION_ADMIN_TOKEN;

if (!token) {
  console.error('Missing RETENTION_PURGE_TOKEN or RETENTION_ADMIN_TOKEN for retention purge.');
  process.exit(1);
}

const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
const retentionBefore = process.env.RETENTION_BEFORE || undefined;
const retentionYears = process.env.RETENTION_YEARS ? Number(process.env.RETENTION_YEARS) : undefined;

const payload = {
  dryRun,
  ...(Number.isFinite(limit) ? { limit } : {}),
  ...(retentionBefore ? { retentionBefore } : {}),
  ...(Number.isFinite(retentionYears) ? { retentionYears } : {}),
};

async function run() {
  const response = await fetch(`${baseUrl}/api/documents/retention-purge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-retention-token': token,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Retention purge failed:', body?.message || response.statusText);
    process.exit(1);
  }

  console.log('Retention purge result:', JSON.stringify(body, null, 2));
}

run().catch((err) => {
  console.error('Retention purge failed:', err?.message || err);
  process.exit(1);
});
