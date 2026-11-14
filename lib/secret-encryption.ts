import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function normalizeEncryptionKeyInput(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function decodeBase64Key(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length > 0 ? decoded : null;
}

/** Accept a 32-byte key as hexadecimal, base64, or plain text. */
export function parseAes256Key(value: string, environmentVariable: string): Buffer {
  const normalized = normalizeEncryptionKeyInput(value);
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) return Buffer.from(normalized, 'hex');

  const asBase64 = decodeBase64Key(normalized);
  if (asBase64?.length === 32) return asBase64;
  if (normalized.length === 32) return Buffer.from(normalized, 'utf-8');

  throw new Error(`${environmentVariable} must be 32 bytes (hex/base64/plain).`);
}

export function encryptAes256Gcm(secret: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptAes256Gcm(encryptedSecret: string, key: Buffer): string {
  const payload = Buffer.from(encryptedSecret, 'base64url');
  if (payload.length < 28) throw new Error('Encrypted secret is invalid.');

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}
