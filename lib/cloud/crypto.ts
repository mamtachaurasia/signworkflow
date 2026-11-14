import { createHash } from 'crypto';
import { decryptAes256Gcm, encryptAes256Gcm, parseAes256Key } from '@/lib/secret-encryption';

let warnedMissingCloudKey = false;

function getDevFallbackKey(): Buffer {
  const seed =
    process.env.CLOUD_CONNECTIONS_DEV_FALLBACK_SEED ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    'contract-esign-dev-cloud-connections-key';
  return createHash('sha256').update(seed).digest();
}

function getEncryptionKey(): Buffer {
  const raw = process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV !== 'production') {
      if (!warnedMissingCloudKey) {
        warnedMissingCloudKey = true;
        console.warn(
          'CLOUD_CONNECTIONS_ENCRYPTION_KEY is not set. Using deterministic dev fallback key; configure CLOUD_CONNECTIONS_ENCRYPTION_KEY for production.'
        );
      }
      return getDevFallbackKey();
    }
    throw new Error('CLOUD_CONNECTIONS_ENCRYPTION_KEY is required for cloud connection secret encryption.');
  }

  return parseAes256Key(raw, 'CLOUD_CONNECTIONS_ENCRYPTION_KEY');
}

export function isCloudEncryptionConfigurationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('CLOUD_CONNECTIONS_ENCRYPTION_KEY is required') ||
    error.message.includes('CLOUD_CONNECTIONS_ENCRYPTION_KEY must be 32 bytes')
  );
}

export function encryptCloudSecret(secret: string): string {
  return encryptAes256Gcm(secret, getEncryptionKey());
}

export function decryptCloudSecret(encryptedSecret: string): string {
  return decryptAes256Gcm(encryptedSecret, getEncryptionKey());
}
