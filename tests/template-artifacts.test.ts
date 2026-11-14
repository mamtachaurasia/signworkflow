import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  copyObject: vi.fn(),
  deleteObject: vi.fn(),
  getObjectStream: vi.fn(),
  getRegion: vi.fn(),
  getStorageBucketName: vi.fn(),
  getStorageProvider: vi.fn(),
  putObjectStream: vi.fn(),
  sha256Buffer: vi.fn(),
}));

vi.mock('@/lib/hash', () => ({
  sha256Buffer: mocks.sha256Buffer,
}));

vi.mock('@/lib/s3', () => ({
  copyObject: mocks.copyObject,
  deleteObject: mocks.deleteObject,
  getObjectStream: mocks.getObjectStream,
  getRegion: mocks.getRegion,
  getStorageBucketName: mocks.getStorageBucketName,
  getStorageProvider: mocks.getStorageProvider,
  putObjectStream: mocks.putObjectStream,
}));

import {
  buildTemplateArtifactKey,
  copyTemplateArtifact,
  deleteTemplateArtifacts,
  storeTemplateArtifact,
  type TemplateArtifact,
} from '@/lib/template-artifacts';

const SOURCE_ARTIFACT: TemplateArtifact = {
  storage: {
    provider: 's3',
    bucket: 'source-templates',
    region: 'us-east-1',
    key: 'templates/v1/org-1/template-source/pdf/original.pdf',
    url: 's3://source-templates/templates/v1/org-1/template-source/pdf/original.pdf',
  },
  contentType: 'application/pdf',
  size: 12,
  sha256: 'source-sha',
  originalFileName: 'original.pdf',
};

