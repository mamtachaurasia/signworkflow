# Operations

This guide focuses on production configuration for environment variables and
cron scheduling for automated purge jobs.

## Environment Configuration

Required for production:
- `MONGODB_URI`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_BASE_URL`
- `JWT_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Required storage configuration:
- `STORAGE_PROVIDER`
- for `s3`:
  - `ACCESS_AWS_KEY_ID`
  - `SECRET_AWS_ACCESS_KEY`
  - `REGION_AWS`
  - `S3_BUCKET_NAME`
- for `r2`:
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_ENDPOINT` or `R2_ACCOUNT_ID`
  - optional `R2_REGION` (defaults to `auto`)
  - `R2_BUCKET_NAME` or `S3_BUCKET_NAME`

Operational security and compliance:
- `ADMIN_BOOTSTRAP_TOKEN` (one-time admin bootstrap)
- `CRON_SECRET` (auth for cron endpoints)
- `RETENTION_ADMIN_TOKEN` or `RETENTION_PURGE_TOKEN` (purge execution)
- `ACCOUNT_DELETION_GRACE_DAYS` (default 30)
- `AUDIT_LOG_HASH_PEPPER` (audit chain integrity)
- `SIGNING_TOKEN_ENCRYPTION_KEY` (required; encrypts queued signing invitations)

Billing:
- Dual-provider billing is required in this release.
- India domestic billing uses Razorpay in INR:
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
  - `RAZORPAY_PLAN_BUSINESS_MONTHLY`
  - `RAZORPAY_PLAN_BUSINESS_ANNUALLY`
  - `RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY`
  - `RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY`
  - `RAZORPAY_PLAN_ENTERPRISE_MONTHLY`
  - `RAZORPAY_PLAN_ENTERPRISE_ANNUALLY`
  - Optional: `RAZORPAY_SUBSCRIPTION_EXPIRE_MINUTES`
- International billing uses PayPal in USD:
  - `PAYPAL_ENVIRONMENT`
  - `PAYPAL_CLIENT_ID`
  - `PAYPAL_CLIENT_SECRET`
  - `PAYPAL_WEBHOOK_ID`
  - PayPal Advanced Card Payments must be enabled
  - PayPal Vault must be enabled on the same app

Cloud export integrations:
- Optional, but required to enable Business cloud exports to third-party providers
- Shared requirement:
  - `CLOUD_CONNECTIONS_ENCRYPTION_KEY`
- Google Drive:
  - `GOOGLE_DRIVE_CLIENT_ID`
  - `GOOGLE_DRIVE_CLIENT_SECRET`
  - optional `GOOGLE_DRIVE_REDIRECT_URI`
- Dropbox:
  - `DROPBOX_CLIENT_ID`
  - `DROPBOX_CLIENT_SECRET`
  - optional `DROPBOX_REDIRECT_URI`

India plan mapping:
- `RAZORPAY_PLAN_BUSINESS_MONTHLY`
  - Business tier billed monthly
  - First paid organization workspace
  - Enables organization workspace, member roles, invites, one team, shared templates, and audit trail
- `RAZORPAY_PLAN_BUSINESS_ANNUALLY`
  - Same Business feature set, billed annually
- `RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY`
  - Business Plus tier billed monthly
  - Adds multiple teams, org branding, org-wide defaults, notification rules, retention policies, and deeper admin governance
- `RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY`
  - Same Business Plus feature set, billed annually
- `RAZORPAY_PLAN_ENTERPRISE_MONTHLY`
  - Enterprise tier billed monthly
  - Adds legal holds, audit export/verification, and the highest packaged governance tier
- `RAZORPAY_PLAN_ENTERPRISE_ANNUALLY`
  - Same Enterprise feature set, billed annually

International pricing:
- USD prices are resolved from the app pricing catalog at checkout time.
- PayPal does not need per-plan subscription IDs in this release.
- Renewals are merchant-managed against the vaulted card token.

## Billing Operations

Current rollout:
1. Create Razorpay plans in the dashboard for India pricing:
   - Business monthly
   - Business annually
   - Business Plus monthly
   - Business Plus annually
   - Enterprise monthly
   - Enterprise annually
2. Enable PayPal Advanced Card Payments and Vault for the international app:
   - confirm card fields are eligible in the target environment
   - confirm vaulting is enabled on the same app
   - confirm the app is allowed to process merchant-managed recurring charges
3. Copy the India plan ids into the corresponding `RAZORPAY_PLAN_*` env vars.
4. Copy the PayPal app credentials and webhook id into `PAYPAL_*`.
5. Point both provider webhooks to `POST /api/subscription/webhook`.
6. Subscribe PayPal to `VAULT.PAYMENT-TOKEN.CREATED`, `VAULT.PAYMENT-TOKEN.DELETED`, and `VAULT.PAYMENT-TOKEN.DELETION-INITIATED`.
7. Ensure the billing renewal cron is enabled for `/api/cron/billing-renewals`.
8. Use the account Subscription page for owner-driven renewal cancellation, resume, and paid-plan upgrades.

## Cloud Integration Operations

SignWorkflow supports personal and workspace-owned Google Drive/Dropbox OAuth connections. Members connect their own account from `My Account -> Integrations` for manual exports or automatic rules in Cloud Library; personal jobs verify the rule owner's document access. Administrators configure separate workspace-owned destinations from `My Account -> Cloud Storage`. Those archives intentionally include all finalized workspace documents and do not depend on the administrator's personal connection or document visibility.

Operational notes:
1. Set `CLOUD_CONNECTIONS_ENCRYPTION_KEY` before enabling any cloud provider in production.
2. Register OAuth callbacks that point back to your deployed app:
   - `/api/cloud/oauth/google_drive/callback`
   - `/api/cloud/oauth/dropbox/callback`
3. Prefer least-privilege scopes:
   - Google Drive uses app-created file access
   - Dropbox should be configured for the narrowest app access your app registration supports
4. Cloud exports are tracked with audit events:
   - `cloud.connection.connect_started`
   - `cloud.connection.connected`
   - `cloud.connection.disconnected`
   - `cloud.export.completed`
   - `cloud.auto_export.rule_updated`
5. Automatic exports use persistent retryable jobs. Run `/api/cron/cloud-exports` frequently so pending and failed jobs are processed promptly.
6. Webhook deliveries use a separate persistent queue. Run `/api/cron/webhook-deliveries` on the same worker cadence.
7. Workspace OAuth results are displayed on the Cloud Storage page, including provider rejection and expired or invalid state. Investigate a callback error before retrying the connection; do not treat a redirect alone as a successful connection.

## Integration Recovery Rollout And Checks

The following recovery runbook targets the eight branches in [the completion checklist](CURRENT_OFFERING_AND_GAPS.md#exports-and-apis-completion-checklist). Merge and deploy the relevant implementation before using a new route or script. A branch passing tests does not establish production readiness.

1. Merge `fix/audit-chain-concurrency` before `fix/durable-integration-outbox`, then `fix/signing-email-recovery`; these branches include the preceding dependency to preserve their shared atomic writes and conflict resolutions. Audit verification, recovery history, and OpenAPI can merge independently. Deploy these implementations before enabling `fix/integration-worker-configuration`; its readiness check expects all four worker routes below. Update all application instances before testing concurrent audit writes so older writers do not bypass the new append protocol.
2. Preserve `CLOUD_CONNECTIONS_ENCRYPTION_KEY`. It protects OAuth credentials, webhook secrets, and the new persisted signing-email tokens. Changing it without a migration makes existing encrypted work unreadable. Configure SMTP and document storage before sending a recovery test.
3. Set the same strong `CRON_SECRET` in the deployed production application and the repository's GitHub Actions secrets. Redeploy after changing the hosting environment. Set the optional `SIGNWORKFLOW_BASE_URL` repository variable to the HTTPS deployment origin (default `https://signworkflow.com`). Never print or commit the secret.
4. From a trusted operator environment with these variables loaded, run the non-mutating readiness check:

   ```bash
   node scripts/run-integration-workers.mjs --check-only
   ```

   It sends authenticated `POST {"limit":0}` probes, expects `400 Invalid worker options.` from every route, and does not claim jobs or send messages. A `500 CRON_SECRET is not configured` means the deployed app lacks the secret; `401` means the supplied and deployed credentials do not match; `404` commonly means a required route has not been deployed. The check reports route/status information without printing credentials.
