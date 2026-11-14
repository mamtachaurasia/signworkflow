import { afterEach, describe, expect, it } from 'vitest';

import { decryptCloudSecret, encryptCloudSecret } from '@/lib/cloud/crypto';

const ORIGINAL_KEY = process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('cloud crypto', () => {
  afterEach(() => {
    if (typeof ORIGINAL_KEY === 'undefined') {
      delete process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY;
    } else {
      process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY = ORIGINAL_KEY;
    }

    if (typeof ORIGINAL_NODE_ENV === 'undefined') {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
  });

  it('accepts a 64-character hex key', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY =
      'cb7fe477180eec851f8bb0c68de906d770afd886b7ca24bd56e5accc228af4fd';

    const encrypted = encryptCloudSecret('token-123');
    expect(decryptCloudSecret(encrypted)).toBe('token-123');
  });

  it('accepts the same hex key when wrapped in quotes', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY =
      '"cb7fe477180eec851f8bb0c68de906d770afd886b7ca24bd56e5accc228af4fd"';

    const encrypted = encryptCloudSecret('token-quoted');
    expect(decryptCloudSecret(encrypted)).toBe('token-quoted');
  });

  it('rejects malformed keys', () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUD_CONNECTIONS_ENCRYPTION_KEY = 'bad';

    expect(() => encryptCloudSecret('token-bad')).toThrow(
      'CLOUD_CONNECTIONS_ENCRYPTION_KEY must be 32 bytes (hex/base64/plain).'
    );
  });
});
