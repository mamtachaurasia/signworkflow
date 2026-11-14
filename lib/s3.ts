import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export type StorageProvider = 's3' | 'r2';

const DEFAULT_S3_REGION = 'us-east-1';
const DEFAULT_R2_REGION = 'auto';

// ---------------------------------------------------------------------------
// Shared provider selection
// ---------------------------------------------------------------------------

// Keep for backward compatibility with existing imports and env naming.
export const REGION_AWS = process.env.REGION_AWS || DEFAULT_S3_REGION;

export function getStorageProvider(): StorageProvider {
  const configured = (process.env.STORAGE_PROVIDER || 's3').trim().toLowerCase();
  if (configured === 's3' || configured === 'r2') {
    return configured;
  }

  // A typo must never silently write persistent artifacts to the wrong
  // backend. Leaving this unset remains backward-compatible with S3.
  throw new Error('Invalid STORAGE_PROVIDER. Expected "s3" or "r2".');
}

export function normalizeStorageProvider(value: unknown): StorageProvider {
  if (value === undefined || value === null || value === '') {
    return getStorageProvider();
  }
  if (value === 's3' || value === 'r2') {
    return value;
  }

  throw new Error('Invalid storage provider metadata. Expected "s3" or "r2".');
}

// ---------------------------------------------------------------------------
// AWS S3 configuration
// ---------------------------------------------------------------------------

function getS3Credentials() {
  if (!process.env.ACCESS_AWS_KEY_ID || !process.env.SECRET_AWS_ACCESS_KEY) {
    return undefined;
  }

  return {
    accessKeyId: process.env.ACCESS_AWS_KEY_ID,
    secretAccessKey: process.env.SECRET_AWS_ACCESS_KEY,
  };
}

// ---------------------------------------------------------------------------
// Cloudflare R2 configuration
// ---------------------------------------------------------------------------

function getR2Endpoint(): string | undefined {
  const configuredEndpoint = process.env.R2_ENDPOINT?.trim();
  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId) {
    return undefined;
  }

  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function getR2Credentials() {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return undefined;
  }

  return {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  };
}

// ---------------------------------------------------------------------------
// Shared storage helpers
// ---------------------------------------------------------------------------

export function getRegion(provider: StorageProvider = getStorageProvider()): string {
  return provider === 'r2'
    ? (process.env.R2_REGION || DEFAULT_R2_REGION)
    : REGION_AWS;
}

export function getStorageBucketName(provider: StorageProvider = getStorageProvider()): string | undefined {
  if (provider === 'r2') {
    return process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  }

  return process.env.S3_BUCKET_NAME;
}

function createStorageClient(provider: StorageProvider = getStorageProvider(), region = getRegion(provider)): S3Client {
  // Cloudflare R2 uses an S3-compatible API with a custom endpoint.
  if (provider === 'r2') {
    return new S3Client({
      region,
      endpoint: getR2Endpoint(),
      credentials: getR2Credentials(),
      forcePathStyle: true,
    });
  }

  return new S3Client({
    region,
    credentials: getS3Credentials(),
  });
}

// Keep the historical export name for compatibility with existing imports/tests.
export const s3 = createStorageClient();

function getErrorInfo(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'UnknownError', message: String(error) };
}

// ---------------------------------------------------------------------------
// Shared object operations
// ---------------------------------------------------------------------------

export async function putObjectStream(params: {
  bucket: string;
  key: string;
  body: Readable | Buffer | Uint8Array;
  contentType: string;
  contentLength?: number;
  provider?: StorageProvider;
}): Promise<{ etag?: string }> {
  const provider = params.provider || getStorageProvider();
  const client = provider === getStorageProvider() ? s3 : createStorageClient(provider);
  const cmd = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  try {
    const res = await client.send(cmd);
    return { etag: res.ETag };
  } catch (error: unknown) {
    const err = getErrorInfo(error);
    if (err.name === 'NoSuchBucket') {
      throw new Error(
        `${provider.toUpperCase()} bucket '${params.bucket}' does not exist or is unreachable in region '${getRegion(provider)}'.`
      );
    }
    throw error;
  }
}

export async function getObjectStream(params: { bucket: string; key: string; region?: string; provider?: StorageProvider }) {
  const provider = params.provider || getStorageProvider();
  const region = params.region || getRegion(provider);
  const client = provider === getStorageProvider() && region === getRegion(provider)
    ? s3
    : createStorageClient(provider, region);
  const cmd = new GetObjectCommand({ Bucket: params.bucket, Key: params.key });
  try {
    const res = await client.send(cmd);
    if (!res.Body) throw new Error('S3 object body is empty');
    // In AWS SDK v3, Body is a Readable stream in Node.js
    return res.Body as Readable;
  } catch (error: unknown) {
    const err = getErrorInfo(error);
    if (err.name !== 'NoSuchKey') {
      console.error(
        `${provider.toUpperCase()} GetObject Error: ${err.name} - ${err.message} ` +
        `(Bucket: ${params.bucket}, Key: ${params.key}, Region: ${region})`
      );
    }
    throw error;
  }
}

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteObject(params: { bucket: string; key: string; region?: string; provider?: StorageProvider }) {
  const provider = params.provider || getStorageProvider();
  const region = params.region || getRegion(provider);
  const client = provider === getStorageProvider() && region === getRegion(provider)
    ? s3
    : createStorageClient(provider, region);
  const cmd = new DeleteObjectCommand({ Bucket: params.bucket, Key: params.key });
  try {
    await client.send(cmd);
  } catch (error: unknown) {
    const err = getErrorInfo(error);
    // It's generally safe to ignore NoSuchKey on delete, as the file is already gone.
    if (err.name !== 'NoSuchKey') {
      console.error(
        `${provider.toUpperCase()} DeleteObject Error: ${err.name} - ${err.message} ` +
        `(Bucket: ${params.bucket}, Key: ${params.key}, Region: ${region})`
      );
      throw error;
    }
  }
}

export async function copyObject(params: {
  sourceBucket: string;
  sourceKey: string;
  destinationBucket: string;
  destinationKey: string;
  region?: string;
  provider?: StorageProvider;
}) {
  const provider = params.provider || getStorageProvider();
  const region = params.region || getRegion(provider);
  const client = provider === getStorageProvider() && region === getRegion(provider)
    ? s3
    : createStorageClient(provider, region);
  const cmd = new CopyObjectCommand({
    Bucket: params.destinationBucket,
    CopySource: `${params.sourceBucket}/${params.sourceKey}`,
    Key: params.destinationKey,
  });
  try {
    await client.send(cmd);
  } catch (error: unknown) {
    const err = getErrorInfo(error);
    console.error(
      `${provider.toUpperCase()} CopyObject Error: ${err.name} - ${err.message} ` +
      `(Source: ${params.sourceBucket}/${params.sourceKey}, Dest: ${params.destinationBucket}/${params.destinationKey})`
    );
    throw error;
  }
}
