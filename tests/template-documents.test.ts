import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  documentInstances: [] as Array<Record<string, unknown>>,
  documentSave: vi.fn(),
  deleteObject: vi.fn(),
  templateUpdateOne: vi.fn(),
  renderEditableTemplatePdf: vi.fn(),
  readTemplateArtifactBuffer: vi.fn(),
  sha256Buffer: vi.fn(),
  putObjectStream: vi.fn(),
}));

vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: class MockDocument {
    _id = { toString: () => 'document-1' };
    versions: unknown[];
    recipients: unknown[];
    templatePreparation: unknown;
    save = mocks.documentSave;

    constructor(input: Record<string, unknown>) {
      Object.assign(this, input);
      this.versions = [];
      this.recipients = input.recipients as unknown[];
      this.templatePreparation = input.templatePreparation;
      mocks.documentInstances.push(this as unknown as Record<string, unknown>);
    }
  },
}));
vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: { updateOne: mocks.templateUpdateOne },
}));
vi.mock('@/lib/hash', () => ({ sha256Buffer: mocks.sha256Buffer }));
vi.mock('@/lib/s3', () => ({
  deleteObject: mocks.deleteObject,
  getRegion: vi.fn(() => 'ap-south-1'),
  getStorageBucketName: vi.fn(() => 'documents-test'),
  getStorageProvider: vi.fn(() => 's3'),
  putObjectStream: mocks.putObjectStream,
}));
vi.mock('@/lib/template-artifacts', () => ({
  getTemplatePdfArtifact: (value: { artifacts?: { pdf?: unknown } }) => value.artifacts?.pdf || null,
  readTemplateArtifactBuffer: mocks.readTemplateArtifactBuffer,
}));
vi.mock('@/lib/template-content-pdf', () => ({
  renderEditableTemplatePdf: mocks.renderEditableTemplatePdf,
}));

import { createDocumentFromTemplateRecord } from '@/lib/template-documents';
import type { ITemplate } from '@/models/Template';

const FIELD = {
  id: 'signature-1',
  type: 'signature' as const,
  x: 10,
  y: 20,
  width: 120,
  height: 40,
  pageNumber: 1,
  recipientId: 'signer-role',
  required: true,
  pageRect: { width: 612, height: 792 },
};

function template(overrides: Partial<ITemplate> = {}): ITemplate {
  return {
    _id: '507f191e810c19729de860ea',
    userId: 'user-1',
    name: 'Editable NDA',
    category: 'Legal',
    jurisdiction: 'International',
    isSystemTemplate: false,
    templateFileUrl: '/api/templates/template-1',
    artifacts: {
      pdf: {
        storage: { provider: 's3', bucket: 'templates-test', region: 'ap-south-1', key: 'templates/template-1/pdf/original.pdf' },
        contentType: 'application/pdf',
        size: 12,
      },
    },
    fields: [FIELD],
    defaultSigners: [{
      id: 'signer-role',
      name: 'Signer',
      email: '',
      role: 'signer',
      order: 1,
    }],
    editableContent: {
      version: 1,
      blocks: [{ id: 'body', type: 'paragraph', content: '{{company}}' }],
      variables: [{ key: 'company', label: 'Company', defaultValue: 'Old Co', required: true }],
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('template document preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentInstances.length = 0;
    mocks.documentSave.mockResolvedValue(undefined);
    mocks.templateUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.renderEditableTemplatePdf.mockResolvedValue(Buffer.from('rendered-pdf'));
    mocks.readTemplateArtifactBuffer.mockResolvedValue(Buffer.from('template-pdf'));
    mocks.sha256Buffer.mockResolvedValue('document-hash');
    mocks.putObjectStream.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it('preserves fields and flags review when initial variable values reflow the PDF', async () => {
    const result = await createDocumentFromTemplateRecord({
      template: template(),
      ownerId: 'user-1',
      orgId: 'org-1',
      variableValues: { company: 'New Co' },
    });
    const document = mocks.documentInstances[0] as {
      versions: Array<{ fields?: unknown[] }>;
      templatePreparation: { fieldsNeedReview?: boolean };
      recipients: Array<{ id: string; email: string }>;
    };

    expect(document.versions[1].fields).toEqual([expect.objectContaining({
      id: 'signature-1',
      recipientId: 'signer-role',
      pageRect: { width: 612, height: 792 },
    })]);
    expect(document.templatePreparation.fieldsNeedReview).toBe(true);
    expect(document.recipients).toEqual([
      expect.objectContaining({ id: 'signer-role', email: '' }),
    ]);
    expect(result.fields).toHaveLength(1);
  });

  it('keeps blank role placeholders stable in the draft', async () => {
    const result = await createDocumentFromTemplateRecord({
      template: template({
        defaultSigners: [{ id: 'signer-role', name: '', email: '', role: 'signer', order: 1 }],
      }),
      ownerId: 'user-1',
      orgId: 'org-1',
      variableValues: { company: 'Old Co' },
    });

    expect(result.recipients).toEqual([
      expect.objectContaining({
        id: 'signer-role',
        name: 'Signer 1',
        email: '',
      }),
    ]);
  });

  it('preserves fields and stable legacy role assignments when preparation is deferred', async () => {
    const result = await createDocumentFromTemplateRecord({
      template: template({
        defaultSigners: [{ name: 'Signer', email: '', role: 'signer', order: 1 }],
      }),
      ownerId: 'user-1',
      orgId: 'org-1',
      deferPreparation: true,
    });
    const document = mocks.documentInstances[0] as {
      versions: Array<{ fields?: Array<{ recipientId?: string; pageRect?: unknown }> }>;
      recipients: Array<{ id: string }>;
    };

    expect(document.versions[1].fields).toEqual([
      expect.objectContaining({
        id: 'signature-1',
        recipientId: 'signer-role',
        pageRect: { width: 612, height: 792 },
      }),
    ]);
    expect(document.recipients).toEqual([
      expect.objectContaining({ id: 'signer-role' }),
    ]);
    expect(result.fields).toEqual([
      expect.objectContaining({ recipientId: 'signer-role' }),
    ]);
  });

  it('removes the uploaded document artifact when saving the new document fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.documentSave.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(createDocumentFromTemplateRecord({
      template: template(),
      ownerId: 'user-1',
      orgId: 'org-1',
      variableValues: { company: 'Old Co' },
    })).rejects.toThrow('database unavailable');

    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'documents-test',
      key: 'documents/user-1/document-1/original.pdf',
      provider: 's3',
    }));
    expect(mocks.templateUpdateOne).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not turn a usage-counter failure into a failed agreement creation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.templateUpdateOne.mockRejectedValueOnce(new Error('counter unavailable'));

    await expect(createDocumentFromTemplateRecord({
      template: template(),
      ownerId: 'user-1',
      orgId: 'org-1',
      variableValues: { company: 'Old Co' },
    })).resolves.toMatchObject({ documentId: 'document-1' });

    expect(mocks.documentSave).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
