import { createHash } from 'crypto';

import { decryptCloudSecret } from '@/lib/cloud/crypto';
import { decryptAes256Gcm, encryptAes256Gcm, parseAes256Key } from '@/lib/secret-encryption';

const SIGNING_TOKEN_CIPHER_VERSION = 'st1.';
let warnedMissingSigningKey = false;

function getDevelopmentSigningKey(): Buffer {
  const seed =
    process.env.SIGNING_TOKEN_DEV_FALLBACK_SEED ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    'contract-esign-dev-signing-token-key';
  return createHash('sha256').update(`signing-token:${seed}`).digest();
}

function getSigningTokenEncryptionKey(): Buffer {
  const raw = process.env.SIGNING_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    if (!warnedMissingSigningKey) {
      warnedMissingSigningKey = true;
      console.warn(
        'SIGNING_TOKEN_ENCRYPTION_KEY is not set. Using a deterministic fallback key; configure SIGNING_TOKEN_ENCRYPTION_KEY for dedicated production encryption.'
      );
    }
    return getDevelopmentSigningKey();
  }
  return parseAes256Key(raw, 'SIGNING_TOKEN_ENCRYPTION_KEY');
}

/** New deliveries are self-identifying so a deployment can finish any jobs
 * written by the earlier cloud-key implementation during an upgrade. */
export function encryptSigningToken(token: string): string {
  return `${SIGNING_TOKEN_CIPHER_VERSION}${encryptAes256Gcm(token, getSigningTokenEncryptionKey())}`;
}

export function decryptSigningToken(encryptedToken: string): string {
  if (!encryptedToken.startsWith(SIGNING_TOKEN_CIPHER_VERSION)) {
    return decryptCloudSecret(encryptedToken);
  }
  return decryptAes256Gcm(
    encryptedToken.slice(SIGNING_TOKEN_CIPHER_VERSION.length),
    getSigningTokenEncryptionKey()
  );
}
