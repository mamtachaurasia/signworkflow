# Production Checklist

This checklist is intended to be a repeatable, safe gate before deploying the e-sign application.

**Build & Tests**
- Run unit tests: `npm run test:unit`
- Run integration tests (requires `TEST_MONGODB_URI`): `npm run test:integration`
- Run E2E tests (Playwright): `npm run test:e2e`
- Run production build: `npm run build`

**Environment & Secrets**
- Confirm all required env vars are set in the deployment environment:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL`
  - `NEXT_PUBLIC_BASE_URL`
  - `STORAGE_PROVIDER`
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`
  - `CONTACT_EMAIL`
  - `SALES_EMAIL`
  - `PRESS_EMAIL`
- Confirm storage-provider env vars match the active backend:
  - `STORAGE_PROVIDER` is exactly `s3` or `r2` (a typo is a release failure, not a fallback to S3)
  - for `s3`:
    - `ACCESS_AWS_KEY_ID`
    - `SECRET_AWS_ACCESS_KEY`
    - `REGION_AWS`
    - `S3_BUCKET_NAME`
  - for `r2`:
    - `R2_ACCESS_KEY_ID`
    - `R2_SECRET_ACCESS_KEY`
    - `R2_ENDPOINT` or `R2_ACCOUNT_ID`
    - `R2_BUCKET_NAME` or `S3_BUCKET_NAME`
- Confirm recommended operational env vars are set for production:
  - `ADMIN_BOOTSTRAP_TOKEN`
  - `CRON_SECRET`
  - `RETENTION_ADMIN_TOKEN` or `RETENTION_PURGE_TOKEN`
  - `ACCOUNT_DELETION_GRACE_DAYS`
  - `AUDIT_LOG_HASH_PEPPER`
  - `SIGNING_TOKEN_ENCRYPTION_KEY` (a dedicated 32-byte key; required even when cloud exports are disabled)
- Confirm no real secrets are committed to the repo (use secret scanning in CI).
- Confirm production values differ from local `.env`.

**Storage & File Integrity**
- Verify storage credentials and bucket access for the active backend.
- Confirm objects are written with immutable keys and expected ACLs.
- Validate PDF hashes on a sampled signed document.
- Before removing any legacy template volume, run `npm run migrate:template-artifacts -- --dry-run`, then the migration, and resolve every skipped/failed result (including oversized PDFs and partial artifact metadata). Templates are capped at 25 MiB for use/copy operations.
- Sample template upload (PDF and DOCX), customize/copy, editable-content save, download, Use, and hard delete against the active S3/R2 backend.
- When provisioning a new environment, run `npm run seed:system-templates`, then confirm every category has a ready-to-use system template and that each generated signing field appears on its execution page.

**Email Delivery**
- Verify SMTP credentials work in the deployment environment.
- Send a test signing email and confirm delivery.
- Confirm bounce/failed delivery handling is visible in logs or alerts.

**External Help Center**
- Confirm the dashboard `Contact support` icon opens the authenticated support handoff and lands at `https://support.signworkflow.com/create` after sign-in.
- Test knowledge-base search, ticket creation, customer replies, staff replies, and attachments in the independently deployed support application.
- Run the standalone support repository's preflight, tests, backup-restore drill, and email-outbox checks before releasing it.
- Confirm the main product deployment contains no support database, desk, portal, or shared support-service credentials.
- Confirm the MongoDB-backed `rate_limit_counters` TTL index exists in production; contact intake fails closed if the shared counter is unavailable. The in-memory counter is for local or development use only.
- On Vercel, use its edge-provided client IP header. For self-hosting, set `TRUSTED_PROXY_IP_HEADER` only to a header the reverse proxy always overwrites, and prevent direct access to the app origin.

**Audit & Compliance**
- Confirm signed documents are immutable and locked.
- Confirm completed documents cannot be reopened or altered.
- Confirm audit trail and signing events persist and are exported correctly.
- Confirm retention policy is documented and enforced.

**Data Safety**
- Verify backups for MongoDB are enabled and tested.
- Verify retention purge policy is documented and scheduled.
- Confirm the retention purge is limited to compliance-approved windows.
- If your production data includes legal holds released before the retention recompute fix, run `npm run backfill:released-holds` until `remainingCandidates: 0`.
- Confirm cron schedules are configured for `/api/cron/user-purge`, `/api/cron/retention-purge`, `/api/cron/webhook-deliveries`, `/api/cron/cloud-exports`, `/api/cron/signing-emails`, and `/api/cron/integration-outbox`.
- If deploying on Vercel, confirm the production deployment picked up [vercel.json](/Volumes/Data/contract-esign/vercel.json) and that `CRON_SECRET` is set in the production environment.
- If deploying on Amplify, confirm EventBridge Scheduler is configured and the relay Lambda in [amplify-cron-relay.mjs](/Volumes/Data/contract-esign/scripts/amplify-cron-relay.mjs) has `BASE_URL` and `CRON_SECRET` set correctly.

**Security**
- Validate JWT secret length and rotation policy.
- Ensure cookies are `httpOnly` and `secure` in production.
- Confirm signing tokens are never returned to clients.
- Verify soft-deleted completed documents remain immutable.

**Observability**
- Confirm structured error logs are enabled.
- Confirm `NEXT_PUBLIC_GA_MEASUREMENT_ID` or `GA_MEASUREMENT_ID` is set if Google Analytics reporting is required.
- Confirm alerts exist for signing failures and email delivery failures.
- Confirm request tracing or correlation IDs are present in logs.

**Release & Rollback**
- Tag the release and record the build artifact.
- Prepare a rollback plan (previous build + DB snapshot).
- Verify a rollback does not break document lineage or hashes.

If you want, add this checklist to CI as a required gate before deployment.

**Support Shared Login and RBAC**

- Keep SUPPORT_SSO_SECRET identical and dedicated to the main/support handoff.
- The main app is the only login authority. Customer handoffs use the customer
  purpose; support-desk handoffs use the staff purpose and return to /desk.
- Deploy the main app before the support app when introducing the purpose
  claim. The new support verifier rejects older handoffs without it.
- A successful main-app login is not sufficient for desk access. The support
  database must contain an active SupportStaff allowlist entry, bound to the
  stable main-app user ID on first verified login.
- Confirm owner-only management returns 403 to agents. Confirm customer
  handoffs cannot create a staff session and staff handoffs cannot create a
  customer session.
- Smoke test: customer dashboard support link, direct customer support SSO,
  initial owner bootstrap then main-login binding, invited agent activation,
