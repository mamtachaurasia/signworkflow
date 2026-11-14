# Compliance & Data Governance

This document summarizes the operational controls implemented for account lifecycle,
retention, legal hold, and audit trail integrity.

## Account Lifecycle

- **Soft delete** marks an account as deleted and inactive.
- **Grace window** allows self‑service restore for a limited time.
- **Last‑owner protection** prevents deleting the final owner of any organization.
- **Memberships disabled** on delete to free seats and prevent access.

Configuration:
- `ACCOUNT_DELETION_GRACE_DAYS` (default 30)

Endpoints:
- `POST /api/user/delete`
- `POST /api/auth/restore`
- `POST /api/auth/restore-google`

## Retention & Legal Hold

- Completed documents are immutable.
- Retention policies can be assigned and enforced.
- Legal holds block deletion and purge while active.

Endpoints:
- `POST /api/retention/policies`
- `PATCH /api/retention/policies/:policyId`
- `DELETE /api/retention/policies/:policyId`
- `POST /api/retention/holds`
- `POST /api/retention/holds/:holdId/release`
- `POST /api/documents/retention-purge`

## Purge Automation

Use a scheduler (cron, EventBridge, Vercel Cron) to run:

- `POST /api/cron/user-purge`  
  Purges soft‑deleted users past the grace window.

- `POST /api/cron/retention-purge`  
  Purges documents after retention expiration.

Authentication:
- `CRON_SECRET` for cron endpoints (send via `x-cron-secret` or `Authorization: Bearer`).
- `RETENTION_ADMIN_TOKEN` or `RETENTION_PURGE_TOKEN` for purge execution.

## Audit Trail Integrity

- Audit events are written via a hash chain to provide tamper‑evident sequencing.
- Configure `AUDIT_LOG_HASH_PEPPER` to strengthen integrity.

## Completion Evidence

- Completed downloads can include:
  - an attached audit trail
  - a completion summary PDF
  - an eSign ID display marker
- The completion summary is evidence output for signer and event details. It is **not** a PKI-backed signing certificate.

## Audit Export

Admins can export audit logs for compliance checks:

- `GET /api/admin/audit/export`
  - Query params: `format=json|csv`, `start`, `end`, `userId`, `orgId`, `documentId`, `limit`, `cursor`
  - Uses `RETENTION_ADMIN_TOKEN` or admin role authorization.

## Operational Scripts

Local or scheduled runs (e.g. cron):

- `npm run purge:users`
- `npm run purge:retention`

These scripts call the underlying API endpoints and should be scheduled according
to your retention and deletion policies.
