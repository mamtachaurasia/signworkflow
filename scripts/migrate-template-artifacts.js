#!/usr/bin/env node

/**
 * One-time migration for template records created before template artifacts
 * were stored in S3/R2. Runtime code intentionally does not call this file or
 * read `Template.filePath`.
 *
 * Usage:
 *   node scripts/migrate-template-artifacts.js --dry-run
 *   node scripts/migrate-template-artifacts.js
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const { PDFDocument } = require('pdf-lib');
const {
  TEMPLATE_ARTIFACT_MAX_BYTES,
  deleteTemplateArtifact,
  putTemplateArtifact,
} = require('./template-object-storage.cjs');

const dryRun = process.argv.includes('--dry-run') || process.env.TEMPLATE_ARTIFACTS_DRY_RUN === 'true';
const root = path.resolve(process.cwd());
const allowedRoots = [
  path.resolve(root, 'uploads'),
  path.resolve(root, 'public', 'system-templates'),
];

function withinRoot(candidate, allowedRoot) {
  return candidate === allowedRoot || candidate.startsWith(`${allowedRoot}${path.sep}`);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getArtifactState(value) {
  if (value === undefined || value === null) return 'missing';
  if (!isPlainObject(value)) return 'partial';
  const storage = value.storage;
  if (!isPlainObject(storage)) return 'partial';
  if (
    (storage.provider !== 's3' && storage.provider !== 'r2') ||
    typeof storage.bucket !== 'string' || !storage.bucket.trim() ||
    typeof storage.key !== 'string' || !storage.key.trim() ||
    typeof value.contentType !== 'string' || !value.contentType.trim() ||
    typeof value.size !== 'number' || !Number.isFinite(value.size) || value.size < 0
  ) {
    return 'partial';
  }
  return 'valid';
}

async function resolveLegacyTemplatePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null;
  const candidate = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);
  try {
    const [realCandidate, ...realRoots] = await Promise.all([
      fs.realpath(candidate),
      ...allowedRoots.map((allowedRoot) => fs.realpath(allowedRoot).catch(() => allowedRoot)),
    ]);
    return realRoots.some((allowedRoot) => withinRoot(realCandidate, allowedRoot))
      ? realCandidate
      : null;
  } catch {
    return null;
  }
}

async function migrateTemplate(collection, template, options = {}) {
  const shouldDryRun = options.dryRun ?? dryRun;
  const artifacts = isPlainObject(template.artifacts) ? template.artifacts : {};
  const pdfState = getArtifactState(artifacts.pdf);
  const sourceState = getArtifactState(artifacts.source);

  // A complete PDF is already runtime-ready. A malformed source reference is
  // deliberately surfaced rather than overwritten: it may point to the only
  // retained DOC/DOCX original and needs an operator decision.
  if (pdfState === 'valid') {
    if (sourceState === 'partial') {
      return { status: 'skipped', id: String(template._id), reason: 'partial_source_artifact_metadata' };
    }
    return { status: 'already_migrated', id: String(template._id) };
  }
  if (sourceState === 'partial') {
    return { status: 'skipped', id: String(template._id), reason: 'partial_source_artifact_metadata' };
  }

  const sourcePath = await resolveLegacyTemplatePath(template.filePath);
  if (!sourcePath) {
    return {
      status: 'skipped',
      id: String(template._id),
      reason: pdfState === 'partial'
        ? 'partial_pdf_artifact_and_missing_or_unsafe_legacy_path'
        : 'missing_or_unsafe_legacy_path',
    };
  }

  let pdf;
  try {
    const stat = await fs.stat(sourcePath);
    if (stat.size > TEMPLATE_ARTIFACT_MAX_BYTES) {
      return {
        status: 'skipped',
        id: String(template._id),
        reason: 'legacy_pdf_too_large',
        bytes: stat.size,
        limit: TEMPLATE_ARTIFACT_MAX_BYTES,
      };
    }
    pdf = await fs.readFile(sourcePath);
    if (pdf.length > TEMPLATE_ARTIFACT_MAX_BYTES) {
      return {
        status: 'skipped',
        id: String(template._id),
        reason: 'legacy_pdf_too_large',
        bytes: pdf.length,
        limit: TEMPLATE_ARTIFACT_MAX_BYTES,
      };
    }
    const parsed = await PDFDocument.load(pdf);
    if (parsed.getPageCount() < 1) throw new Error('no pages');
  } catch (error) {
    return {
      status: 'skipped',
      id: String(template._id),
      reason: 'unreadable_or_invalid_pdf',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (shouldDryRun) {
    return {
      status: 'would_migrate',
      id: String(template._id),
      bytes: pdf.length,
      sourcePath,
      ...(pdfState === 'partial' ? { repairingPartialPdfArtifact: true } : {}),
      ...(sourceState === 'valid' ? { preservingSourceArtifact: true } : {}),
    };
  }

  let pdfArtifact = null;
  try {
    pdfArtifact = await putTemplateArtifact({
      templateId: String(template._id),
      orgId: template.orgId ? String(template.orgId) : null,
      kind: 'pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      data: pdf,
      originalFileName: path.basename(sourcePath),
    });
    const pageCount = (await PDFDocument.load(pdf)).getPageCount();

    const update = await collection.updateOne(
      {
        _id: template._id,
        ...(template.updatedAt ? { updatedAt: template.updatedAt } : {}),
      },
      {
        $set: {
          // Preserve a valid uploaded DOC/DOCX source artifact. Legacy records
          // have no source, so their retained PDF is also the source fallback.
          artifacts: {
            pdf: pdfArtifact,
            source: sourceState === 'valid' ? artifacts.source : pdfArtifact,
          },
          templateFileUrl: `/api/templates/${template._id}`,
          fileSize: pdfArtifact.size,
          pageCount,
        },
        $unset: { filePath: '' },
      }
    );
    if (!update.modifiedCount) {
      // Another writer changed the template after this process read it. Do not
      // overwrite a newer artifact or leave this losing immutable object behind.
      await deleteTemplateArtifact(pdfArtifact).catch((cleanupError) => {
        console.error(`Could not clean up superseded artifact for ${template._id}:`, cleanupError);
      });
      return { status: 'skipped', id: String(template._id), reason: 'already_migrated' };
    }

    return {
      status: 'migrated',
      id: String(template._id),
      bytes: pdfArtifact.size,
      ...(pdfState === 'partial' ? { repairedPartialPdfArtifact: true } : {}),
      ...(sourceState === 'valid' ? { preservedSourceArtifact: true } : {}),
    };
  } catch (error) {
    if (pdfArtifact) {
      await deleteTemplateArtifact(pdfArtifact).catch((cleanupError) => {
        console.error(`Could not clean up failed migration artifact for ${template._id}:`, cleanupError);
      });
    }
    throw error;
  }
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.db.collection('templates');
  // Scan all templates rather than only absent/null PDF paths so corrupt or
  // partial artifact metadata is explicitly repaired or reported before the
  // local-volume cutover.
  const cursor = collection.find({}, {
    projection: { _id: 1, orgId: 1, filePath: 1, name: 1, artifacts: 1, updatedAt: 1 },
  });

  const results = { migrated: 0, would_migrate: 0, already_migrated: 0, skipped: 0, failed: 0 };
  for await (const template of cursor) {
    try {
      const result = await migrateTemplate(collection, template);
      results[result.status] += 1;
      console.log(JSON.stringify(result));
    } catch (error) {
      results.failed += 1;
      console.error(JSON.stringify({
        status: 'failed',
        id: String(template._id),
        detail: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  console.log(JSON.stringify({ dryRun, ...results }, null, 2));
  if (results.failed || results.skipped) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => undefined);
    });
}

module.exports = {
  TEMPLATE_ARTIFACT_MAX_BYTES,
  getArtifactState,
  migrateTemplate,
  resolveLegacyTemplatePath,
  run,
};
