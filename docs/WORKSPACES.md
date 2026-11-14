# Workspaces

This document explains what a **workspace** means in this product, when users need one, and how it behaves across signup, billing, access control, and collaboration.

## What a workspace is

A workspace is the shared operating context for a team or business account.

It groups together:

- members
- roles
- teams
- billing ownership
- shared templates
- audit visibility
- governance settings
- retention and legal hold policies

In the UI, we use the word **Workspace**. In some internal code and APIs, older names like `Organization`, `orgId`, and `/api/orgs` still exist for compatibility.

## Why workspaces exist

Workspaces solve the point where a user stops being only an individual signer and needs shared administration.

Typical reasons:

- a founder wants to invite teammates
- a business wants a shared billing owner
- a compliance team needs audit visibility across multiple users
- an operations team needs shared templates and team routing
- a company wants workspace-wide defaults instead of per-user setup

## When a user gets a workspace

### 1. New signup

- New users start with a **trial workspace**
- New trial workspaces include a **30-day evaluation period**
- The trial is the evaluation path before moving to a paid plan
- The default workspace name is based on the user name, for example:
  - `Asha Workspace`

Existing active trials can be extended to the same 30-day total with
`npm run migrate:trial-duration` (preview first with
`npm run migrate:trial-duration -- --dry-run`). Expired trials are not changed.

### 2. Paid upgrade

- A workspace can continue as the user upgrades into:
  - `Business`
  - `Business Plus`
  - `Enterprise`
- Billing stays attached to the workspace owner context

### 3. Invite into an existing workspace

- A user can also join another workspace through an invite
- In that case, their membership, role, and permissions are scoped to that workspace

## Main workspace use cases

### Solo evaluation

A new user signs up, sends documents, tests templates, and understands the product during the trial period.

Why workspace still helps:

- the user evaluates the real team model from day one
- upgrade is simpler because the account context does not need to be rebuilt later

### Small business collaboration

An owner upgrades to `Business` and invites a few teammates.

Typical needs:

- one billing owner
- shared member management
- one team
- shared templates
- workspace audit trail

### Multi-team operations

A growing company upgrades to `Business Plus`.

Typical needs:

- multiple teams
- workspace branding
- shared defaults
- notification rules
- retention policies
- stronger admin governance

### Compliance-heavy rollout

A larger company upgrades to `Enterprise`.

Typical needs:

- legal holds
- audit export and verification
- stronger governance controls
- higher packaged operational oversight

### Multi-workspace user

A consultant, auditor, or contractor may belong to more than one workspace.

The app supports:

- multiple workspace memberships
- a primary workspace
- switching between workspaces

The primary workspace is the default context for:

- new documents
- billing views
- member management
- governance pages

## Roles inside a workspace

Workspace roles are membership-scoped.

- `owner`
  - billing owner
  - highest workspace privilege
  - manages roles and critical controls
- `admin`
  - manages daily workspace operations
  - can access admin/governance features where allowed
- `auditor`
  - intended for read-heavy compliance oversight
- `user`
  - standard sender/signer role

These roles are separate from the general account identity. A person can have different roles in different workspaces.

## What changes when a user does not have active workspace access

A user can still have an account, but lose access to a specific workspace.

Examples:

- membership removed
- membership disabled
- paid workspace suspended

In that state:

- the user account still exists
- the user may still use allowed account-level areas
- workspace-only sections become unavailable
- the UI routes them to the workspace access guidance screen when needed

## Workspace features by plan

### Trial

- guided evaluation workspace
- owner-led setup
- trial countdown and upgrade prompts

### Business

- first paid workspace tier
- owner/admin/auditor/user roles
- invites
- one team
- shared templates
- workspace audit trail

### Business Plus

- everything in Business
- multiple teams
- branding
- workspace defaults
- notification rules
- retention policies
- stronger governance controls

### Enterprise

- everything in Business Plus
- legal holds
- audit export and verification
- highest packaged workspace governance tier

## Workspace navigation in the app

Main user-facing areas:

- `My Workspaces`
- `Workspace Members`
- `Workspace Access`
- `My Teams`
- `Admin Governance`
- `Subscription`

Important behavior:

- switching workspace changes the active context
- workspace members are managed per workspace
- team management belongs to the active workspace
- billing and governance are evaluated against workspace role and plan

## Naming note for engineering

The product language is now **Workspace**, but the codebase still contains compatibility names such as:

- `Organization` model
- `orgId`
- `orgRole`
- `/api/orgs`
- older route wrappers like `/account/myOrganizations`

This is intentional during migration so we improve readability without breaking existing links or data contracts.

## Recommended mental model

Use this rule when deciding whether something belongs to a workspace:

- if it is shared, governed, billed, or managed across multiple people, it belongs to the workspace
- if it is purely personal preference or user identity, it belongs to the user account

## Related docs

- [README.md](/Volumes/Data/contract-esign/README.md)
- [ADMIN_ROLES.md](/Volumes/Data/contract-esign/docs/ADMIN_ROLES.md)
- [OPERATIONS.md](/Volumes/Data/contract-esign/docs/OPERATIONS.md)
- [COMPLIANCE.md](/Volumes/Data/contract-esign/docs/COMPLIANCE.md)
