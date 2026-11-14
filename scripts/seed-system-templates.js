#!/usr/bin/env node

/**
 * Seeds the curated, ready-to-use system template library.
 *
 * The command is idempotent: every definition has a stable slug and manifest
 * digest. Unchanged templates make no object-store writes; a changed
 * definition is uploaded first, atomically recorded in MongoDB, and only then
 * has its superseded immutable object removed.
 */

require('dotenv').config({ quiet: true });

const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const {
  CATALOG_VERSION,
  systemTemplates,
} = require('./system-templates/catalog.cjs');
const { renderSystemTemplatePdf } = require('./system-templates/render.cjs');
const {
  deleteTemplateArtifact,
  putTemplateArtifact,
} = require('./template-object-storage.cjs');

const CURATED_TAG_PREFIX = 'curated-slug:';
const CURATED_REVISION_PREFIX = 'curated-revision:';
const CURATED_DIGEST_PREFIX = 'curated-digest:';
const CURATED_CATALOG_PREFIX = 'curated-catalog:';

function tagForSlug(slug) {
  return `${CURATED_TAG_PREFIX}${slug}`;
}

function stableTemplateId(slug) {
  return new mongoose.Types.ObjectId(
    createHash('sha256').update(`signworkflow:system-template:${slug}`).digest('hex').slice(0, 24)
  );
}

function definitionDigest(definition) {
  const source = JSON.stringify({
    slug: definition.slug,
    revision: definition.revision,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    jurisdiction: definition.jurisdiction,
    tags: definition.tags,
    roles: definition.roles,
    editableContent: definition.editableContent,
  });
  return createHash('sha256').update(source).digest('hex').slice(0, 20);
}

function curatedTags(definition) {
  return [
    ...new Set([
      ...definition.tags,
      'system',
      'editable',
      `curated-v${definition.revision}`,
      `${CURATED_CATALOG_PREFIX}${CATALOG_VERSION}`,
      `${CURATED_REVISION_PREFIX}${definition.revision}`,
      `${CURATED_DIGEST_PREFIX}${definitionDigest(definition)}`,
      tagForSlug(definition.slug),
    ]),
  ];
}

function isArtifact(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.storage &&
      (value.storage.provider === 's3' || value.storage.provider === 'r2') &&
      typeof value.storage.bucket === 'string' && value.storage.bucket &&
      typeof value.storage.key === 'string' && value.storage.key &&
      typeof value.contentType === 'string' && value.contentType &&
      typeof value.size === 'number' && Number.isFinite(value.size) && value.size >= 0
  );
}

function artifactIdentity(artifact) {
  if (!isArtifact(artifact)) return null;
  return [
    artifact.storage.provider,
    artifact.storage.bucket,
    artifact.storage.region || '',
    artifact.storage.key,
  ].join(':');
}

