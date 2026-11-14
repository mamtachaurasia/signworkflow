# Current Offering And Gaps

Last source review: 2026-09-21. This is a code-based assessment, not proof that every dependency, operational control, customer claim, or legal/compliance statement is live in production. The baseline below describes merged source; the separate branch checklist records integration work that still requires merge, deployment, and production verification.

## Current Offering

| Area | What is supported in the source today | Positioning boundary |
| --- | --- | --- |
| Document workflows | PDF upload, field placement, recipients, signing order, email delivery paths, secure signer links, signed downloads, and completion evidence | Validate deliverability, signer experience, and failure handling in production before calling the flow broadly proven. |
| Workspaces and governance | Members, teams, roles, audit-oriented records, retention policies, legal holds, purge jobs, and plan gates | Describe these as product controls; do not equate them with an independent compliance certification. |
| AI review | Access- and entitlement-gated document summaries, selected-text summaries, translations, clause explanations, risk analysis, and template writing assistance | AI is review assistance, not legal advice. The footer's outbound “Ask AI” links are separate research prompts, not product functionality. |
| Templates | System and user templates, editable content, predefined recipient roles and fields, bulk send, and a public `/templates` library whose UI presents system templates | The public root page is indexable; nested `/templates/` workspace routes remain blocked from crawling. Visitors sign in to make editable copies. |
| Cloud workflows | Google Drive and Dropbox connections, manual and automatic signed-PDF exports, destination folders, retryable/idempotent export jobs, personal OAuth connections, and administrator-managed workspace archive destinations | Personal exports check document access. Workspace archives deliberately cover the workspace and use separate workspace-owned credentials. No other native cloud provider is implied. |
| Developer integrations | Scoped document API keys with expiry, IP allowlists, rate limits and bounded-overlap rotation; headless PDF preparation and sending; signed webhooks with pause/resume, secret rotation, retry/replay, and versioned events | The public API is shipped in source at `/api/v1`, not a planning-only connector. Embedded signing and native CRM connectors are not provided. Production workers and end-to-end delivery remain operational responsibilities. |
| Commercial platform | Trial and paid workspace plans, Razorpay domestic billing, PayPal international billing, plan gating, and renewal/webhook code | Live payment behavior and renewal recovery must be verified in the target production environment. |
| Public acquisition and trust surface | Public template-library discovery, sitemap/robots alignment, canonical redirects, outbound AI research prompts, and Trustpilot/Product Hunt review forms | The review links are an intentional post-launch proof-acquisition path. Do not represent ratings, testimonials, customer logos, or certifications until they exist and are verified. |

## Exports And APIs Completion Checklist

