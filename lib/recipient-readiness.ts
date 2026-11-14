type RecipientIdentity = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate draft recipient placeholders before the send dialog can continue. */
export function getRecipientIdentityError(recipients: RecipientIdentity[]): string | null {
  const ids = new Set<string>();
  const emails = new Set<string>();

  for (const recipient of recipients) {
    const id = String(recipient.id || '').trim();
    const name = String(recipient.name || '').trim();
    const email = String(recipient.email || '').trim().toLowerCase();

    if (!name) return 'Add a name for every recipient before sending.';
    if (!EMAIL_PATTERN.test(email)) {
      return `Add a valid email for ${name} before sending.`;
    }
    if (!id || ids.has(id)) return 'Each recipient must have a unique ID.';
    if (emails.has(email)) return 'Each recipient must have a unique email address.';

    ids.add(id);
    emails.add(email);
  }

  return null;
}
