import { afterEach, describe, expect, it } from 'vitest';

import { encryptCloudSecret } from '@/lib/cloud/crypto';
import { decryptSigningToken, encryptSigningToken } from '@/lib/signing-token-crypto';

const originalSigningKey = process.env.SIGNING_TOKEN_ENCRYPTION_KEY;
const originalCloudKey = process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY;
const originalNodeEnv = process.env.NODE_ENV;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('signing token encryption', () => {
  afterEach(() => {
    restore('SIGNING_TOKEN_ENCRYPTION_KEY', originalSigningKey);
    restore('CLOUD_CONNECTIONS_ENCRYPTION_KEY', originalCloudKey);
    restore('NODE_ENV', originalNodeEnv);
  });

  it('uses its own production key when cloud providers are not configured', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY;
    process.env.SIGNING_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

    const encrypted = encryptSigningToken('token-123');

    expect(encrypted).toMatch(/^st1\./);
    expect(decryptSigningToken(encrypted)).toBe('token-123');
  });

  it('can finish unversioned jobs encrypted with the previous cloud key', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.SIGNING_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

    expect(decryptSigningToken(encryptCloudSecret('legacy-token'))).toBe('legacy-token');
  });
});