These are implementation branches, not a declaration that production has been upgraded. See [Developer Integrations](DEVELOPER_INTEGRATIONS.md) for usage and [Operations](OPERATIONS.md#integration-recovery-rollout-and-checks) for rollout checks.

| Gap | Implementation branch | Acceptance requirement |
| --- | --- | --- |
| Worker configuration and deployment diagnostics | `fix/integration-worker-configuration` | All four authenticated readiness probes pass; GitHub scheduled runs and daily fallback sweeps succeed. |
| Durable event enqueue after document/job writes | `fix/durable-integration-outbox` | An interrupted request is recovered from persisted intent without losing a destination or changing the event ID. |
| Signing email interruption/retry recovery | `fix/signing-email-recovery` | UI/API sends persist encrypted delivery work before SMTP; retries and expired worker leases recover with valid signing links. |
| Concurrent audit-chain appends | `fix/audit-chain-concurrency` | Concurrent writers produce a single verifiable successor chain; persistence failures are not silently accepted. |
| Complete audit verification | `fix/audit-verification-completeness` | All pages of matching accessible chains are checked; filtered, unsigned, or inaccessible history is never falsely called fully verified. |
| Searchable recovery history | `fix/integration-recovery-history` | Webhook, personal-export, and workspace-archive history supports status/date filters and pagination; webhook attempts remain visible across replay. |
| Machine-readable response contracts | `fix/openapi-response-contracts` | OpenAPI describes actual request/response and error shapes, checked against route responses. |
| Consistent operator/customer documentation | `fix/integration-documentation-refresh` | API availability, recovery behavior, operational prerequisites, and remaining boundaries agree with the implementation. |

**Deployment status (2026-09-21):** fresh non-mutating production readiness probes pass for the existing webhook/cloud-export workers, and the latest five GitHub worker runs succeeded, including [run 35526720746](https://github.com/rajinweb/signworkflow/actions/runs/35526720746). The earlier missing-secret failure is no longer reproduced. The new integration-outbox and signing-email routes return `404` because these branch implementations are not yet deployed. Merge/deploy them and rerun four-route readiness plus end-to-end delivery checks. Keep the same strong `CRON_SECRET` in the application and GitHub Actions; never put it in documentation, logs, or chat.

Deploy the outbox and signing-email routes before enabling the new four-route worker runner. The documentation describes those branches' recovery behavior explicitly; it must not be used as evidence that an undeployed endpoint is available.

## Separate Product And Evidence Gaps

The following are outside the eight integration fixes. Optional connectors are product boundaries, not silently included in this work.

| Priority | Gap | Evidence in the repository | What needs to happen |
| --- | --- | --- | --- |
| P1 | Review acquisition is intentional, but review proof is still being built. | `components/Footer.tsx` links to review submission pages; the product was publicly announced on Product Hunt in July 2026; `app/trust/page.tsx` uses a conservative certification posture. | Keep the footer calls to action, track consent-aware review conversion, and publish ratings, named customer proof, or certification badges only after they exist and are verified. |
| P0 | Production reliability remains unproven by source. | The code includes email, storage, billing webhooks, cron jobs, and cloud exports; `docs/PRODUCTION_CHECKLIST.md` still requires deployment validation. | Complete the production checklist, run a staged signing/billing/export workflow, and define alerting plus recovery ownership. |
| P0 | The public-template visibility boundary is not fully server-enforced. | `app/api/templates/list/route.ts` limits unauthenticated calls to `isSystemTemplate`, while `components/templates/Templates.tsx` hides inactive/deleted records only in the browser. The public response also includes template metadata and file URLs. | Enforce active/non-deleted status and a minimal public projection in the API; add an unauthenticated route test before treating the library as a hardened public catalog. |
| P1 | The public template library is not yet a full template SEO catalog. | `app/templates/page.tsx` is client rendered and generic; the current public route is `/templates`, while detailed routes are editing workspaces. | Add server-rendered, public, canonical template-detail pages only for vetted templates, with unique copy, internal links, and legal disclaimers. |
| P2 | The new review and AI-discovery footer paths have no measured funnel yet. | The footer intentionally offers third-party discovery prompts and review destinations, but the code does not establish review conversion or control AI-generated brand descriptions. | Track outbound clicks and review conversion with consent-aware analytics; periodically check prompt results and correct site content rather than treating external answers as controlled marketing. |

## Recommended Post-Launch Priorities

1. Prove the core production path: signup, template selection, upload, send, sign, signed download, billing upgrade, and cloud export.
2. Merge and deploy the integration recovery branches, configure worker credentials, and demonstrate interrupted-send/event recovery end to end.
3. Use the public template library for one ICP, then add only the highest-performing template-detail pages.
4. Continue collecting attributable reviews and customer proof before amplifying ratings, comparisons, or compliance messaging.
5. Maintain the shipped developer API contract and measure API/webhook reliability before extending the native-connector catalog.

## Latest Release Notes

- The homepage FAQ and API integration page now agree that the public API and signed webhooks are supported. Request Demo no longer advertises “50+ apps”; Google Drive and Dropbox remain the native cloud-provider scope.
- API-key security controls, workspace-owned archives, webhook contract controls, and their review fixes are in the merged baseline. The eight branches above are the separate reliability/documentation completion set.
- `/templates` is included in the sitemap and explicitly allowed by the root robots policy; `/templates/` remains excluded to protect nested workspace routes.
- Sitemap entries omit an unknown `lastModified` value rather than reporting every URL as changed at deployment time.
- `/index.html`, legacy `/Blog` paths, and the lowercase `/why-signworkflow` variant redirect permanently to canonical routes.
- The footer now links to external AI research prompts and Trustpilot/Product Hunt review forms. These are intentional post-launch discovery and feedback mechanisms, not product claims.
- Documentation now uses SignWorkflow as the public product name; `contract-esign` is retained only as the historical repository identifier.