5. After readiness succeeds, run **Integration workers** manually in GitHub Actions, then inspect scheduled runs. The runner processes the outbox before delivering webhooks/cloud exports/signing emails; a processing failure is reported without preventing the other independent queues from draining. A readiness failure stops processing until configuration is corrected.
6. Use a controlled workspace to upload, prepare, send, sign, and download a document. Confirm the expected signed webhook and both authorized personal/workspace archives. Test a receiver returning `503`, then restore it and confirm retry or replay. Interrupt a signing-email worker in a test environment and verify recovery preserves a valid signing link. Confirm filtered/paginated history and the full audit verification result.

On 2026-09-21, fresh readiness probes passed for webhook delivery and cloud export, and the latest five GitHub worker runs succeeded ([latest inspected run](https://github.com/rajinweb/signworkflow/actions/runs/35526720746)). The earlier missing-secret failure is no longer reproduced. The new outbox and signing-email endpoints still return `404` pending deployment. After merging/deploying those branches, rerun all four probes and real delivery checks; successful existing workers do not prove the new recovery flows are live.

### Recovery guarantees and limits

- Document lifecycle and automatic archive completion events persist their integration intent in the same document/job write. `/api/cron/integration-outbox` repairs request interruptions and independent enqueue failures; a stable event ID makes repeat enqueue safe. Consumers still need event-ID deduplication because webhook delivery is at least once. Existing history without a persisted intent is not automatically reconstructed.
- Signing dispatches persist encrypted delivery work before SMTP. `/api/cron/signing-emails` retries failures and reclaims expired leases. Retries keep the same signing token and message identity, but SMTP cannot guarantee exactly-once delivery: acceptance followed by an interrupted database acknowledgement can send a duplicate email. The manual retry endpoint also supports older failed sends without a durable token by issuing a replacement credential.
- Webhook and archive history offers status/date filters and cursor pagination. Webhook attempts remain visible across manual replay, including interrupted attempts. Inspect failures/dead letters regularly and fix the underlying receiver, provider, permission, or credential issue before replaying.
- New audit appends serialize concurrent successors without requiring a MongoDB transaction/replica-set migration. Keep `AUDIT_LOG_HASH_PEPPER` stable and protected. Verification reads all pages of matching accessible chains; unsigned legacy entries or inaccessible history produce an incomplete result, not a false verification claim. Existing corrupted history is not silently rewritten or repaired.

## Signing Delivery Encryption

`SIGNING_TOKEN_ENCRYPTION_KEY` is required in production regardless of whether
Google Drive or Dropbox is enabled. It encrypts short-lived signing tokens held
only in the durable email queue until the invitation is delivered. Use a
dedicated 32-byte hexadecimal, base64, or plain-text key and retain it until
all deliveries encrypted with it have completed or expired. It is intentionally
separate from `CLOUD_CONNECTIONS_ENCRYPTION_KEY`, which remains optional unless
cloud providers are enabled.

## Document Storage Operations

SignWorkflow supports two document-storage backends:

- `s3`
- `r2`

Behavior:

- `s3` preserves the existing AWS S3 flow
- `r2` uses Cloudflare R2 through its S3-compatible API
- the active backend is selected through `STORAGE_PROVIDER` (exactly `s3` or `r2`; an invalid value fails startup/request handling rather than falling back to S3)
- existing code continues to use the shared storage wrapper in `lib/s3.ts`

Recommended config:

### AWS S3

- `STORAGE_PROVIDER=s3`
- `ACCESS_AWS_KEY_ID`
- `SECRET_AWS_ACCESS_KEY`
- `REGION_AWS`
- `S3_BUCKET_NAME`

### Cloudflare R2

- `STORAGE_PROVIDER=r2`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT` or `R2_ACCOUNT_ID`
- optional `R2_REGION=auto`
- `R2_BUCKET_NAME`

Compatibility note:

- R2 is S3-compatible for the object operations used by this app, but it is still a separate backend with its own credentials and endpoint configuration.

### Template artifact migration

Template PDFs, uploaded DOC/DOCX source files, converted PDFs, scratch-template PDFs, and customized copies are stored as immutable S3/R2 objects. The database stores the provider, bucket, region, and opaque key for each template's primary PDF and optional original source; browsers continue to use the authorized `/api/templates/:id` URL and never receive bucket keys.

Before deploying this change to an environment with pre-existing templates, run the migration after the selected storage backend is configured:

```bash
npm run migrate:template-artifacts -- --dry-run
npm run migrate:template-artifacts
```

The migration scans every template so it can report malformed/partial artifact metadata as well as missing legacy files. It reads only legacy files under `uploads/` and `public/system-templates/`, rejects files over 25 MiB before parsing or upload, validates PDFs, uploads immutable artifacts, updates each record atomically, and removes its legacy `filePath` only after the database update succeeds. When a valid DOC/DOCX source artifact already exists, the migration preserves it while repairing the PDF reference. It reports unrecoverable, oversized, or partial records and exits non-zero so they can be restored or re-uploaded deliberately. Historical DOC/DOCX originals that were discarded by the old conversion flow cannot be reconstructed; their migrated source points to the retained PDF.

Do not remove the old local artifact volume until the dry run reports no skipped or failed templates and sampled template downloads, duplicate/customize, Use, and editable-content saves succeed from the configured object store.

### Curated system template catalog

The professional system library is seeded from a versioned, data-driven catalog. It contains ready-to-use, editable templates for every supported category (HR, Legal, Sales, Finance, and Other), each with reusable roles and saved signing fields.

```bash
npm run seed:system-templates
```

The command is safe to rerun. Unchanged definitions do not write new objects; a changed definition writes a new immutable PDF, updates the system record, then best-effort removes the superseded artifact. The legacy command below remains available when only the Mutual NDA is required:

```bash
npm run seed:professional-template
```

Curated templates are general starting points, not jurisdiction-specific legal, tax, employment, or compliance advice. Review each template for the intended transaction and obtain qualified local advice where appropriate.

## One-Time Retention Repair

If your production database contains documents whose legal hold was released before the retention recompute fix shipped, run the released-hold backfill once.

The backfill targets only documents where:
- `retention.status` is still `on_hold`
- `legalHold.status` is missing or `none`
- `legalHold.holdIds` is empty or missing

Recommended dry-run first:
```bash
DRY_RUN=1 LIMIT=100 npm run backfill:released-holds
```

Run the repair batch:
```bash
LIMIT=200 npm run backfill:released-holds
```

Optional scoped runs:
```bash
ORG_ID=<organization-id> LIMIT=200 npm run backfill:released-holds
DOCUMENT_IDS=<doc-id-1>,<doc-id-2> npm run backfill:released-holds
```

The runner calls:
- `/api/retention/holds/backfill-released`

Authentication:
- `RETENTION_ADMIN_TOKEN`
- or `RETENTION_PURGE_TOKEN`

Repeat the batch until the response reports `remainingCandidates: 0`.

## Scheduling Cron Jobs

### Option A: HTTP cron (recommended for serverless)

Schedule POST requests to:

- `/api/cron/billing-renewals`
- `/api/cron/user-purge`
- `/api/cron/retention-purge`
- `/api/cron/webhook-deliveries`
- `/api/cron/cloud-exports`
- `/api/cron/signing-emails`
- `/api/cron/integration-outbox`
- `/api/cron/trial-expiration-emails`

For Vercel production deployments, these schedules are declared in
[vercel.json](../vercel.json):

- `/api/cron/billing-renewals` at `0 1 * * *` UTC
- `/api/cron/user-purge` at `0 2 * * *` UTC
- `/api/cron/retention-purge` at `30 2 * * *` UTC
- `/api/cron/webhook-deliveries` at `0 3 * * *` UTC
- `/api/cron/cloud-exports` at `30 3 * * *` UTC
- `/api/cron/signing-emails` at `0 4 * * *` UTC
- `/api/cron/integration-outbox` at `30 4 * * *` UTC
- `/api/cron/trial-expiration-emails` at `0 5 * * *` UTC

All Vercel schedules run at most once per day so the project can deploy on a
Hobby account. They are recovery sweeps, not the primary integration worker.
The repository's [integration worker workflow](../.github/workflows/integration-workers.yml)
processes webhook delivery, cloud export, signing-email, and integration-outbox
queues every five minutes. Configure the GitHub Actions secret
`CRON_SECRET` with the same value used by the deployed app. Optionally configure
the repository variable `SIGNWORKFLOW_BASE_URL`; it defaults to
`https://signworkflow.com` when omitted. Scheduled workflows run from the
default branch, so this worker becomes active after the change is merged.

The cron routes accept both `GET` and `POST`, so they work with Vercel cron as well as manual `curl` or external job-runner triggers.

Each request must include `CRON_SECRET` via `x-cron-secret` or `Authorization: Bearer`.

Example `curl` calls:

```bash
curl -fsS -X POST "https://your-app.example/api/cron/user-purge" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"

curl -fsS -X POST "https://your-app.example/api/cron/billing-renewals" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"

curl -fsS -X POST "https://your-app.example/api/cron/retention-purge" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"

curl -fsS -X POST "https://your-app.example/api/cron/webhook-deliveries" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}'

curl -fsS -X POST "https://your-app.example/api/cron/cloud-exports" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":5}'

curl -fsS -X POST "https://your-app.example/api/cron/signing-emails" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}'

curl -fsS -X POST "https://your-app.example/api/cron/integration-outbox" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":10}'
```

Example crontab (daily lifecycle jobs and five-minute recovery workers):
```bash
0 1 * * * BASE_URL=https://your-app.example CRON_SECRET=... curl -fsS -X POST "$BASE_URL/api/cron/billing-renewals" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d "{}"
0 2 * * * BASE_URL=https://your-app.example CRON_SECRET=... curl -fsS -X POST "$BASE_URL/api/cron/user-purge" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d "{}"
30 2 * * * BASE_URL=https://your-app.example CRON_SECRET=... curl -fsS -X POST "$BASE_URL/api/cron/retention-purge" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d "{}"
*/5 * * * * BASE_URL=https://your-app.example CRON_SECRET=... curl -fsS -X POST "$BASE_URL/api/cron/webhook-deliveries" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":10}'
*/5 * * * * BASE_URL=https://your-app.example CRON_SECRET=... curl -fsS -X POST "$BASE_URL/api/cron/cloud-exports" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":5}'
*/5 * * * * BASE_URL=https://your-app.example CRON_SECRET=... curl -fsS -X POST "$BASE_URL/api/cron/signing-emails" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":10}'
*/5 * * * * BASE_URL=https://your-app.example CRON_SECRET=... curl -fsS -X POST "$BASE_URL/api/cron/integration-outbox" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":10}'
```

Use the actual Node executable and checkout path on the host. The protected
file supplies `CRON_SECRET` and optionally `SIGNWORKFLOW_BASE_URL`; retain the
separate daily billing and retention schedules.

### Option B: CLI scripts (runs from a host or job runner)

Use the provided scripts:
- `npm run purge:users`
- `npm run purge:retention`

Example crontab using an env file:
```bash
0 2 * * * . /etc/contract-esign.env && cd /opt/contract-esign && npm run purge:users
30 2 * * * . /etc/contract-esign.env && cd /opt/contract-esign && npm run purge:retention
```

Adjust the schedule to match your retention policy and compliance window.

### Option C: AWS Amplify Hosting with EventBridge Scheduler

Amplify Hosting does not provide repo-defined runtime cron execution for your deployed Next.js app. For Amplify, the recommended pattern is:

1. EventBridge Scheduler triggers a small Lambda function.
2. The Lambda function calls your Amplify app cron endpoints:
   - `/api/cron/user-purge`
   - `/api/cron/retention-purge`
   - `/api/cron/webhook-deliveries`
   - `/api/cron/cloud-exports`
   - `/api/cron/signing-emails`
   - `/api/cron/integration-outbox`

Use the provided Lambda relay in [amplify-cron-relay.mjs](../scripts/amplify-cron-relay.mjs).

Recommended Lambda environment variables:
- `BASE_URL=https://main.d2zr3wrdtex6la.amplifyapp.com`
- `CRON_SECRET=<same production CRON_SECRET used by the app>`
- `CRON_RELAY_TIMEOUT_MS=20000` (optional)

Example EventBridge Scheduler payloads:
```json
{ "path": "/api/cron/user-purge" }
```

```json
{ "path": "/api/cron/retention-purge" }
```

```json
{ "path": "/api/cron/webhook-deliveries", "method": "POST", "body": { "limit": 10 } }
```

```json
{ "path": "/api/cron/cloud-exports", "method": "POST", "body": { "limit": 5 } }
```

```json
{ "path": "/api/cron/signing-emails", "method": "POST", "body": { "limit": 10 } }
```

```json
{ "path": "/api/cron/integration-outbox", "method": "POST", "body": { "limit": 10 } }
```

Example schedule expressions:
- `cron(0 2 * * ? *)` for user purge
- `cron(30 2 * * ? *)` for retention purge
- `cron(* * * * ? *)` for webhook deliveries, cloud exports, signing emails,
  and integration outbox recovery

Example AWS CLI schedule creation using a Lambda target:
```bash
aws scheduler create-schedule \
  --name contract-esign-user-purge \
  --schedule-expression "cron(0 2 * * ? *)" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target '{
    "Arn":"arn:aws:lambda:ap-south-1:123456789012:function:contract-esign-amplify-cron-relay",
    "RoleArn":"arn:aws:iam::123456789012:role/service-role/contract-esign-scheduler-role",
    "Input":"{\"path\":\"/api/cron/user-purge\"}"
  }'

aws scheduler create-schedule \
  --name contract-esign-retention-purge \
  --schedule-expression "cron(30 2 * * ? *)" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target '{
    "Arn":"arn:aws:lambda:ap-south-1:123456789012:function:contract-esign-amplify-cron-relay",
    "RoleArn":"arn:aws:iam::123456789012:role/service-role/contract-esign-scheduler-role",
    "Input":"{\"path\":\"/api/cron/retention-purge\"}"
  }'
```

For this pattern, make sure:
- the Lambda execution role can write logs to CloudWatch
- the EventBridge Scheduler execution role can invoke the Lambda
- `CRON_SECRET` is identical between the Amplify app and the relay Lambda
