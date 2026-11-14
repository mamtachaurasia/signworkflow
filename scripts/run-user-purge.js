#!/usr/bin/env node
const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const token =
  process.env.RETENTION_ADMIN_TOKEN ||
  process.env.RETENTION_PURGE_TOKEN ||
  process.env.USER_PURGE_TOKEN;

if (!token) {
  console.error('Missing RETENTION_ADMIN_TOKEN or RETENTION_PURGE_TOKEN for user purge.');
  process.exit(1);
}

const userIds = process.env.USER_IDS ? process.env.USER_IDS.split(',').map((id) => id.trim()).filter(Boolean) : [];
const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

const payload = {
  dryRun,
  ...(Number.isFinite(limit) ? { limit } : {}),
  ...(userIds.length > 0 ? { userIds } : {}),
};

async function run() {
  const response = await fetch(`${baseUrl}/api/admin/users/purge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-retention-token': token,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('User purge failed:', body?.message || response.statusText);
    process.exit(1);
  }

  console.log('User purge result:', JSON.stringify(body, null, 2));
}

run().catch((err) => {
  console.error('User purge failed:', err?.message || err);
  process.exit(1);
});
