import { describe, expect, it, vi } from 'vitest';

type Role = {
  id: string;
  name: string;
  role: 'signer' | 'approver' | 'viewer';
  order: number;
};

type SystemTemplateDefinition = {
  slug: string;
  revision: number;
  name: string;
  description: string;
  category: string;
  jurisdiction: string;
  tags: string[];
  roles: Role[];
  editableContent: {
    version: number;
    variables: Array<Record<string, unknown>>;
    blocks: Array<Record<string, unknown>>;
  };
};

type Artifact = {
  storage: {
    provider: 's3' | 'r2';
    bucket: string;
    region: string;
    key: string;
  };
  contentType: string;
  size: number;
  sha256: string;
  originalFileName?: string;
};

type SeedModule = {
  CURATED_CATALOG_PREFIX: string;
  CURATED_DIGEST_PREFIX: string;
  CURATED_REVISION_PREFIX: string;
  curatedTags(definition: SystemTemplateDefinition): string[];
  definitionDigest(definition: SystemTemplateDefinition): string;
  seedSystemTemplate(options: {
    collection: {
      findOne: (filter: unknown, options: unknown) => Promise<Record<string, unknown> | null>;
      updateOne: (filter: unknown, update: unknown, options: unknown) => Promise<Record<string, unknown>>;
    };
    definition: SystemTemplateDefinition;
    now?: Date;
    render: (definition: SystemTemplateDefinition) => Promise<{
      pdf: Buffer;
      fields: Array<Record<string, unknown>>;
      pageCount: number;
    }>;
    putArtifact: (options: Record<string, unknown>) => Promise<Artifact>;
    deleteArtifact: (artifact: Artifact) => Promise<void>;
    logger: { error: (message: string, error: unknown) => void };
  }): Promise<Record<string, unknown>>;
  stableTemplateId(slug: string): { toString(): string };
  tagForSlug(slug: string): string;
};

// The seed runner intentionally remains CommonJS so production can run it
// directly with Node. These tests exercise the exported production functions.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed = require('../scripts/seed-system-templates.js') as SeedModule;

function createDefinition(): SystemTemplateDefinition {
  return {
    slug: 'professional-consulting-agreement',
    revision: 3,
    name: 'Consulting Agreement',
    description: 'A reusable consulting services agreement.',
    category: 'Service Agreement',
    jurisdiction: 'United States',
    tags: ['consulting', 'services', 'editable'],
    roles: [
      { id: 'client', name: 'Client', role: 'signer', order: 1 },
      { id: 'consultant', name: 'Consultant', role: 'signer', order: 2 },
    ],
    editableContent: {
      version: 1,
      variables: [{ key: 'client_name', label: 'Client name' }],
      blocks: [{ id: 'intro', type: 'paragraph', text: 'Agreement' }],
    },
  };
}

function createFields(definition: SystemTemplateDefinition): Array<Record<string, unknown>> {
  return definition.roles.flatMap((role) => [
    { id: `${role.id}-name`, recipientId: role.id, type: 'full_name' },
    { id: `${role.id}-signature`, recipientId: role.id, type: 'signature' },
    { id: `${role.id}-date`, recipientId: role.id, type: 'date' },
  ]);
}

function createArtifact(key: string): Artifact {
  return {
    storage: {
      provider: 'r2',
      bucket: 'template-artifacts',
      region: 'auto',
      key,
    },
    contentType: 'application/pdf',
    size: 24,
    sha256: 'a'.repeat(64),
  };
}

function renderedDefinition(definition: SystemTemplateDefinition) {
  return {
    pdf: Buffer.from('%PDF-1.7\nseed-template'),
    fields: createFields(definition),
    pageCount: 2,
  };
}

function logger() {
  return { error: vi.fn() };
}

