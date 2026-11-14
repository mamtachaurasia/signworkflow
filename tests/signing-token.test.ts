import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assignIssuedSigningToken,
  buildSigningTokenLookup,
  hashSigningToken,
  issueSigningToken,
  recipientMatchesSigningToken,
} from '@/lib/signing-token';

describe('signing token helpers', () => {
  const originalPepper = process.env.SIGNING_TOKEN_PEPPER;

  beforeEach(() => {
    process.env.SIGNING_TOKEN_PEPPER = 'test-pepper';
  });

  afterEach(() => {
    if (originalPepper === undefined) {
      delete process.env.SIGNING_TOKEN_PEPPER;
      return;
    }
    process.env.SIGNING_TOKEN_PEPPER = originalPepper;
  });

  it('issues a token and matching hash', () => {
    const issuedSigningToken = issueSigningToken();

    expect(issuedSigningToken.token).toMatch(/^[a-f0-9]{64}$/);
    expect(issuedSigningToken.tokenHash).toBe(hashSigningToken(issuedSigningToken.token));
  });

  it('matches both hashed and legacy raw signing tokens', () => {
    const issuedSigningToken = issueSigningToken();

    expect(
      recipientMatchesSigningToken(
        { signingTokenHash: issuedSigningToken.tokenHash },
        issuedSigningToken.token
      )
    ).toBe(true);
    expect(
      recipientMatchesSigningToken({ signingToken: issuedSigningToken.token }, issuedSigningToken.token)
    ).toBe(true);
  });

  it('assigns only the hash to the persisted recipient payload', () => {
    const issuedSigningToken = issueSigningToken();
    const recipient = {
      signingToken: issuedSigningToken.token,
    };

    assignIssuedSigningToken(recipient, issuedSigningToken);

    expect(recipient.signingToken).toBeUndefined();
    expect(recipient.signingTokenHash).toBe(issuedSigningToken.tokenHash);
  });

  it('builds a lookup that supports hashed and legacy raw token storage', () => {
    const lookup = buildSigningTokenLookup('legacy-token');

    expect(lookup).toEqual({
      $or: [
        { 'recipients.signingTokenHash': hashSigningToken('legacy-token') },
        { 'recipients.signingToken': 'legacy-token' },
      ],
    });
  });
});
