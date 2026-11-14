import { describe, expect, it } from 'vitest';

import { getRecipientIdentityError } from '@/lib/recipient-readiness';

describe('recipient readiness', () => {
  it('keeps a reusable role placeholder in draft state but requires its assignee before sending', () => {
    expect(getRecipientIdentityError([
      { id: 'client-role', name: 'Client', email: '' },
    ])).toBe('Add a valid email for Client before sending.');
  });

  it('accepts complete unique recipient identities', () => {
    expect(getRecipientIdentityError([
      { id: 'client-role', name: 'Client', email: 'client@example.com' },
      { id: 'manager-role', name: 'Manager', email: 'manager@example.com' },
    ])).toBeNull();
  });

  it('rejects duplicate normalized emails', () => {
    expect(getRecipientIdentityError([
      { id: 'client-role', name: 'Client', email: 'Person@example.com' },
      { id: 'manager-role', name: 'Manager', email: ' person@example.com ' },
    ])).toBe('Each recipient must have a unique email address.');
  });
});
