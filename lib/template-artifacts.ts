import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { sha256Buffer } from '@/lib/hash';
import {
  copyObject,
  deleteObject,
  getObjectStream,
  getRegion,
  getStorageBucketName,
  getStorageProvider,
  putObjectStream,
  type StorageProvider,
} from '@/lib/s3';

/**
 * Persistent template binaries live in S3-compatible storage.  The public
 * template route remains the only browser-facing URL, so bucket/key details
 * never need to be exposed to clients.
 */
export type TemplateArtifactKind = 'pdf' | 'source';

export type TemplateArtifactStorage = {
  provider: StorageProvider;
  bucket: string;
  region?: string;
  key: string;
  url?: string;
  versionId?: string;
};

export type TemplateArtifact = {
  storage: TemplateArtifactStorage;
  contentType: string;
  size: number;
  sha256?: string;
  originalFileName?: string;
};

export type TemplateArtifacts = {
  pdf: TemplateArtifact;
  source?: TemplateArtifact;
};

export type TemplateArtifactOwner = {
  templateId: string;
  orgId?: string | null;
};

const MAX_TEMPLATE_ARTIFACT_BYTES = 25 * 1024 * 1024;

export const TEMPLATE_ARTIFACT_MAX_BYTES = MAX_TEMPLATE_ARTIFACT_BYTES;

function safeKeySegment(value: unknown, fallback: string): string {
  const candidate = typeof value === 'string' ? value.trim() : String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : fallback;
}

function normalizeExtension(value: string): string {
  const extension = value.trim().toLowerCase().replace(/^\.+/, '');
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : 'bin';
}

function normalizeContentType(value: string): string {
  const contentType = value.trim().toLowerCase();
  return contentType || 'application/octet-stream';
}

function storageUri(storage: Pick<TemplateArtifactStorage, 'provider' | 'bucket' | 'key'>): string {
  return `${storage.provider}://${storage.bucket}/${storage.key}`;
}

export function getTemplateArtifactStorageTarget(): {
  provider: StorageProvider;
  bucket: string;
  region: string;
} {
  const provider = getStorageProvider();
  const bucket = getStorageBucketName(provider);
  if (!bucket) {
    throw new Error('Template object storage is not configured.');
  }

  return { provider, bucket, region: getRegion(provider) };
}

export function buildTemplateArtifactKey(args: TemplateArtifactOwner & {
  kind: TemplateArtifactKind;
  extension: string;
  nonce?: string;
}): string {
  const tenant = args.orgId ? safeKeySegment(args.orgId, 'system') : 'system';
  const templateId = safeKeySegment(args.templateId, 'template');
  const extension = normalizeExtension(args.extension);
  const nonce = safeKeySegment(args.nonce || randomUUID(), randomUUID());

  // Never include a user-controlled filename in the object key.
  return `templates/v1/${tenant}/${templateId}/${args.kind}/${nonce}.${extension}`;
}

export async function storeTemplateArtifact(args: TemplateArtifactOwner & {
  kind: TemplateArtifactKind;
  data: Buffer | Uint8Array;
  contentType: string;
  extension: string;
  originalFileName?: string;
}): Promise<TemplateArtifact> {
  const data = Buffer.from(args.data);
  if (data.length === 0) {
    throw new Error('Template artifact is empty.');
  }
  if (data.length > MAX_TEMPLATE_ARTIFACT_BYTES) {
    throw new Error('Template artifact exceeds the 25 MB limit.');
  }

  const target = getTemplateArtifactStorageTarget();
  const key = buildTemplateArtifactKey(args);
  const storage: TemplateArtifactStorage = {
    provider: target.provider,
    bucket: target.bucket,
    region: target.region,
    key,
    url: storageUri({ provider: target.provider, bucket: target.bucket, key }),
  };

  await putObjectStream({
    bucket: target.bucket,
    key,
    body: data,
    contentType: normalizeContentType(args.contentType),
    contentLength: data.length,
    provider: target.provider,
  });

  return {
    storage,
    contentType: normalizeContentType(args.contentType),
    size: data.length,
    sha256: await sha256Buffer(data),
    ...(args.originalFileName ? { originalFileName: args.originalFileName } : {}),
  };
}

export function isTemplateArtifact(value: unknown): value is TemplateArtifact {
  if (!value || typeof value !== 'object') return false;
  const artifact = value as Partial<TemplateArtifact>;
  const storage = artifact.storage as Partial<TemplateArtifactStorage> | undefined;
  return Boolean(
    storage &&
      (storage.provider === 's3' || storage.provider === 'r2') &&
      typeof storage.bucket === 'string' && storage.bucket &&
      typeof storage.key === 'string' && storage.key &&
      typeof artifact.contentType === 'string' && artifact.contentType &&
      typeof artifact.size === 'number' && Number.isFinite(artifact.size) && artifact.size >= 0
  );
}

export function isTemplateArtifactStorage(value: unknown): value is TemplateArtifactStorage {
  if (!value || typeof value !== 'object') return false;
  const storage = value as Partial<TemplateArtifactStorage>;
  return Boolean(
    (storage.provider === 's3' || storage.provider === 'r2') &&
      typeof storage.bucket === 'string' && storage.bucket &&
      typeof storage.key === 'string' && storage.key
  );
}

