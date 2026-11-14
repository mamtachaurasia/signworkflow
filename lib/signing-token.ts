import { createHash, randomBytes } from 'crypto';

const SIGNING_TOKEN_BYTES = 32;

export type RecipientTokenShape = {
  signingToken?: unknown;
  signingTokenHash?: unknown;
};

export interface IssuedSigningToken {
  token: string;
  tokenHash: string;
}

export function hashSigningToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new Error('Signing token is required');
  }

  const pepper = process.env.SIGNING_TOKEN_PEPPER || '';
  return createHash('sha256').update(`${normalized}:${pepper}`).digest('hex');
}

export function issueSigningToken(): IssuedSigningToken {
  const token = randomBytes(SIGNING_TOKEN_BYTES).toString('hex');
  return {
    token,
    tokenHash: hashSigningToken(token),
  };
}

export function buildSigningTokenLookup(token: string): Record<string, unknown> {
  const normalized = token.trim();
  return {
    $or: [
      { 'recipients.signingTokenHash': hashSigningToken(normalized) },
      { 'recipients.signingToken': normalized },
    ],
  };
}

export function recipientMatchesSigningToken(
  recipient: RecipientTokenShape | null | undefined,
  token: string
): boolean {
  if (!recipient) {
    return false;
  }

  const normalized = token.trim();
  if (!normalized) {
    return false;
  }

  const expectedHash = hashSigningToken(normalized);
  if (typeof recipient.signingTokenHash === 'string' && recipient.signingTokenHash.length > 0) {
    if (recipient.signingTokenHash === expectedHash) {
      return true;
    }
  }

  return typeof recipient.signingToken === 'string' && recipient.signingToken === normalized;
}

export function assignIssuedSigningToken(
  recipient: RecipientTokenShape,
  issuedToken: IssuedSigningToken
): void {
  recipient.signingTokenHash = issuedToken.tokenHash;
  if ('signingToken' in recipient) {
    recipient.signingToken = undefined;
  }
}
