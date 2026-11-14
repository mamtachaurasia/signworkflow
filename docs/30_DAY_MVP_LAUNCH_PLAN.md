# 30-Day Post-Launch Growth Plan

> The filename is retained for existing links. This plan is now for the period after SignWorkflow's public launch.

SignWorkflow is live and was announced on Product Hunt in July 2026. This document is a concrete 30-day plan for turning that launch into repeatable activation, customer proof, and measured growth. The repository still uses the historical `contract-esign` directory name; the public product name is SignWorkflow.

The recommendation behind this plan is:

> Operate as a live early-production product: keep acquisition focused, learn from real accounts, and scale only channels that show repeatable activation.

The purpose of the next 30 days is not to decide whether to launch. It is to prove:

- real users can complete real workflows successfully
- the product solves a specific business pain
- the app is stable enough for repeated use
- the positioning resonates with a narrow ICP

## Post-Launch Operating Decision

Recommended operating mode:

- `live product with high-touch onboarding`
- `narrow ICP`
- `measured acquisition and review collection`

Do not accelerate yet:

- unmeasured paid acquisition
- enterprise-scale promises
- wide horizontal positioning

## Current Product And Acquisition State

The latest shipped work improves the public acquisition surface rather than changing the core signing workflow:

- `/templates` is now an indexable public template-library landing page; its canonical metadata explicitly allows indexing.
- `robots.txt` keeps nested `/templates/` workspaces out of search while allowing the root library, and `sitemap.xml` now includes `/templates`.
- Sitemap entries no longer receive an artificial deployment-time `lastModified` date when the real modification date is unknown.
- Legacy `/index.html`, `/Blog`, and `/why-signworkflow` variants are permanently consolidated to canonical routes.
- The footer intentionally provides outbound AI research prompts and destinations to leave Trustpilot or Product Hunt reviews. This is a post-launch discovery and review-acquisition pattern; it is not a claim that reviews, certifications, or another in-product AI capability already exist.

Before expanding the template library as an acquisition channel, verify it anonymously in production: only active system templates should be browseable, private workspace data must remain inaccessible, and creating an editable copy must still require sign-in.

## Primary Goal For 30 Days

Get 5 to 15 qualified live accounts actively using the product for repeatable document workflows and generate enough evidence to decide whether to:

1. scale one acquisition channel
2. keep high-touch onboarding while fixing friction
3. narrow positioning or harden the product before increasing spend

## Success Criteria

By the end of 30 days, aim to have:

- a measured baseline for traffic, signup, activation, and support
- 5 to 15 active accounts in the chosen ICP
- at least 3 accounts completing repeated document workflows
- at least 20 to 50 completed signing workflows
- clear evidence that users understand the value proposition
- at least 2 verified review, testimonial, or case-study candidates
- a list of the top 5 issues blocking efficient growth
- a channel-and-positioning decision for the next 30 days

## Best ICP To Start With

Focus the next 30 days on one ICP. Do not market to everyone at once.

Recommended ICP priority:

1. HR and people operations teams
2. legal and compliance-heavy SMBs
3. operations or finance teams with repeatable approval workflows

Best first wedge:

- businesses with recurring forms, agreements, onboarding packets, approvals, or vendor documents

Why this ICP first:

- repeatable use cases
- easy value demonstration
- strong fit with templates, roles, auditability, and retention messaging
- more likely to care about shared control than casual signers

## What To Say In The Market

Primary positioning:

> SignWorkflow helps growing businesses run secure signing workflows with templates, team access, audit visibility, and audit-ready records.

Short version:

> Workspace-first e-sign for growing teams.

Avoid promoting with:

- generic "electronic signature for everyone"
- "best alternative to DocuSign" as the only message
- broad enterprise replacement claims

## What To Sell First

Lead with these capabilities:

- secure send-and-sign workflows
- templates for repeatable processes
- team and role controls
- audit visibility
- retention-aware document handling

Use the public template library as an entry point for repeatable HR, legal, sales, finance, and operations workflows. Do not position an outbound “Ask AI” link as the product's AI review feature; the product value is the access-controlled, in-workspace review workflow.

Do not lead with:

- every feature in the product
- API-first messaging unless the buyer is technical
- enterprise governance language for small customers

