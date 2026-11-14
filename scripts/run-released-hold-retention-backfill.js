#!/usr/bin/env node
const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.RETENTION_ADMIN_TOKEN || process.env.RETENTION_PURGE_TOKEN;

if (!token) {
  console.error('Missing RETENTION_ADMIN_TOKEN or RETENTION_PURGE_TOKEN for released-hold retention backfill.');
  process.exit(1);
}

const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
const orgId = process.env.ORG_ID || undefined;
const documentIds = process.env.DOCUMENT_IDS
  ? process.env.DOCUMENT_IDS.split(',').map((item) => item.trim()).filter(Boolean)
  : undefined;

const payload = {
  dryRun,
  ...(Number.isFinite(limit) ? { limit } : {}),
  ...(orgId ? { orgId } : {}),
  ...(documentIds && documentIds.length > 0 ? { documentIds } : {}),
};

async function run() {
  const response = await fetch(`${baseUrl}/api/retention/holds/backfill-released`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-retention-token': token,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Released-hold retention backfill failed:', body?.message || response.statusText);
    process.exit(1);
  }

  console.log('Released-hold retention backfill result:', JSON.stringify(body, null, 2));
}

run().catch((err) => {
  console.error('Released-hold retention backfill failed:', err?.message || err);
  process.exit(1);
});