function uniqueArtifacts(artifacts) {
  const seen = new Set();
  return artifacts.filter((artifact) => {
    const identity = artifactIdentity(artifact);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function hasCurrentDefinition(existing, definition) {
  if (!existing || existing.isSystemTemplate !== true) return false;
  const tags = Array.isArray(existing.tags) ? existing.tags : [];
  return (
    tags.includes(tagForSlug(definition.slug)) &&
    tags.includes(`${CURATED_REVISION_PREFIX}${definition.revision}`) &&
    tags.includes(`${CURATED_DIGEST_PREFIX}${definitionDigest(definition)}`) &&
    isArtifact(existing.artifacts?.pdf) &&
    isArtifact(existing.artifacts?.source) &&
    Array.isArray(existing.fields) && existing.fields.length === definition.roles.length * 3 &&
    Array.isArray(existing.defaultSigners) && existing.defaultSigners.length === definition.roles.length &&
    existing.fieldLayoutStatus === 'current' &&
    existing.isActive !== false &&
    !existing.deletedAt &&
    !existing.filePath
  );
}

async function removeArtifactsBestEffort(artifacts, deleteArtifact, logger, message) {
  await Promise.all(uniqueArtifacts(artifacts).map(async (artifact) => {
    try {
      await deleteArtifact(artifact);
    } catch (error) {
      logger.error(message, error);
    }
  }));
}

async function seedSystemTemplate({
  collection,
  definition,
  now = new Date(),
  render = renderSystemTemplatePdf,
  putArtifact = putTemplateArtifact,
  deleteArtifact = deleteTemplateArtifact,
  logger = console,
}) {
  const selector = { isSystemTemplate: true, tags: tagForSlug(definition.slug) };
  const existing = await collection.findOne(selector, {
    projection: {
      _id: 1,
      artifacts: 1,
      defaultSigners: 1,
      deletedAt: 1,
      fieldLayoutStatus: 1,
      fields: 1,
      filePath: 1,
      isActive: 1,
      isSystemTemplate: 1,
      tags: 1,
      updatedAt: 1,
    },
  });

  if (hasCurrentDefinition(existing, definition)) {
    return { slug: definition.slug, status: 'unchanged', id: String(existing._id) };
  }

  const templateId = existing?._id || stableTemplateId(definition.slug);
  let artifact = null;
  try {
    const rendered = await render(definition);
    if (!Buffer.isBuffer(rendered.pdf) || rendered.pdf.length === 0) {
      throw new Error(`Renderer returned an invalid PDF for ${definition.slug}.`);
    }
    if (!Array.isArray(rendered.fields) || rendered.fields.length !== definition.roles.length * 3) {
      throw new Error(`Renderer returned an invalid field plan for ${definition.slug}.`);
    }

    artifact = await putArtifact({
      templateId: String(templateId),
      orgId: null,
      kind: 'pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      data: rendered.pdf,
      originalFileName: `${definition.slug}.pdf`,
    });

    const updateFilter = existing
      ? { _id: templateId, ...(existing.updatedAt ? { updatedAt: existing.updatedAt } : {}) }
      : { _id: templateId };
    const update = await collection.updateOne(
      updateFilter,
      {
        $set: {
          userId: null,
          orgId: null,
          sharingScope: 'private',
          name: definition.name,
          description: definition.description,
          category: definition.category,
          jurisdiction: definition.jurisdiction,
          isSystemTemplate: true,
          templateFileUrl: `/api/templates/${templateId}`,
          artifacts: { pdf: artifact, source: artifact },
          fileSize: artifact.size,
          pageCount: rendered.pageCount,
          fields: rendered.fields,
          defaultSigners: definition.roles.map((role) => ({ ...role, email: '' })),
          editableContent: definition.editableContent,
          fieldLayoutStatus: 'current',
          layoutRevision: definition.revision,
          fieldLayoutRevision: definition.revision,
          tags: curatedTags(definition),
          isActive: true,
          deletedAt: null,
          updatedAt: now,
        },
        $unset: { filePath: '' },
        $setOnInsert: { duplicateCount: 0, createdAt: now },
      },
      { upsert: !existing }
    );

    const saved = update?.modifiedCount || update?.upsertedCount || update?.upsertedId;
    if (!saved) {
      await removeArtifactsBestEffort(
        [artifact],
        deleteArtifact,
        logger,
        `[SEED SYSTEM TEMPLATES] Failed to remove stale ${definition.slug} artifact after a concurrent update:`
      );
      return { slug: definition.slug, status: 'conflict', id: String(templateId) };
    }

    const previousArtifacts = [existing?.artifacts?.pdf, existing?.artifacts?.source].filter(
      (candidate) => artifactIdentity(candidate) && artifactIdentity(candidate) !== artifactIdentity(artifact)
    );
    await removeArtifactsBestEffort(
      previousArtifacts,
      deleteArtifact,
      logger,
      `[SEED SYSTEM TEMPLATES] ${definition.slug} was updated but an older artifact could not be removed:`
    );

    return {
      slug: definition.slug,
      status: existing ? 'updated' : 'created',
      id: String(templateId),
      pageCount: rendered.pageCount,
      fields: rendered.fields.length,
    };
  } catch (error) {
    if (artifact) {
      await removeArtifactsBestEffort(
        [artifact],
        deleteArtifact,
        logger,
        `[SEED SYSTEM TEMPLATES] Failed to remove unfinished ${definition.slug} artifact:`
      );
    }
    throw error;
  }
}

async function seedSystemTemplates({
  collection,
  definitions = systemTemplates,
  ...options
}) {
  const results = [];
  for (const definition of definitions) {
    results.push(await seedSystemTemplate({ collection, definition, ...options }));
  }
  return results;
}

async function run({ definitions = systemTemplates } = {}) {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const collection = mongoose.connection.db.collection('templates');
    const results = await seedSystemTemplates({ collection, definitions });
    const summary = results.reduce((counts, result) => {
      counts[result.status] = (counts[result.status] || 0) + 1;
      return counts;
    }, {});
    console.log(JSON.stringify({ catalogVersion: CATALOG_VERSION, results, summary }, null, 2));
    if (summary.conflict) process.exitCode = 2;
    return results;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  CURATED_CATALOG_PREFIX,
  CURATED_DIGEST_PREFIX,
  CURATED_REVISION_PREFIX,
  CURATED_TAG_PREFIX,
  curatedTags,
  definitionDigest,
  hasCurrentDefinition,
  run,
  seedSystemTemplate,
  seedSystemTemplates,
  stableTemplateId,
  tagForSlug,
};
