# Admin Roles and Governance

This document explains how **Owner**, **Admin**, **Auditor**, and **User** roles differ in this codebase, and how to create or promote them.

For the broader product model behind these roles, see [WORKSPACES.md](/Volumes/Data/contract-esign/docs/WORKSPACES.md).

## If you're a customer / subscriber, what role are you?

- **Owner**: The primary account holder for the organization. You can change system-level governance settings (retention policies, legal holds) and manage roles (promote/demote).
- **Admin**: A trusted administrator. You can manage system-level governance settings, but you **cannot** change roles.
- **Auditor**: A compliance reviewer. Intended to have read-only access to governance data (additional enforcement can be added).
- **User**: A standard signer/sender. No access to system-level preferences.

## Summary (What each role means)

**Owner**
- Intended as the highest-privilege role.
- Recommended to control system-level governance: retention policies, legal holds, and role assignment.
- In the current code, Owner is treated the same as Admin for governance checks (see "Current enforcement").
- Only Owners (or the bootstrap token) can change roles via the promote API.

**Admin**
- Intended for day-to-day system governance.
- Can access retention policy and legal hold APIs.
- Can access Admin Governance UI page.

**Auditor**
- Intended read-only role for compliance review.
- Currently not enforced as read-only in code; it is defined but not used for access rules yet.

**User**
- Default role for standard users.
- Can sign/manage their own documents.
- Cannot access admin governance features or retention/hold APIs.

## Current enforcement (what is implemented today)

1. **Retention/Legal Hold admin APIs**
   - Admin access is verified by role or admin token.
   - Implementation in `lib/admin-governance.ts` and used by:
     - `/api/retention/policies`
     - `/api/retention/holds`
   - Roles treated as admin: `admin`, `owner`.

2. **Admin Governance UI page**
   - Visible only if `user.role` is `admin` or `owner`.
   - Page path: `/account/admin-governance`
   - Owners see a Role Management panel for promoting users.

3. **Auditor**
   - Role exists in the schema, but no special enforcement yet.
   - If you want auditors to have read-only access, we should add role checks.

## How to create users and promote roles

### 1) Create a standard user (self-signup)
- Users register via `/api/auth/register`.
- This always creates role `user`.

### 2) Promote a user to Admin / Owner / Auditor

Use the promote API:

```
POST /api/admin/users/promote
```

Payload:
```json
{
  "email": "user@example.com",
  "role": "admin"
}
```

Valid roles: `user`, `admin`, `owner`, `auditor`.

**Auth options**
- If you already have an Owner account:
  - Login and call the endpoint (session cookies will authorize).
- Admin accounts will receive `403` because only Owners can change roles.
- If you have no Admin/Owner account yet:
  - Set `ADMIN_BOOTSTRAP_TOKEN`
  - Send header: `x-admin-bootstrap-token: <token>`
  - Bootstrap is only valid to create the first **Owner** and is rejected once any Owner exists.
  - Best practice: rotate/remove the bootstrap token after initial owner creation.

### 2a) Invite a new user (recommended)

Owners can invite users directly (no self-signup required). Invitations send a set-password link.

UI: `/account/admin-governance` → Role Management → Invite user.

API:
```
POST /api/admin/users/invite
```

Payload:
```json
{
  "email": "user@example.com",
  "role": "admin"
}
```

Valid roles: `user`, `admin`, `owner`, `auditor`.

Example:
```bash
curl -X POST http://localhost:3000/api/admin/users/promote \
  -H "Content-Type: application/json" \
  -H "x-admin-bootstrap-token: $ADMIN_BOOTSTRAP_TOKEN" \
  -d '{"email":"user@example.com","role":"admin"}'
```

**Important:** after promotion, the user must log out and log back in (or refresh session) to pick up the new role in the UI.

### 3) Direct DB update (emergency only)
If needed, you can update MongoDB directly:

```js
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "admin" } }
)
```

## Recommended governance model (best practice)

- **Owner**: highest privilege; manages role assignment and critical system settings.
- **Admin**: manages retention policies, legal holds, and daily system configuration.
- **Auditor**: read-only access to governance data and audit trails.
- **User**: standard usage only.

If you want to strictly enforce auditor read-only access or lock down owner-only actions, we should add explicit role checks in APIs and UI.

## Organization model (multi-org membership)

- Users can belong to multiple organizations.
- Roles are **scoped per organization** via membership records.
- The app uses a **primary organization** as the default context for APIs and UI. Switching the primary org updates the role shown in the UI.
- Advanced usage: pass `x-org-id` header or `orgId` query param to scope a single request to a different org.
- UI: Account → My Organizations (switch primary org).
- API: `GET /api/orgs` (list orgs) and `PATCH /api/orgs` (set primary org).

## Billing lifecycle

- New users start in a free trial workspace and can convert that workspace into a paid organization plan.
- Self-serve paid billing is provider-backed for:
  - `Business`
  - `Business Plus`
- Enterprise is the highest packaged self-serve tier and should be managed by workspace owners from Subscription unless the account moves to Site License/custom pricing.
- Billing is dual-provider in this release: Razorpay for India domestic subscriptions and PayPal for international subscriptions.
- First-time self-serve checkout is started from:
  - `PATCH /api/subscription`
- Existing paid workspaces are managed by organization owners through:
  - `POST /api/subscription/manage`
- Subscription state is reconciled from the provider webhook through:
  - `POST /api/subscription/webhook`
- The organization record stores the synced billing identifiers and current subscription state.
- Seat limits are still enforced in `/api/admin/users/invite` using active memberships.

## Migration for existing data

- Existing users with active org memberships continue using their current primary organization.
- Personal users are no longer auto-bootstrapped into a new organization on login.
- When a personal user upgrades to an organization plan, the organization workspace is created during the billing lifecycle and their existing user-owned data is moved into that workspace.
- Retention policies without `orgId` are treated as global until re-scoped.

## System preferences scope

System preferences are **organization-scoped** in the current design.
Multiple owners/admins inside the same organization can manage the same preferences, with audit logging recommended.
