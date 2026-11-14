import { afterEach, describe, expect, it } from 'vitest';

import { getStorageProvider, normalizeStorageProvider } from '@/lib/s3';

const originalStorageProvider = process.env.STORAGE_PROVIDER;

afterEach(() => {
  if (originalStorageProvider === undefined) {
    delete process.env.STORAGE_PROVIDER;
  } else {
    process.env.STORAGE_PROVIDER = originalStorageProvider;
  }
});

describe('storage provider selection', () => {
  it('defaults an omitted provider to S3 for backwards compatibility', () => {
    delete process.env.STORAGE_PROVIDER;

    expect(getStorageProvider()).toBe('s3');
    expect(normalizeStorageProvider(undefined)).toBe('s3');
  });

  it('accepts only the two supported persistent storage backends', () => {
    process.env.STORAGE_PROVIDER = 'r2';

    expect(getStorageProvider()).toBe('r2');
    expect(normalizeStorageProvider('s3')).toBe('s3');
    expect(normalizeStorageProvider('r2')).toBe('r2');
  });

  it('fails closed for invalid environment or persisted provider values', () => {
    process.env.STORAGE_PROVIDER = 'r22';

    expect(getStorageProvider).toThrow('Invalid STORAGE_PROVIDER');
    expect(() => normalizeStorageProvider('filesystem')).toThrow('Invalid storage provider metadata');
  });
});
