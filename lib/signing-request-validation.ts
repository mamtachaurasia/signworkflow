import { validateFieldValue } from '@/lib/field-rules';
import type { FieldPropertySettings } from '@/types/types';

export type SigningRequestRecipient = {
  id: string;
  email: string;
  name: string;
  role: 'signer' | 'approver' | 'viewer';
  isCC?: boolean;
};

const VIEWER_ALLOWED_FIELD_TYPES = new Set(['signature', 'stamp']);
const APPROVER_FORBIDDEN_FIELD_TYPES = new Set(['signature', 'initials', 'stamp']);

export function validateUniqueRecipients(recipients: SigningRequestRecipient[]): string | null {
  const ids = new Set<string>();
  const emails = new Set<string>();
  for (const recipient of recipients) {
    const normalizedEmail = recipient.email.trim().toLowerCase();
    if (ids.has(recipient.id)) return 'Recipient IDs must be unique.';
    if (emails.has(normalizedEmail)) return 'Recipient email addresses must be unique.';
    ids.add(recipient.id);
    emails.add(normalizedEmail);
  }
  return null;
}

export function validateRoleFieldRestrictions(
  recipients: SigningRequestRecipient[],
  requestFields: unknown[] | undefined
): string | null {
  if (!Array.isArray(requestFields) || requestFields.length === 0) return null;
  const roleByRecipientId = new Map(recipients.map((recipient) => [recipient.id, recipient.role] as const));
  for (const rawField of requestFields) {
    const field = rawField as { recipientId?: string | null; type?: string };
    if (!field?.recipientId) continue;
    const role = roleByRecipientId.get(field.recipientId);
    if (!role) continue;
    const fieldType = String(field.type || '').toLowerCase();
    if (role === 'viewer' && !VIEWER_ALLOWED_FIELD_TYPES.has(fieldType)) {
      return 'Viewer recipients can only be assigned signature or stamp fields.';
    }
    if (role === 'approver' && APPROVER_FORBIDDEN_FIELD_TYPES.has(fieldType)) {
      return 'Approver recipients cannot be assigned signer-only fields.';
    }
  }
  return null;
}

export function validateSignerFieldAssignments(
  recipients: SigningRequestRecipient[],
  requestFields: unknown[] | undefined
): string | null {
  const signerIdsWithRequiredFields = new Set(
    (Array.isArray(requestFields) ? requestFields : [])
      .filter((rawField) => {
        const field = rawField as {
          recipientId?: string | null;
          required?: boolean;
          fieldOwner?: 'me' | 'recipients';
        };
        return field.fieldOwner !== 'me' && field.required !== false && Boolean(field.recipientId);
      })
      .map((rawField) => String((rawField as { recipientId: string }).recipientId))
  );
  const missingSigners = recipients.filter(
    (recipient) =>
      recipient.role === 'signer' &&
      !recipient.isCC &&
      !signerIdsWithRequiredFields.has(recipient.id)
  );
  if (missingSigners.length === 0) return null;

  const names = missingSigners.map((recipient) => recipient.name).join(', ');
  return `Assign at least one required field to every signer before sending. Missing: ${names}.`;
}

export function validateSenderFieldValues(requestFields: unknown[] | undefined): string | null {
  for (const rawField of Array.isArray(requestFields) ? requestFields : []) {
    const field = rawField as {
      id?: unknown;
      type?: unknown;
      required?: boolean;
      value?: unknown;
      settings?: FieldPropertySettings;
      fieldOwner?: string;
    };
    if (field.fieldOwner !== 'me') continue;
    const validation = validateFieldValue({
      type: typeof field.type === 'string' ? field.type : undefined,
      required: field.required,
      value: field.value,
      settings: field.settings,
    });
    if (!validation.valid) {
      const fieldId = typeof field.id === 'string' && field.id.trim() ? ` "${field.id.trim()}"` : '';
      return `Complete sender field${fieldId} before sending. ${validation.reason || 'The configured value is invalid.'}`;
    }
  }
  return null;
}