## 30-Day Plan By Week

## Week 1: Post-Launch Baseline And Offer Alignment

Primary objective:

- establish a reliable live baseline and remove obvious conversion or trust blockers

Concrete tasks:

- choose one ICP and write it down
- define the exact trial, early-adopter, or onboarding offer
- review the full signup, upload, send, sign, and download flow manually
- verify the pricing and landing-page messaging align with the chosen ICP
- confirm environment variables and production config are complete
- verify email delivery works consistently
- verify document storage and download behavior
- confirm cron jobs and retention tasks are configured for the live environment
- confirm billing behavior is safe when live users upgrade or renew
- verify the public template library in an anonymous browser and confirm the root URL is indexable while nested workspaces remain excluded
- verify review links and customer/certification language do not imply proof that has not been independently established
- confirm the review links work and record a consent-aware baseline for outbound clicks and reviews received
- create a private onboarding checklist for new users
- create a support response playbook for live-user issues

Output by end of week:

- post-launch metric baseline
- one chosen ICP
- list of known blockers with severity
- onboarding checklist
- production confidence review

Operating gate for Week 1:

- no critical bug in core signing flow
- no broken auth loop
- no broken email/send flow
- no obvious data-loss path in common workflows

## Week 2: Activation And Founder-Led Onboarding

Primary objective:

- activate qualified live accounts and observe their first workflow

Concrete tasks:

- identify 25 to 50 target prospects in the chosen ICP
- prioritize warm intros first
- prepare a short founder outreach message
- offer a guided trial or early-adopter onboarding path where it helps conversion
- schedule onboarding calls
- onboard 3 to 5 qualified accounts personally
- watch users complete setup live
- collect every point of confusion during onboarding
- track time-to-first-document
- track time-to-first-completed-signature
- document all friction in a launch-notes file

Suggested outreach message:

> SignWorkflow is live for teams that need repeatable signing workflows, shared controls, and audit-ready records. I’d be happy to personally help your team set up one real workflow and learn what would make it more useful for you.

Output by end of week:

- first post-launch cohort activated
- onboarding notes from real users
- first set of bugs and UX friction points ranked by severity

Operating gate for Week 2:

- at least 3 real accounts onboarded
- at least 1 document sent
- at least 1 document completed end-to-end

## Week 3: Fix Friction And Prove Repeat Usage

Primary objective:

- move users from first use to repeated use

Concrete tasks:

- fix top onboarding blockers
- fix top signing-flow blockers
- simplify unclear copy or UI labels
- improve template onboarding for common use cases
- review support requests and categorize them
- identify where users drop off in the flow
- ask active accounts to run a second workflow
- collect qualitative feedback on trust, clarity, and control
- ask what they would switch from or compare against
- record feature requests but do not build everything immediately

Focus questions to ask users:

- What made you try the product?
- Where did you hesitate?
- What felt confusing?
- What made this better than your current process?
- What is missing before you would use it more widely?

Output by end of week:

- second-pass bug fixes
- clearer understanding of repeat-use behavior
- early differentiation signals from real conversations

Operating gate for Week 3:

- at least 3 accounts complete more than one workflow
- at least 10 completed signing flows total
- no recurring P0 or P1 issue in the core path

## Week 4: Validate Positioning, Proof, And The Next Growth Channel

Primary objective:

- decide which growth channel and customer motion to improve next

Concrete tasks:

- review live-account usage and support data
- request honest Trustpilot, Product Hunt, or testimonial feedback from successful users
- write 1 to 2 short customer stories
- review whether the ICP message matched actual buying behavior
- review whether pricing and plan framing make sense
- list the top 5 blockers to efficient growth
- decide what must be fixed before increasing acquisition
- decide whether to stay narrow or widen the target market
- create the next 30-day post-launch roadmap

Output by end of week:

- post-launch growth summary
- channel decision memo
- testimonials or customer proof
- ranked backlog for the next month

End-of-month decision:

- scale one channel carefully
- continue high-touch activation
- pause a weak channel and harden

## Metrics To Track

Track these from day one, even manually if needed.

### Activation metrics

- visitors to signup
- signup conversion rate
- workspace created
- first document uploaded
- first document sent
- first completed signature

