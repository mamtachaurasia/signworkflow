# SignWorkflow

SignWorkflow is a full-stack e-signature platform for preparing PDFs, collecting signatures, managing reusable templates, and operating shared workspaces with billing, audit, retention, and governance controls. The repository directory remains `contract-esign` for historical compatibility.

## What This Repo Contains

This repository houses both the user-facing web app and the backend API in a single Next.js codebase.

Core product areas:

- public marketing and pricing pages
- authentication, session refresh, MFA, and account recovery
- document upload, builder, send-for-signing, and signer flows
- reusable templates, a public template library, and bulk-send workflows
- contacts, teams, and workspace member management
- workspace billing and plan gating
- retention policies, legal holds, and purge automation
- audit trail capture, export, and verification
- signed-document cloud export integrations

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- MongoDB with Mongoose
- Redux Toolkit for app state and builder state
- Tailwind CSS v4
- Vitest and Playwright for testing
- Razorpay for India subscription billing and PayPal Advanced Card Payments + Vault for international subscription billing
- AWS S3-compatible storage for document assets

## Architecture Overview

### App structure

- `app/`
  - App Router pages, layouts, and route handlers
  - `app/api/*` contains the backend API surface
- `components/`
  - UI and feature components for marketing, dashboard, account, contacts, templates, and builder flows
- `hooks/`
  - feature hooks, including dedicated builder hooks
- `lib/`
  - domain logic for auth, billing, signing, audit, retention, access control, plans, and integrations
- `models/`
  - Mongoose models for users, documents, signatures, teams, memberships, audit logs, legal holds, and more
- `store/`
  - Redux slices for global app state plus a dedicated document-builder store
- `tests/`
  - unit, UI, route, and integration coverage
- `docs/`
  - operations, compliance, workspace, and admin-role documentation

Developer setup and usage are documented in
[DEVELOPER_INTEGRATIONS.md](docs/DEVELOPER_INTEGRATIONS.md).

### Runtime model

- server-rendered and client-rendered pages live together under the Next.js App Router
- API endpoints are implemented as route handlers under `app/api`
- authenticated app sections use cookie-backed refresh sessions plus in-memory access tokens on the client
- MongoDB stores users, documents, workspace data, audit logs, retention policies, legal holds, and billing webhook state

## Main Product Flows

### Documents and signing

- upload PDFs
- place fields in the builder
- assign recipients and signing order
- send signing requests by email
- complete signing through secure recipient links
- download signed artifacts and completion evidence

### Templates and bulk send

- save repeatable document setups as templates
- manage system and user templates
- send template-based documents in bulk where plan access allows
- expose `/templates` as a public, indexable library for browsing system templates; visitors sign in before creating an editable copy, and the public visibility filter must be verified server-side before broad launch

### Workspaces

The product language uses **Workspace** for the shared business context. Some internal code still uses legacy compatibility names like `Organization`, `orgId`, and `/api/orgs`.

Workspaces cover:

- members and roles
- teams
- billing ownership
- shared templates
- audit visibility
- governance settings
- retention and legal hold policies

See [WORKSPACES.md](/Volumes/Data/contract-esign/docs/WORKSPACES.md) for the full model.

### Billing and plans

Paid workspace plans are:

- `Business`
- `Business Plus`
- `Enterprise`

Billing is dual-provider:

- India domestic billing uses Razorpay with INR plans
- International billing uses PayPal card fields with USD pricing and vaulted renewals
- Shared subscription state, webhook reconciliation, and plan gating run behind both providers

### Governance and compliance

The platform includes:

- tamper-evident audit sequencing
- retention policies
- legal holds
- purge automation
- audit export and verification
- completion evidence outputs

See [COMPLIANCE.md](/Volumes/Data/contract-esign/docs/COMPLIANCE.md) and [OPERATIONS.md](/Volumes/Data/contract-esign/docs/OPERATIONS.md).

## Local Development

Use Node.js 20.19 or newer. The repository records the expected npm version in
`package.json` for reproducible installs.

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

3. Start the app:

```bash
npm run dev
```

4. Open the local URL shown by Next.js.

## Scripts

- `npm run dev` - start the local dev server
- `npm run build` - production build
- `npm run start` - start the production server
- `npm run lint` - run ESLint
- `npm run test:unit` - run unit and UI tests with Vitest
- `npm run test:integration` - run integration coverage
- `npm run test:e2e` - build and run Playwright tests
- `npm run preflight:prod` - run production preflight checks
- `npm run purge:users` - trigger user purge automation
- `npm run purge:retention` - trigger retention purge automation
- `npm run backfill:signing` - backfill signing data
- `npm run backfill:sent-at` - backfill sent timestamps
- `npm run backfill:released-holds` - backfill released legal-hold retention state