describe('system template seed runner', () => {
  it('creates a storage-backed template using a stable ID and curated manifest tags', async () => {
    const definition = createDefinition();
    const artifact = createArtifact('templates/v1/system/template/pdf/new.pdf');
    const collection = {
      findOne: vi.fn().mockResolvedValue(null),
      updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
    };
    const render = vi.fn().mockResolvedValue(renderedDefinition(definition));
    const putArtifact = vi.fn().mockResolvedValue(artifact);
    const deleteArtifact = vi.fn().mockResolvedValue(undefined);

    const result = await seed.seedSystemTemplate({
      collection,
      definition,
      now: new Date('2026-08-12T00:00:00.000Z'),
      render,
      putArtifact,
      deleteArtifact,
      logger: logger(),
    });

    const [[filter, update, options]] = collection.updateOne.mock.calls;
    const set = (update as { $set: Record<string, unknown> }).$set;

    expect(result).toMatchObject({
      slug: definition.slug,
      status: 'created',
      id: seed.stableTemplateId(definition.slug).toString(),
      pageCount: 2,
      fields: definition.roles.length * 3,
    });
    expect(String((filter as { _id: unknown })._id)).toBe(seed.stableTemplateId(definition.slug).toString());
    expect(options).toEqual({ upsert: true });
    expect(render).toHaveBeenCalledWith(definition);
    expect(putArtifact).toHaveBeenCalledWith(expect.objectContaining({
      templateId: seed.stableTemplateId(definition.slug).toString(),
      orgId: null,
      kind: 'pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      originalFileName: `${definition.slug}.pdf`,
    }));
    expect(set).toMatchObject({
      isSystemTemplate: true,
      templateFileUrl: `/api/templates/${seed.stableTemplateId(definition.slug).toString()}`,
      artifacts: { pdf: artifact, source: artifact },
      fileSize: artifact.size,
      defaultSigners: definition.roles.map((role) => ({ ...role, email: '' })),
    });
    expect(set.tags).toEqual(expect.arrayContaining([
      seed.tagForSlug(definition.slug),
      `${seed.CURATED_REVISION_PREFIX}${definition.revision}`,
      `${seed.CURATED_DIGEST_PREFIX}${seed.definitionDigest(definition)}`,
    ]));
    expect((set.tags as string[]).some((tag) => tag.startsWith(seed.CURATED_CATALOG_PREFIX))).toBe(true);
    expect((update as { $unset: unknown }).$unset).toEqual({ filePath: '' });
    expect(deleteArtifact).not.toHaveBeenCalled();
  });

  it('does no rendering, object-store writes, or database update when the current manifest already exists', async () => {
    const definition = createDefinition();
    const existing = {
      _id: 'existing-template',
      isSystemTemplate: true,
      tags: seed.curatedTags(definition),
      artifacts: {
        pdf: createArtifact('templates/v1/system/existing/pdf.pdf'),
        source: createArtifact('templates/v1/system/existing/source.pdf'),
      },
      fields: createFields(definition),
      defaultSigners: definition.roles.map((role) => ({ ...role, email: '' })),
      fieldLayoutStatus: 'current',
      isActive: true,
      deletedAt: null,
    };
    const collection = {
      findOne: vi.fn().mockResolvedValue(existing),
      updateOne: vi.fn(),
    };
    const render = vi.fn();
    const putArtifact = vi.fn();
    const deleteArtifact = vi.fn();

    const result = await seed.seedSystemTemplate({
      collection,
      definition,
      render,
      putArtifact,
      deleteArtifact,
      logger: logger(),
    });

    expect(result).toEqual({ slug: definition.slug, status: 'unchanged', id: 'existing-template' });
    expect(render).not.toHaveBeenCalled();
    expect(putArtifact).not.toHaveBeenCalled();
    expect(collection.updateOne).not.toHaveBeenCalled();
    expect(deleteArtifact).not.toHaveBeenCalled();
  });

  it('removes only the newly uploaded artifact when the database update fails', async () => {
    const definition = createDefinition();
    const newArtifact = createArtifact('templates/v1/system/existing/pdf/new.pdf');
    const oldPdf = createArtifact('templates/v1/system/existing/pdf/old.pdf');
    const oldSource = createArtifact('templates/v1/system/existing/source/old.docx');
    const collection = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'existing-template',
        artifacts: { pdf: oldPdf, source: oldSource },
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      updateOne: vi.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const deleteArtifact = vi.fn().mockResolvedValue(undefined);

    await expect(seed.seedSystemTemplate({
      collection,
      definition,
      render: vi.fn().mockResolvedValue(renderedDefinition(definition)),
      putArtifact: vi.fn().mockResolvedValue(newArtifact),
      deleteArtifact,
      logger: logger(),
    })).rejects.toThrow('database unavailable');

    expect(deleteArtifact).toHaveBeenCalledTimes(1);
    expect(deleteArtifact).toHaveBeenCalledWith(newArtifact);
    expect(deleteArtifact).not.toHaveBeenCalledWith(oldPdf);
    expect(deleteArtifact).not.toHaveBeenCalledWith(oldSource);
  });

  it('removes superseded artifacts only after a successful database update', async () => {
    const definition = createDefinition();
    const newArtifact = createArtifact('templates/v1/system/existing/pdf/new.pdf');
    const oldPdf = createArtifact('templates/v1/system/existing/pdf/old.pdf');
    const oldSource = createArtifact('templates/v1/system/existing/source/old.docx');
    const events: string[] = [];
    const collection = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'existing-template',
        artifacts: { pdf: oldPdf, source: oldSource },
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      updateOne: vi.fn().mockImplementation(async () => {
        events.push('updated');
        return { modifiedCount: 1 };
      }),
    };
    const deleteArtifact = vi.fn().mockImplementation(async (artifact: Artifact) => {
      events.push(`deleted:${artifact.storage.key}`);
    });

    const result = await seed.seedSystemTemplate({
      collection,
      definition,
      render: vi.fn().mockResolvedValue(renderedDefinition(definition)),
      putArtifact: vi.fn().mockResolvedValue(newArtifact),
      deleteArtifact,
      logger: logger(),
    });

    expect(result).toMatchObject({ slug: definition.slug, status: 'updated', id: 'existing-template' });
    expect(deleteArtifact).toHaveBeenCalledTimes(2);
    expect(deleteArtifact).toHaveBeenCalledWith(oldPdf);
    expect(deleteArtifact).toHaveBeenCalledWith(oldSource);
    expect(deleteArtifact).not.toHaveBeenCalledWith(newArtifact);
    expect(events.indexOf(`deleted:${oldPdf.storage.key}`)).toBeGreaterThan(events.indexOf('updated'));
    expect(events.indexOf(`deleted:${oldSource.storage.key}`)).toBeGreaterThan(events.indexOf('updated'));
  });
});