### Usage metrics

- number of active accounts
- documents uploaded per account
- documents sent per account
- completed workflows per account
- repeat workflows per account
- templates created

### Reliability metrics

- email delivery success
- failed sends
- failed sign completions
- document load errors
- auth/session issues
- support tickets per account

### Commercial and validation metrics

- demo-to-trial or signup conversion
- trial-to-paid conversion
- review or testimonial conversion
- user-reported alternative or incumbent tool
- top reasons for hesitation

## Live Operating Checklist

Keep these true while the product is live:

- production environment is stable
- MongoDB backups are enabled
- email delivery is verified
- document storage is working
- billing behavior is tested for live upgrades and renewals
- cron jobs are configured intentionally
- there is a rollback plan
- there is a way to inspect logs quickly
- there is a way to respond to support issues fast

## Support Model For First 30 Days

Use a high-touch model.

Recommended support approach:

- founder-led onboarding calls
- direct support by email or chat
- same-day response expectation
- manual issue triage
- weekly review of user friction

Do not optimize for scale yet.
Optimize for learning and trust.

## What To Fix After Launch

Priority 0:

- any bug that prevents signup, login, upload, send, sign, or download
- broken email sending
- broken billing behavior for live users
- incorrect document-access behavior
- document corruption or versioning issues

Priority 1:

- unclear onboarding copy
- confusing template setup
- missing empty states in important paths
- unstable mobile signer experience
- missing trust language in the product flow

Priority 2:

- nice-to-have polish
- broad feature additions
- expansion into new personas

## What Not To Distract The Team With In The Next 30 Days

Do not dilute the post-launch learning cycle with:

- broad enterprise sales motion
- deep CLM features
- many new integrations
- heavy platform expansion
- major design overhauls
- broad unmeasured marketing campaigns

Also postpone or soften any claim that the current source does not substantiate:

- native integrations beyond Google Drive and Dropbox
- a public embedded-signing or developer API product
- named customer logos, review totals, or certification badges without current evidence and permission

The next 30 days should optimize for:

- proof
- trust
- repeated use
- message clarity

## Post-Launch Early-Adopter Motion

Suggested approach:

- use the existing trial and paid-plan model as the default
- provide founder-led setup for high-fit accounts
- include feedback calls during the first workflow
- use a time-bound early-adopter incentive only when it is explicit and commercially safe

What to ask in return:

- real workflow usage
- feedback sessions
- permission to use anonymized learnings
- an honest review or testimonial after a successful workflow

## Concrete Weekly Checklist

### Week 1 checklist

- choose ICP
- define live onboarding offer
- verify core flow manually
- verify env and production settings
- verify email and storage
- prepare onboarding checklist
- prepare outreach list

### Week 2 checklist

- send outreach
- book onboarding calls
- onboard qualified accounts
- observe first usage live
- capture all friction

### Week 3 checklist

- fix highest-friction issues
- improve copy and onboarding
- drive second workflow usage
- collect trust and comparison feedback

### Week 4 checklist

- collect testimonials
- write post-launch summary
- rank growth blockers
- decide what to scale, continue, or harden

## Decision Framework At Day 30

### Scale a channel if

- users complete workflows successfully
- at least a few users repeat usage
- trust is growing
- support load is manageable
- the ICP message is resonating

### Continue high-touch activation if

- users see value but friction is still too high
- core workflow works but onboarding is still rough
- reliability is acceptable but not yet comfortable

### Pause a channel and harden if

- core workflows break frequently
- trust issues appear around delivery or document handling
- onboarding is too confusing for non-guided use
- support load is too high relative to usage

## Final Recommendation

The product is already live. Do not re-run a launch plan; use the next 30 days to turn the launch into a measured growth loop.

Continue to avoid promising:

- broad-market maturity
- enterprise-scale dependability
- fully self-serve frictionless adoption for every customer type

If the next 30 days are run well, they should identify the first repeatable acquisition-and-activation motion for SignWorkflow. See [CURRENT_OFFERING_AND_GAPS.md](/Volumes/Data/contract-esign/docs/CURRENT_OFFERING_AND_GAPS.md) for the current code-based boundary assessment.
