# Security Policy

## Supported Versions

We support the latest `main` branch and the most recent production release.

## Reporting a Vulnerability

Email security issues to `support@signworkflow.com` with `[SECURITY]` at the
start of the subject. Include a short reproduction, affected URL or feature,
potential impact, and a safe way to contact you. We target acknowledgement
within one business day during our published support hours.

Do not include passwords, signing tokens, private keys, or live customer
documents. Use a sanitized sample and wait for secure-transfer instructions if
the report requires sensitive evidence. Please do not access, change, retain,
or disclose data that does not belong to you.

## Account Deletion & Restoration

- Account deletion is **soft delete** with a grace period (default 30 days).
- During the grace window, users can restore their account using `/api/auth/restore`
  (or `/api/auth/restore-google` for Google sign-in).
- Deletion grace is configured with `ACCOUNT_DELETION_GRACE_DAYS`.
- After the grace window, automated purge anonymizes user data and revokes sessions.

## Retention & Legal Hold

- Completed documents are immutable.
- Retention policies can be configured and enforced with `/api/documents/retention-purge`.
- Legal holds block deletion and retention purge until released.

## Audit Trail Integrity

- System audit logs use a hash chain to provide tamper‑evident sequencing.
- Configure `AUDIT_LOG_HASH_PEPPER` to harden audit log integrity.

## Operational Jobs (Recommended)

Schedule these jobs (daily or weekly, depending on policy):

- `npm run purge:users` — purge soft‑deleted users after the grace period.
- `npm run purge:retention` — purge documents whose retention window has ended.

Cron endpoints:
- `POST /api/cron/user-purge`
- `POST /api/cron/retention-purge`
- `POST /api/cron/webhook-deliveries`
- `POST /api/cron/cloud-exports`
- `POST /api/cron/signing-emails`
- `POST /api/cron/integration-outbox`
- `POST /api/cron/trial-expiration-emails`

Set `CRON_SECRET` and include it via `x-cron-secret` or `Authorization: Bearer`.

Audit export:
- `GET /api/admin/audit/export` (admin or retention token required)
