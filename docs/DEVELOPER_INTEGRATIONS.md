# Developer Integrations

This guide explains how workspace administrators can manage API keys and signed
webhooks from SignWorkflow, and how developers can use the currently supported
public API operations.

Release note (2026-09-21): the core API, key controls, webhooks, and workspace
archives are in the merged source. Sections labeled **recovery rollout** describe
the separate completion branches and apply after they are merged and deployed.
Check [the completion checklist](CURRENT_OFFERING_AND_GAPS.md#exports-and-apis-completion-checklist)
and [operator rollout checks](OPERATIONS.md#integration-recovery-rollout-and-checks)
before relying on the new recovery behavior in a particular environment.

## Requirements

- An active SignWorkflow workspace
- A workspace administrator account
- An active trial or paid plan for document write operations
- A public HTTPS endpoint if you want to receive webhooks

Developer integration settings are workspace-scoped. API keys can access only
documents belonging to the workspace in which the key was created.

## Open Developer Integrations

1. Sign in to SignWorkflow.
2. Open **Dashboard**.
3. Select **My Account** and then **Integrations**.
4. Scroll to **Developer integrations**.

Only workspace administrators can see and manage this section.

## Create an API key

1. In **Developer integrations**, find **API keys**.
2. Enter a recognizable name, such as `Production API` or `Reporting service`.
3. Leave **Allow document creation and sending** cleared for a read-only key.
4. Select the option only when the integration needs write access.
5. Optionally set an expiration, an IP/CIDR allowlist, a lower per-key request
   limit, and a rotation reminder.
6. Select **Create API key**.
7. Copy the displayed secret immediately and store it in a secrets manager.

The full secret is displayed only once. SignWorkflow stores a hash of the
secret and cannot display it again. If the secret is lost, revoke the key and
create another one.

Available scopes:

| Scope | Access |
| --- | --- |
| `documents:read` | List documents, inspect status, and download completed documents |
| `documents:write` | Upload documents, prepare field layouts, send documents, and retry failed signing-request delivery |

Do not place an API key in browser code, mobile applications, source control,
logs, or customer-visible configuration.

### Key security controls

- **Expiration:** a key stops authenticating at its configured expiration time.
  Leave expiry empty only for a credential that has an independently enforced
  rotation process.
- **IP allowlist:** enter up to 20 comma-separated IPv4 or IPv6 addresses or
  CIDRs, such as `203.0.113.18`, `203.0.113.0/24`, or `2001:db8::/32`. An empty
  list permits any IP. When an allowlist is present, requests whose verified
  client IP is unavailable are rejected rather than bypassing the control.
- **Per-key rate limit:** set a value from 1 to 600 requests per minute. This
  makes it possible to give a low-privilege integration a tighter budget than
  another key in the same workspace.
- **Rotation reminder:** this creates an on-screen due date; SignWorkflow never
  silently replaces a secret because it cannot securely deliver the new value.

Select **Controls** on a key that has not been rotated to change these settings. Select
**Rotate** to generate a replacement secret. The old key is limited to a
24-hour overlap (or its earlier expiry), so deploy the replacement immediately
and revoke the old key sooner if it may be exposed. Rotated source keys display
their fixed retirement time and allow only **Revoke**; their settings cannot be
edited and their expiry cannot be removed or extended. Manage the replacement
key's controls for future changes or rotations.

## Authenticate API requests

Send the API secret using the `X-API-Key` header:

```bash
curl --request GET "https://signworkflow.com/api/v1/documents" \
  --header "X-API-Key: sw_live_your_secret"
```

Bearer authentication is also accepted:

```bash
curl --request GET "https://signworkflow.com/api/v1/documents" \
  --header "Authorization: Bearer sw_live_your_secret"
```

The machine-readable OpenAPI document is available at:

```text
https://signworkflow.com/api/v1/openapi
```

The **recovery rollout** adds explicit success/error response schemas and
route-backed contract tests. Import the specification from the deployment you
actually use; do not assume a source-branch schema has reached production.

## List documents

```bash
curl --request GET \
  "https://signworkflow.com/api/v1/documents?page=1&limit=25" \
  --header "X-API-Key: sw_live_your_secret"
```

`page` starts at `1`. `limit` can be between `1` and `100`.

## Get document status

```bash
curl --request GET \
  "https://signworkflow.com/api/v1/documents/DOCUMENT_ID" \
  --header "X-API-Key: sw_live_your_secret"
```

Recipient signing secrets and token hashes are removed from the response.

## Upload a PDF

The create endpoint accepts a Base64-encoded PDF of up to 25 MB.

```bash
PDF_BASE64="$(base64 < agreement.pdf | tr -d '\n')"

curl --request POST "https://signworkflow.com/api/v1/documents" \
  --header "X-API-Key: sw_live_your_secret" \
  --header "Content-Type: application/json" \
  --data "{\"name\":\"Supplier agreement\",\"contentBase64\":\"${PDF_BASE64}\"}"
```

Save the returned document `id` for subsequent requests.

## Prepare and send a document

Prepare a field layout through the API after uploading the PDF. Coordinates use
the top-left of the PDF page in points unless `pageRect` is supplied. When
`pageRect` is present, coordinates and dimensions are scaled from that viewport
rectangle into the PDF page.

Each recipient-owned field needs a `recipientId`. Use the same IDs in the send
request that follows.

```bash
curl --request PUT \
  "https://signworkflow.com/api/v1/documents/DOCUMENT_ID/prepare" \
  --header "X-API-Key: sw_live_your_secret" \
  --header "Content-Type: application/json" \
  --data '{
    "fields": [
      {
        "id": "signature-1",
        "type": "signature",
        "x": 72,
        "y": 620,
        "width": 180,
        "height": 54,
        "pageNumber": 1,
        "recipientId": "signer-1",
        "fieldOwner": "recipients",
        "required": true
      }
    ]
  }'
```

The endpoint creates a prepared version from the current PDF when one does not
exist. Calling it again replaces the field layout until sending locks that
version. Then send the document:

```bash
curl --request POST \
  "https://signworkflow.com/api/v1/documents/DOCUMENT_ID/send" \
  --header "X-API-Key: sw_live_your_secret" \
  --header "Content-Type: application/json" \
  --data '{
    "recipients": [
      {
        "id": "signer-1",
        "email": "signer@example.com",
        "name": "Example Signer",
        "role": "signer",
        "order": 1
      }
    ],
    "subject": "Please sign the supplier agreement",
    "message": "Review and sign the attached agreement."
  }'
```

Recipient IDs and email addresses must be unique. At least one recipient must
have the `signer` role. SignWorkflow atomically claims the draft before sending,
so concurrent requests cannot send the same draft twice. The supported headless
sequence is upload PDF → prepare fields → send → inspect status → download the
completed PDF.

## Retry failed signing-request delivery

**Recovery rollout:** UI and public API sends persist encrypted recipient
delivery work in the same document write as signing credentials, before sending
email. A request interruption no longer requires recreating the signing request.
The signing-email worker reclaims expired five-minute leases and retries failed
deliveries up to five attempts, with exponential backoff starting at one minute.
Actual delivery occurs on a subsequent worker sweep, not at an exact promised
time. Inspect `deliveryFailures`, `deliveryPending`, and `retryable` in the send
or retry response; an accepted request is not proof of inbox delivery.

If delivery has failed, explicitly retry it with:

```bash
curl --request POST \
  "https://signworkflow.com/api/v1/documents/DOCUMENT_ID/send/retry" \
  --header "X-API-Key: sw_live_your_secret"
```

This re-arms failed/dead-letter delivery work without taking a currently active
worker lease. Durable retries reuse the same signing token and stable message
identity; they do not invalidate a link in an email already accepted by SMTP.
Legacy failed sends that have no recoverable encrypted token receive replacement
credentials when retried. Completed durable deliveries and already-signed
recipients are not resent. A legacy interrupted dispatch can have an unknown
SMTP outcome, so recovery may resend that invitation with replacement credentials.

Email delivery is at least once: if SMTP accepts a message and the worker stops
before recording success, a retry can deliver a duplicate with the same valid
link. Configure `CLOUD_CONNECTIONS_ENCRYPTION_KEY`, SMTP, and the signing-email
worker as described in Operations. Exhausted work needs an explicit retry after
the underlying problem is corrected; `409 no_failed_deliveries` means no eligible
failed work was found for this request.

## Download a completed PDF

The download endpoint is available after the document reaches `signed` or
`completed` status.

```bash
curl --request GET \
  "https://signworkflow.com/api/v1/documents/DOCUMENT_ID/download" \
  --header "X-API-Key: sw_live_your_secret" \
  --output completed-agreement.pdf
```

## API rate limits

Each API key can make up to 600 authenticated public API requests per minute;
an administrator can configure a lower value per key.
When the limit is exceeded, SignWorkflow returns `429` with these headers:

- `Retry-After`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

Wait for the duration specified by `Retry-After` before retrying.

## Create a webhook

1. Open **Developer integrations** and find **Webhooks**.
2. Enter a public HTTPS endpoint URL.
3. Enter `*` to receive every documented event, or enter a comma-separated
   list of exact event names.
4. Select **Add webhook**.
5. Copy the webhook signing secret immediately and store it securely.
6. Select **Test** to send a `webhook.test` event.

The endpoint card shows the last HTTP status and consecutive failure count. The
delivery history below it shows every queued attempt. Failed and dead-letter
deliveries can be replayed from the same screen. Select **Pause** to temporarily
hold queued and future deliveries until the endpoint is resumed, **Edit** to
change the destination or subscriptions,
**Rotate secret** to issue a replacement HMAC secret, or **Revoke** to
permanently stop deliveries.

Webhook URLs must use HTTPS on port 443 and resolve only to public IP addresses.
SignWorkflow validates every resolved address for every attempt, pins the
validated address for the TLS connection, and does not follow redirects. Local,
private, link-local, and reserved destinations are rejected.

## Webhook request format

SignWorkflow sends an HTTP `POST` request with a JSON body and these headers:

```text
Content-Type: application/json
User-Agent: SignWorkflow-Webhooks/1.0
X-SignWorkflow-Timestamp: 1788282000
X-SignWorkflow-Signature: sha256=HEX_DIGEST
X-SignWorkflow-Signature-Version: v2
X-SignWorkflow-Event-Version: 2026-09-08
```

Example body:

```json
{
  "id": "evt_example",
  "type": "webhook.test",
  "data": {
    "message": "Test delivery from SignWorkflow"
  },
  "createdAt": "2026-09-08T12:00:00.000Z",
  "schemaVersion": "2026-09-08"
}
```

`X-SignWorkflow-Event-Version` and the `schemaVersion` body property are sent
for endpoints created with the current event contract. They identify the stable
event schema documented below. Legacy endpoints retain their existing event
behavior without these fields.

## Supported webhook events

New endpoints can subscribe to these event names or `*`. The body always has
`id`, `type`, `createdAt`, `schemaVersion`, and `data`. Store `id` to make the
receiver idempotent.

| Event | When it is sent | Useful `data` fields |
| --- | --- | --- |
| `document_created` | A document is created | `documentId`, `metadata.source` |
| `document_prepared` | A field layout is prepared | `documentId`, `metadata.version`, `metadata.fieldCount` |
| `document_sent_for_signing` | A signing request is sent | `documentId`, `metadata.recipientCount` |
| `recipient_signed` | A recipient signs | `documentId` |
| `document_finalized` | Signing and required approvals complete | `documentId`, `metadata.version`, `metadata.finalHash` |
| `document_voided` | A document is voided | `documentId` |
| `cloud.export.completed` | An automatic archive completes | `documentId`, `metadata.provider`, `metadata.providerFileId` |
| `webhook.test` | An administrator tests an endpoint | `message`, `requestedAt` |

The current event contract normalizes the workspace send action to
`document_sent_for_signing`. Events outside this catalog are not sent to new
endpoints, even if they subscribe to `*`; this prevents security and internal
audit activity from becoming an accidental public API. Existing endpoints keep
their legacy subscriptions until they are replaced.

## Verify a webhook signature

For `v2`, compute HMAC-SHA256 over the exact timestamp header, a period, and the
raw HTTP request body. Legacy `v1` endpoints compute the HMAC over only the raw
request body:

```text
SIGNED_PAYLOAD = X-SignWorkflow-Timestamp + "." + RAW_REQUEST_BODY
```

Node.js example:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignWorkflowWebhook({ rawBody, timestamp, signature, signatureVersion, secret }) {
  if (signatureVersion !== 'v1' && signatureVersion !== 'v2') return false;
  if (typeof signature !== 'string') return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (signatureVersion === 'v2' && (!Number.isFinite(ageSeconds) || ageSeconds > 300)) return false;

  const signedPayload = signatureVersion === 'v2' ? `${timestamp}.${rawBody}` : rawBody;
  const expected = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  const received = signature.replace(/^sha256=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;

  const expectedBytes = Buffer.from(expected, 'hex');
  const receivedBytes = Buffer.from(received, 'hex');
  if (expectedBytes.length !== receivedBytes.length) return false;
  return timingSafeEqual(expectedBytes, receivedBytes);
}
```

Use the raw body bytes before JSON parsing. Reject old timestamps—five minutes
is a typical tolerance—and store processed event IDs to prevent duplicate work.

Endpoints created before signature versioning use `v1`, which signs only the raw
request body for backward compatibility. Newly created endpoints use `v2`, which
signs `timestamp + "." + rawBody`. Check the
`X-SignWorkflow-Signature-Version` header and use the corresponding algorithm.
Unversioned endpoints are classified by the signature rollout timestamp: older
raw-body endpoints migrate to `v1`, while endpoints created during the earlier
timestamped-signature rollout migrate to `v2`. The optional
`WEBHOOK_TIMESTAMP_SIGNATURE_ROLLOUT_AT` deployment variable can override the
default rollout timestamp if a self-hosted environment deployed that change at
a different time.
To upgrade a legacy endpoint, update the receiver to support `v2`, then revoke
and recreate the endpoint to receive a new secret and explicit current event
contract. During a normal secret rotation, install the displayed replacement
secret at the receiver before testing it: new and retried deliveries begin using
the replacement immediately.

Return a `2xx` response promptly after accepting an event. Events are saved to a
persistent delivery queue before network delivery. Non-`2xx` responses and
network errors become eligible for retry after approximately 1 minute, 5
minutes, 15 minutes, 1 hour, 6 hours, and then 24 hours, up to eight attempts.
The next eligible attempt runs on the next integration-worker sweep (every five
minutes in the provided GitHub Actions schedule, which also processes signing
email recovery and durable integration outbox events). After the last attempt the
delivery becomes `dead_letter`; an administrator can replay it immediately from
the Developer integrations screen.

Delivery is at least once, so consumers must store the event `id` and safely
ignore duplicates.

**Recovery rollout:** document lifecycle events and automatic archive-completion
events also persist an outbox intent alongside the originating document/job
change. The outbox worker repairs interrupted enqueueing and retries independent
destinations using a stable event ID. This closes the gap before a delivery row
exists; it does not turn at-least-once delivery into exactly-once delivery or
retroactively recreate historical events with no saved intent.

## Inspect delivery and export recovery history

**Recovery rollout:** open **Developer integrations** for webhook delivery
history, **Cloud Library** for personal automatic exports, or **My Account →
Cloud Storage** for workspace archives.

1. Choose a status, or **Failures** to include failed and dead-letter work.
2. Set **From (UTC)** and **To (UTC)** dates to narrow the history by creation
   date. The end-date control includes that UTC day.
3. Select **Load more** while older results remain; history is not limited to the
   initial page. Select **Refresh** to see recent changes.
4. For webhooks, inspect the attempt records, including interrupted attempts and
   provider/HTTP errors. Manual replay preserves prior attempt history.
5. Correct the underlying issue, then use **Replay** for a webhook or **Retry**
   for an export. Paused endpoints hold deliveries until resume; a revoked
   endpoint cannot be resumed.

History access stays scoped: personal exports belong to the current user and
workspace, while webhook and workspace-archive controls require an administrator.

## Automatically archive completed documents

### Personal automatic exports

1. Open **My Account → Integrations** and connect Google Drive or Dropbox.
2. Open **Cloud Library**.
3. Under **Automatic signed-document archive**, enable a connected provider.
4. Enter the destination folder name and select **Save**.
5. Complete a signing request.

SignWorkflow creates a persistent export job when the document is finalized.
The worker renders the completed signed PDF, creates or reuses the chosen
provider folder, and uploads the file using the signed-in user's delegated OAuth
connection. Failed jobs retry with the same backoff policy as webhooks and are
shown in Cloud Library with a manual **Retry** action. Disabling a rule stops new
jobs; it does not delete prior exports. Automatic uploads use the export job's
stable identity, so retrying after an interrupted provider or database response
reuses the same Google Drive file or Dropbox path instead of creating another
archive copy.

Personal jobs recheck the rule owner's current document access before export.
A personal rule does not grant access to another user's or team's documents.

### Workspace-owned archive destinations

Workspace administrators can also create a shared archive that is independent
of any individual member's personal cloud account:

1. Open **My Account → Cloud Storage**.
2. Under **Workspace-owned signed-document archive**, select **Connect workspace
   destination** for Google Drive or Dropbox and complete OAuth with the account
   intended to hold the workspace archive.
3. Choose a destination folder, enable the archive, and save it.

The encrypted OAuth credential is stored against the workspace. It is not
reused from the administrator's personal export connection, and disconnecting a
member's personal account does not stop this archive. Every newly completed
document in the workspace is queued once per enabled workspace archive rule;
this includes documents that the administrator who configured the archive could
not individually read. This is intentional, so use a provider account and
folder with access controls appropriate for the entire workspace.

Only workspace administrators can connect, change, retry, or disconnect a
workspace archive destination. Disconnecting it disables new workspace archive
jobs immediately; it does not remove files previously placed in the provider.

## Export and verify audit history

Open **My Account → Audit Trail** as a workspace administrator on a plan with
audit export/verification enabled. Apply filters, then use the export controls
or **Verify Hash Chain**. A downloaded audit file is distinct from a completed
signed PDF and from the cloud archive destinations above.

**Recovery rollout:** verification automatically follows all pages. Filters
select matching chains, so verification also checks accessible links outside
the selected action/date filter instead of incorrectly treating filtered-out
links as corruption. The screen reports **Verified** only after all selected
accessible history has been checked successfully. **Incomplete** means the
check did not establish a full result (for example, unsigned legacy records or
history outside the workspace access boundary); **Issues found** indicates hash
or predecessor mismatches. Never interpret an incomplete result as tampering
proof or as successful full verification. Concurrent new audit appends are
serialized by the audit-concurrency implementation; existing damaged history is
not silently repaired.

## Common responses

| Status | Meaning |
| --- | --- |
| `400` | Invalid input or document identifier |
| `401` | Missing or invalid API key |
| `403` | Missing scope, expired trial, or insufficient workspace access |
| `404` | Resource not found in the API key's workspace |
| `409` | Document cannot perform the requested transition |
| `429` | Per-key rate limit exceeded |
| `503` | API or required backing service temporarily unavailable |

## Revoke credentials

Revoke an API key or webhook immediately when it is exposed, no longer used, or
owned by a retired integration. Update the consuming service before revoking a
key during planned rotation to avoid downtime.