## Environment Notes

Important settings used across the app include:

- `MONGODB_URI`
- `NEXT_PUBLIC_BASE_URL`
- `STORAGE_PROVIDER`
- `REFRESH_TOKEN_PEPPER`
- `CRON_SECRET`
- `ACCOUNT_DELETION_GRACE_DAYS`
- `AUDIT_LOG_HASH_PEPPER`
- `SIGNING_TOKEN_ENCRYPTION_KEY`
- `RETENTION_ADMIN_TOKEN`
- `RETENTION_PURGE_TOKEN`
- `CLOUD_CONNECTIONS_ENCRYPTION_KEY`

`SIGNING_TOKEN_ENCRYPTION_KEY` is required in production even when cloud
exports are disabled. It encrypts queued signing invitations and must be a
dedicated 32-byte hex, base64, or plain-text key.

Storage backend variables:

- for `s3`
  - `ACCESS_AWS_KEY_ID`
  - `SECRET_AWS_ACCESS_KEY`
  - `REGION_AWS`
  - `S3_BUCKET_NAME`
- for `r2`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_ENDPOINT` or `R2_ACCOUNT_ID`
  - optional `R2_REGION`
  - `R2_BUCKET_NAME` or `S3_BUCKET_NAME`

Billing-related variables:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_PLAN_BUSINESS_MONTHLY`
- `RAZORPAY_PLAN_BUSINESS_ANNUALLY`
- `RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY`
- `RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY`
- `RAZORPAY_PLAN_ENTERPRISE_MONTHLY`
- `RAZORPAY_PLAN_ENTERPRISE_ANNUALLY`
- `PAYPAL_ENVIRONMENT`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`

International PayPal billing uses Advanced Card Payments with Card Fields and Vault, not hosted PayPal subscription plans. The app computes USD charges from the pricing catalog and stores vaulted card tokens for merchant-managed renewals.

Cloud export provider variables:

- Google Drive
  - `GOOGLE_DRIVE_CLIENT_ID`
  - `GOOGLE_DRIVE_CLIENT_SECRET`
  - optional `GOOGLE_DRIVE_REDIRECT_URI`
- Dropbox
  - `DROPBOX_CLIENT_ID`
  - `DROPBOX_CLIENT_SECRET`
  - optional `DROPBOX_REDIRECT_URI`

## Deployment

The repo includes deployment-oriented files such as:

- `Dockerfile`
- `docker-compose.yml`
- `vercel.json`

Review the docs before production rollout:

- [OPERATIONS.md](/Volumes/Data/contract-esign/docs/OPERATIONS.md)
- [PRODUCTION_CHECKLIST.md](/Volumes/Data/contract-esign/docs/PRODUCTION_CHECKLIST.md)
- [SECURITY.md](/Volumes/Data/contract-esign/SECURITY.md)

## Additional Docs

- [WORKSPACES.md](/Volumes/Data/contract-esign/docs/WORKSPACES.md)
- [COMPLIANCE.md](/Volumes/Data/contract-esign/docs/COMPLIANCE.md)
- [OPERATIONS.md](/Volumes/Data/contract-esign/docs/OPERATIONS.md)
- [ADMIN_ROLES.md](/Volumes/Data/contract-esign/docs/ADMIN_ROLES.md)
- [PRODUCT_ASSESSMENT.md](/Volumes/Data/contract-esign/docs/PRODUCT_ASSESSMENT.md)
- [CURRENT_OFFERING_AND_GAPS.md](/Volumes/Data/contract-esign/docs/CURRENT_OFFERING_AND_GAPS.md)
- [30_DAY_MVP_LAUNCH_PLAN.md](/Volumes/Data/contract-esign/docs/30_DAY_MVP_LAUNCH_PLAN.md)
- [INVESTOR_PITCH_SUMMARY.md](/Volumes/Data/contract-esign/docs/INVESTOR_PITCH_SUMMARY.md)
- [LANDING_PAGE_POSITIONING_COPY.md](/Volumes/Data/contract-esign/docs/LANDING_PAGE_POSITIONING_COPY.md)
- [COMPETITOR_COMPARISON_MATRIX.md](/Volumes/Data/contract-esign/docs/COMPETITOR_COMPARISON_MATRIX.md)
