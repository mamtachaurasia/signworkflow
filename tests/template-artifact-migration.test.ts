import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

// These maintenance scripts deliberately use CommonJS so they can be invoked
// directly by Node in production. Requiring them here exercises the exact
// migration policy instead of duplicating it in a test-only helper.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require('../scripts/migrate-template-artifacts.js') as {
  TEMPLATE_ARTIFACT_MAX_BYTES: number;
  getArtifactState(value: unknown): 'missing' | 'partial' | 'valid';
  migrateTemplate(
    collection: { updateOne: (...args: unknown[]) => Promise<unknown> },
    template: Record<string, unknown>,
    options: { dryRun: boolean }
  ): Promise<Record<string, unknown>>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const objectStorage = require('../scripts/template-object-storage.cjs') as {
  storageProvider(): 's3' | 'r2';
};

const originalStorageProvider = process.env.STORAGE_PROVIDER;
let temporaryDirectory: string | null = null;

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
  if (originalStorageProvider === undefined) {
    delete process.env.STORAGE_PROVIDER;
  } else {
    process.env.STORAGE_PROVIDER = originalStorageProvider;
  }
});

function validArtifact(key: string) {
  return {
    storage: { provider: 'r2', bucket: 'templates', region: 'auto', key },
    contentType: 'application/pdf',
    size: 24,
  };
}

async function createLegacyFile(name: string, content: Uint8Array): Promise<string> {
  const uploads = path.join(process.cwd(), 'uploads');
  await mkdir(uploads, { recursive: true });
  temporaryDirectory = await mkdtemp(path.join(uploads, '.template-migration-test-'));
  const file = path.join(temporaryDirectory, name);
  await writeFile(file, content);
  return path.relative(process.cwd(), file);
}

describe('template artifact migration safeguards', () => {
  it('classifies malformed records explicitly instead of treating them as migrated', () => {
    expect(migration.getArtifactState(undefined)).toBe('missing');
    expect(migration.getArtifactState({ storage: { provider: 's3', bucket: 'bucket' } })).toBe('partial');
    expect(migration.getArtifactState(validArtifact('templates/pdf.pdf'))).toBe('valid');
  });

  it('reports an oversized legacy PDF before it is parsed or uploaded', async () => {
    const filePath = await createLegacyFile(
      'too-large.pdf',
      Buffer.alloc(migration.TEMPLATE_ARTIFACT_MAX_BYTES + 1)
    );
    const updateOne = async () => {
      throw new Error('must not persist an oversized artifact');
    };

    const result = await migration.migrateTemplate(
      { updateOne },
      { _id: 'template-1', filePath, artifacts: {} },
      { dryRun: true }
    );

    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'legacy_pdf_too_large',
      limit: migration.TEMPLATE_ARTIFACT_MAX_BYTES,
    });
  });

  it('preserves a valid DOC/DOCX source reference while planning a missing-PDF repair', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const filePath = await createLegacyFile('legacy.pdf', await document.save());

    const result = await migration.migrateTemplate(
      { updateOne: async () => ({ modifiedCount: 1 }) },
      {
        _id: 'template-1',
        filePath,
        artifacts: {
          source: {
            ...validArtifact('templates/source/original.docx'),
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        },
      },
      { dryRun: true }
    );

    expect(result).toMatchObject({ status: 'would_migrate', preservingSourceArtifact: true });
  });

  it('fails closed instead of silently switching an invalid provider to S3', () => {
    process.env.STORAGE_PROVIDER = 'invalid-provider';

    expect(objectStorage.storageProvider).toThrow('Invalid STORAGE_PROVIDER');
  });
});
