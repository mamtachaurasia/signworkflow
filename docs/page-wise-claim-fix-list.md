# Page-Wise Claim Fix List

Use this checklist to verify public website claims before treating them as official product, legal, compliance, or customer-proof statements.

Integration claims reviewed 2026-09-21. This is a claims checklist, not a production-readiness certificate; see [the integration completion checklist](CURRENT_OFFERING_AND_GAPS.md#exports-and-apis-completion-checklist) for branch and deployment boundaries.

## Home `/`

- Verify whether Customer Stories testimonials are real or placeholder copy.
- Verify logo strip customer/company permission before using “Trusted by companies” messaging.
- The homepage and shared FAQ now describe the shipped scoped public API and signed webhooks consistently. Keep claims limited to upload, preparation, sending, status, completed-PDF download, and documented lifecycle events.
- Verify bulk send `100+` claim. Current API limit appears to be 100 recipients.

## Public Template Library `/templates`

- The root `/templates` route is intentionally public and indexable; nested `/templates/` workspace routes remain excluded from crawling.
- Verify the unauthenticated list API itself returns only active, non-deleted system templates and a minimal public projection; browser-side filtering alone is insufficient.
- Verify the sign-in handoff is required before a visitor can create an editable copy.
- Treat the current library as a general catalog. Do not claim individual template pages rank or provide jurisdiction-specific legal advice until vetted public detail pages exist.

## Request Demo `/request-demo`

- Verify Sony, Hyatt, Ryanair, Crumbl, and Payroc customer/trust claims.
- The unsupported “HubSpot, Salesforce, Zapier & 50+ apps” claim has been replaced with Google Drive and Dropbox export availability; do not reintroduce native connector claims without implementation.
- Verify “100+ recipients in bulk send.”
- Verify “works on any device” against actual supported browser/device coverage.

## Solutions `/solutions`

- Verify “Bank-level encryption” with technical proof and approved wording.
- Verify “HIPAA, SOC 2, GDPR compliance” before claiming certification or compliance.
- Verify “Trusted by organizations” with real customer proof.
- Verify “Complete audit logs for every signature and document action.”
- Verify “Proven ROI” with real case study, customer data, or remove/soften it.

## Solutions By Industry `/solutions/by-industry`

- Review broad compliance, API, mobile, and audit claims.
- Review “UETA, ESIGN, GDPR, HIPAA” wording with legal/compliance input.
- Avoid broad compliance claims unless backed by documentation, contracts, or certification.

## Industry Pages `/solutions/by-industry/[industry]`

- Healthcare: verify or soften “HIPAA-compliant” wording.
- Legal: verify “UETA and ESIGN compliance” and “Immutable audit trails.”
- Finance: verify or soften “ensuring compliance.”
- Technology: verify “API-connected workflows,” CRM triggers, and multiple integrations.
- All industries: verify “What teams automate” automation/integration claims.

## Integrations `/integrations/*`

- Google Drive and Dropbox support personal export and workspace-owned archive destinations in source; verify OAuth, download/upload, retries, and worker configuration in the deployed environment.
- `/integrations/api` is a shipped public-API page, not a native-connector planning guide. Its metadata, visible description, badge, and shared FAQ must use the same availability statement.
- OneDrive, Zapier, Slack, Microsoft Teams, Salesforce, and HubSpot remain planning guides unless their native integrations are actually implemented.
- API-led document automation, status inspection, and signed lifecycle events are supported. Embedded signing and CRM-specific native connectors are not currently provided.
- Do not promise instant or exactly-once delivery: workers are scheduled, webhooks are at least once, and SMTP retries can produce duplicate emails after an interrupted acknowledgement. Personal archives respect document access; workspace archives intentionally cover all finalized workspace documents.

## Shared Footer And Contact Surface

- The “Ask AI” icons intentionally open third-party research prompts, following a competitor-informed discovery pattern. Keep them distinct from SignWorkflow's in-product AI review features, because the third-party output is not controlled.
- Trustpilot and Product Hunt links are intentional post-launch review-acquisition destinations. Keep them in the footer while review inventory is growing; do not present ratings, review volume, or endorsements until they exist and are verified.
- The company-information block is intentionally not needed in the footer or contact page at this stage. The About page and structured data remain the existing source for public company details.

## FAQ / Blog

- The shared FAQ now advertises the public API and signed outbound webhooks, while explicitly excluding embedded signing and native CRM connectors. Keep it synchronized with the API page and developer guide.
- Blog/legal articles: review “legally binding,” “proves,” “7 years minimum,” and “compliant exports” wording.
- Treat legal articles as educational content, not legal advice.

## Trust / Security / Terms

- Trust and Security pages should stay conservative unless reports/certifications exist.
- Do not show certification badges or absolute compliance claims without current proof.
- Terms page should get final legal review before production use.