describe('template artifact storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStorageProvider.mockReturnValue('s3');
    mocks.getStorageBucketName.mockReturnValue('template-artifacts');
    mocks.getRegion.mockImplementation((provider: string) => provider === 'r2' ? 'auto' : 'us-east-1');
    mocks.putObjectStream.mockResolvedValue(undefined);
    mocks.copyObject.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.sha256Buffer.mockResolvedValue('artifact-sha');
  });

  it('builds immutable, tenant-scoped keys without unsafe path segments', () => {
    const first = buildTemplateArtifactKey({
      orgId: 'org_1',
      templateId: 'template-1',
      kind: 'pdf',
      extension: '.PDF',
      nonce: 'revision_1',
    });
    const second = buildTemplateArtifactKey({
      orgId: 'org_1',
      templateId: 'template-1',
      kind: 'pdf',
      extension: 'pdf',
      nonce: 'revision_2',
    });
    const unsafe = buildTemplateArtifactKey({
      orgId: '../../other-tenant',
      templateId: '../outside',
      kind: 'source',
      extension: '../../docx',
      nonce: '../unsafe',
    });

    expect(first).toBe('templates/v1/org_1/template-1/pdf/revision_1.pdf');
    expect(second).toBe('templates/v1/org_1/template-1/pdf/revision_2.pdf');
    expect(second).not.toBe(first);
    expect(unsafe).toMatch(/^templates\/v1\/system\/template\/source\/[A-Za-z0-9_-]+\.bin$/);
    expect(unsafe).not.toContain('..');
  });

  it.each([
    ['s3', 'aws-template-bucket', 'us-east-1'],
    ['r2', 'r2-template-bucket', 'auto'],
  ] as const)('stores a PDF with %s metadata', async (provider, bucket, region) => {
    mocks.getStorageProvider.mockReturnValue(provider);
    mocks.getStorageBucketName.mockReturnValue(bucket);
    mocks.getRegion.mockReturnValue(region);
    const data = Buffer.from('%PDF-1.7\n');

    const artifact = await storeTemplateArtifact({
      orgId: 'org-1',
      templateId: 'template-1',
      kind: 'pdf',
      data,
      contentType: 'APPLICATION/PDF',
      extension: 'pdf',
      originalFileName: 'Agreement.pdf',
    });

    expect(artifact).toMatchObject({
      storage: {
        provider,
        bucket,
        region,
        key: expect.stringMatching(/^templates\/v1\/org-1\/template-1\/pdf\/[A-Za-z0-9_-]+\.pdf$/),
        url: expect.stringMatching(new RegExp(`^${provider}://${bucket}/templates/v1/org-1/template-1/pdf/`)),
      },
      contentType: 'application/pdf',
      size: data.length,
      sha256: 'artifact-sha',
      originalFileName: 'Agreement.pdf',
    });
    expect(mocks.putObjectStream).toHaveBeenCalledWith(expect.objectContaining({
      bucket,
      key: artifact.storage.key,
      body: data,
      contentType: 'application/pdf',
      contentLength: data.length,
      provider,
    }));
    expect(mocks.copyObject).not.toHaveBeenCalled();
  });

  it('uses a server-side CopyObject operation for a source in the same backend', async () => {
    mocks.getStorageProvider.mockReturnValue('s3');
    mocks.getStorageBucketName.mockReturnValue('source-templates');
    mocks.getRegion.mockReturnValue('us-east-1');

    const artifact = await copyTemplateArtifact({
      orgId: 'org-1',
      templateId: 'template-copy',
      source: SOURCE_ARTIFACT,
      kind: 'pdf',
      extension: 'pdf',
    });

    expect(mocks.copyObject).toHaveBeenCalledWith({
      sourceBucket: 'source-templates',
      sourceKey: SOURCE_ARTIFACT.storage.key,
      destinationBucket: 'source-templates',
      destinationKey: artifact.storage.key,
      region: 'us-east-1',
      provider: 's3',
    });
    expect(mocks.getObjectStream).not.toHaveBeenCalled();
    expect(mocks.putObjectStream).not.toHaveBeenCalled();
    expect(artifact).toMatchObject({
      contentType: SOURCE_ARTIFACT.contentType,
      size: SOURCE_ARTIFACT.size,
      sha256: SOURCE_ARTIFACT.sha256,
      originalFileName: SOURCE_ARTIFACT.originalFileName,
      storage: {
        provider: 's3',
        bucket: 'source-templates',
        region: 'us-east-1',
      },
    });
    expect(artifact.storage.key).not.toBe(SOURCE_ARTIFACT.storage.key);
  });

  it('streams through the active backend when copying across storage backends', async () => {
    mocks.getStorageProvider.mockReturnValue('r2');
    mocks.getStorageBucketName.mockReturnValue('r2-template-bucket');
    mocks.getRegion.mockReturnValue('auto');
    const sourceStream = Readable.from([Buffer.from('%PDF-1.7\n')]);
    mocks.getObjectStream.mockResolvedValue(sourceStream);

    const artifact = await copyTemplateArtifact({
      orgId: 'org-1',
      templateId: 'template-copy',
      source: SOURCE_ARTIFACT,
      kind: 'pdf',
      extension: 'pdf',
    });

    expect(mocks.copyObject).not.toHaveBeenCalled();
    expect(mocks.getObjectStream).toHaveBeenCalledWith({
      bucket: SOURCE_ARTIFACT.storage.bucket,
      key: SOURCE_ARTIFACT.storage.key,
      region: SOURCE_ARTIFACT.storage.region,
      provider: 's3',
    });
    expect(mocks.putObjectStream).toHaveBeenCalledWith({
      bucket: 'r2-template-bucket',
      key: artifact.storage.key,
      body: sourceStream,
      contentType: SOURCE_ARTIFACT.contentType,
      contentLength: SOURCE_ARTIFACT.size,
      provider: 'r2',
    });
    expect(artifact.storage).toMatchObject({
      provider: 'r2',
      bucket: 'r2-template-bucket',
      region: 'auto',
    });
  });

  it('does not copy an artifact beyond the template size limit', async () => {
    const oversized: TemplateArtifact = { ...SOURCE_ARTIFACT, size: 25 * 1024 * 1024 + 1 };

    await expect(copyTemplateArtifact({
      orgId: 'org-1',
      templateId: 'template-copy',
      source: oversized,
      kind: 'pdf',
      extension: 'pdf',
    })).rejects.toThrow('25 MB');

    expect(mocks.copyObject).not.toHaveBeenCalled();
    expect(mocks.getObjectStream).not.toHaveBeenCalled();
    expect(mocks.putObjectStream).not.toHaveBeenCalled();
  });

  it('deduplicates matching PDF and source references before deleting objects', async () => {
    const duplicatedReference: TemplateArtifact = {
      ...SOURCE_ARTIFACT,
      storage: { ...SOURCE_ARTIFACT.storage },
    };
    const distinctArtifact: TemplateArtifact = {
      ...SOURCE_ARTIFACT,
      storage: {
        ...SOURCE_ARTIFACT.storage,
        key: 'templates/v1/org-1/template-source/source/original.docx',
      },
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    await deleteTemplateArtifacts([SOURCE_ARTIFACT, duplicatedReference, distinctArtifact]);

    expect(mocks.deleteObject).toHaveBeenCalledTimes(2);
    expect(mocks.deleteObject).toHaveBeenCalledWith({
      bucket: SOURCE_ARTIFACT.storage.bucket,
      key: SOURCE_ARTIFACT.storage.key,
      region: SOURCE_ARTIFACT.storage.region,
      provider: SOURCE_ARTIFACT.storage.provider,
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith({
      bucket: distinctArtifact.storage.bucket,
      key: distinctArtifact.storage.key,
      region: distinctArtifact.storage.region,
      provider: distinctArtifact.storage.provider,
    });
  });
});