export function getTemplatePdfArtifact(template: {
  artifacts?: Partial<TemplateArtifacts> | null;
}): TemplateArtifact | null {
  return isTemplateArtifact(template.artifacts?.pdf) ? template.artifacts.pdf : null;
}

/**
 * Clear the deprecated local-disk reference when a template is persisted with
 * a storage artifact. Mongoose needs `set(path, undefined)` to emit `$unset`,
 * while lightweight route-test doubles are plain objects and should not retain
 * an enumerable `filePath: undefined` property.
 */
export function clearLegacyTemplateFilePath(template: {
  filePath?: unknown;
  set?: (path: string, value: unknown) => unknown;
}): void {
  if (typeof template.set === 'function') {
    template.set('filePath', undefined);
    return;
  }

  delete template.filePath;
}

export function sameTemplateArtifact(
  left: TemplateArtifact | null | undefined,
  right: TemplateArtifact | null | undefined
): boolean {
  if (!left || !right) return false;
  return (
    left.storage.provider === right.storage.provider &&
    left.storage.bucket === right.storage.bucket &&
    left.storage.region === right.storage.region &&
    left.storage.key === right.storage.key
  );
}

export function uniqueTemplateArtifacts(
  artifacts: Array<TemplateArtifact | null | undefined>
): TemplateArtifact[] {
  const seen = new Set<string>();
  return artifacts.flatMap((artifact) => {
    if (!artifact || !isTemplateArtifact(artifact)) return [];
    const id = `${artifact.storage.provider}:${artifact.storage.bucket}:${artifact.storage.region || ''}:${artifact.storage.key}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [artifact];
  });
}

export async function getTemplateStorageStream(storage: TemplateArtifactStorage): Promise<Readable> {
  if (!isTemplateArtifactStorage(storage)) {
    throw new Error('Template artifact storage metadata is invalid.');
  }
  return getObjectStream({
    bucket: storage.bucket,
    key: storage.key,
    region: storage.region,
    provider: storage.provider,
  });
}

export async function getTemplateArtifactStream(artifact: TemplateArtifact): Promise<Readable> {
  if (!isTemplateArtifact(artifact)) {
    throw new Error('Template artifact storage metadata is invalid.');
  }
  return getTemplateStorageStream(artifact.storage);
}

export async function readTemplateStorageBuffer(storage: TemplateArtifactStorage): Promise<Buffer> {
  const stream = await getTemplateStorageStream(storage);
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_TEMPLATE_ARTIFACT_BYTES) {
      stream.destroy();
      throw new Error('Template artifact exceeds the supported 25 MB limit.');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

export async function readTemplateArtifactBuffer(artifact: TemplateArtifact): Promise<Buffer> {
  if (!isTemplateArtifact(artifact)) {
    throw new Error('Template artifact storage metadata is invalid.');
  }
  return readTemplateStorageBuffer(artifact.storage);
}

export async function copyTemplateArtifact(args: TemplateArtifactOwner & {
  source: TemplateArtifact;
  kind: TemplateArtifactKind;
  extension: string;
}): Promise<TemplateArtifact> {
  if (!isTemplateArtifact(args.source)) {
    throw new Error('Source template artifact storage metadata is invalid.');
  }
  if (args.source.size > MAX_TEMPLATE_ARTIFACT_BYTES) {
    throw new Error('Template artifact exceeds the 25 MB limit.');
  }

  const target = getTemplateArtifactStorageTarget();
  const key = buildTemplateArtifactKey(args);
  const storage: TemplateArtifactStorage = {
    provider: target.provider,
    bucket: target.bucket,
    region: target.region,
    key,
    url: storageUri({ provider: target.provider, bucket: target.bucket, key }),
  };
  const sameBackend =
    args.source.storage.provider === target.provider &&
    args.source.storage.bucket === target.bucket &&
    (args.source.storage.region || getRegion(args.source.storage.provider)) === target.region;

  if (sameBackend) {
    await copyObject({
      sourceBucket: args.source.storage.bucket,
      sourceKey: args.source.storage.key,
      destinationBucket: target.bucket,
      destinationKey: key,
      region: target.region,
      provider: target.provider,
    });
  } else {
    const stream = await getTemplateArtifactStream(args.source);
    await putObjectStream({
      bucket: target.bucket,
      key,
      body: stream,
      contentType: args.source.contentType,
      contentLength: args.source.size,
      provider: target.provider,
    });
  }

  return {
    storage,
    contentType: args.source.contentType,
    size: args.source.size,
    ...(args.source.sha256 ? { sha256: args.source.sha256 } : {}),
    ...(args.source.originalFileName ? { originalFileName: args.source.originalFileName } : {}),
  };
}

export async function deleteTemplateArtifact(artifact: TemplateArtifact): Promise<void> {
  if (!isTemplateArtifact(artifact)) return;
  await deleteObject({
    bucket: artifact.storage.bucket,
    key: artifact.storage.key,
    region: artifact.storage.region,
    provider: artifact.storage.provider,
  });
}

export async function deleteTemplateArtifacts(
  artifacts: Array<TemplateArtifact | null | undefined>
): Promise<void> {
  const unique = uniqueTemplateArtifacts(artifacts);
  const results = await Promise.allSettled(unique.map((artifact) => deleteTemplateArtifact(artifact)));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') {
    throw failed.reason;
  }
}
