import { describe, it, expect } from 'vitest';
import { sanitizeRecipient, sanitizeRecipients } from '../lib/recipient-sanitizer';

describe('sanitizeRecipient', () => {
  it('removes signing tokens and preserves other fields', () => {
    const input = {
      id: 'r1',
      email: 'a@example.com',
      signingToken: 'secret',
      signingTokenHash: 'hashed-secret',
      status: 'sent',
    };
    const result = sanitizeRecipient(input);
    expect(result.signingToken).toBeUndefined();
    expect(result.signingTokenHash).toBeUndefined();
    expect(result.id).toBe('r1');
    expect(result.email).toBe('a@example.com');
    expect(result.status).toBe('sent');
  });
});

describe('sanitizeRecipients', () => {
  it('strips tokens from list', () => {
    const input = [
      { id: 'r1', signingToken: 'a', signingTokenHash: 'hash-a' },
      { id: 'r2', signingToken: 'b', signingTokenHash: 'hash-b', role: 'signer' },
    ];
    const result = sanitizeRecipients(input);
    expect(result[0].signingToken).toBeUndefined();
    expect(result[0].signingTokenHash).toBeUndefined();
    expect(result[1].signingToken).toBeUndefined();
    expect(result[1].signingTokenHash).toBeUndefined();
    expect(result[1].role).toBe('signer');
  });
});
