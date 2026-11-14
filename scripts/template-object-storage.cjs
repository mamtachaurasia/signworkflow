/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS helper used by Node maintenance scripts. */
const { createHash, randomUUID } = require('node:crypto');
const {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const DEFAULT_S3_REGION = 'us-east-1';
const DEFAULT_R2_REGION = 'auto';
const TEMPLATE_ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;

function storageProvider() {
  const configured = String(process.env.STORAGE_PROVIDER || 's3').trim().toLowerCase();
  if (configured === 's3' || configured === 'r2') return configured;
  throw new Error('Invalid STORAGE_PROVIDER. Expected "s3" or "r2".');
}

function storageConfig() {
  const provider = storageProvider();
  const bucket = provider === 'r2'
    ? process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME
    : process.env.S3_BUCKET_NAME;
  const region = provider === 'r2'
    ? process.env.R2_REGION || DEFAULT_R2_REGION
    : process.env.REGION_AWS || DEFAULT_S3_REGION;

  if (!bucket) {
    throw new Error(`${provider.toUpperCase()} bucket is not configured.`);
  }

  if (provider === 'r2') {
    const endpoint = process.env.R2_ENDPOINT || (
      process.env.R2_ACCOUNT_ID
        ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : undefined
    );
    if (!endpoint) {
      throw new Error('R2_ENDPOINT or R2_ACCOUNT_ID is required when STORAGE_PROVIDER=r2.');
    }
    if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials are required when STORAGE_PROVIDER=r2.');
    }
    return {
      provider,
      bucket,
      region,
      client: new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      }),
    };
  }

  const credentials = process.env.ACCESS_AWS_KEY_ID && process.env.SECRET_AWS_ACCESS_KEY
    ? {
        accessKeyId: process.env.ACCESS_AWS_KEY_ID,
        secretAccessKey: process.env.SECRET_AWS_ACCESS_KEY,
      }
    : undefined;
  return { provider, bucket, region, client: new S3Client({ region, credentials }) };
}

function safeKeySegment(value, fallback) {
  const candidate = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : fallback;
}

function safeExtension(value) {
  const extension = String(value || '').trim().toLowerCase().replace(/^\.+/, '');
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : 'bin';
}

function objectKey({ templateId, orgId, kind, extension }) {
  const tenant = orgId ? safeKeySegment(orgId, 'system') : 'system';
  const template = safeKeySegment(templateId, 'template');
  return `templates/v1/${tenant}/${template}/${kind}/${randomUUID()}.${safeExtension(extension)}`;
}

function artifactUrl({ provider, bucket, key }) {
  return `${provider}://${bucket}/${key}`;
}

async function putTemplateArtifact({ templateId, orgId, kind, extension, contentType, data, originalFileName }) {
  const buffer = Buffer.from(data);
  if (buffer.length === 0) {
    throw new Error('Template artifact is empty.');
  }
  if (buffer.length > TEMPLATE_ARTIFACT_MAX_BYTES) {
    throw new Error('Template artifact exceeds the 25 MB limit.');
  }
  const config = storageConfig();
  const key = objectKey({ templateId, orgId, kind, extension });
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ContentLength: buffer.length,
  }));

  return {
    storage: {
      provider: config.provider,
      bucket: config.bucket,
      region: config.region,
      key,
      url: artifactUrl({ provider: config.provider, bucket: config.bucket, key }),
    },
    contentType,
    size: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    ...(originalFileName ? { originalFileName } : {}),
  };
}

async function deleteTemplateArtifact(artifact) {
  if (!artifact?.storage?.bucket || !artifact.storage.key) return;
  const config = storageConfig();
  const provider = artifact.storage.provider || config.provider;
  if (provider !== config.provider) {
    throw new Error(`Cannot delete a ${provider} artifact with the configured ${config.provider} migration client.`);
  }
  await config.client.send(new DeleteObjectCommand({
    Bucket: artifact.storage.bucket,
    Key: artifact.storage.key,
  }));
}

module.exports = {
  TEMPLATE_ARTIFACT_MAX_BYTES,
  deleteTemplateArtifact,
  putTemplateArtifact,
  storageProvider,
  storageConfig,
};
