import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import {
  createDocxBytes,
  createLegacyDocBytes,
  createSpreadsheetZipBytes,
  withDeclaredZipEntrySize,
} from './helpers/office-upload-fixtures';

type AuthContext = { userId?: string; orgId?: string; orgRole?: string } | null;
type TrialHandler = (
  req: NextRequest,
  context: unknown,
  authContext: AuthContext
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  authContext: { userId: 'user-1', orgId: 'org-1', orgRole: 'owner' } as AuthContext,
  connectDB: vi.fn(),
  convertOfficeDocumentToPdf: vi.fn(),
  createdTemplates: [] as Array<Record<string, unknown>>,
  deleteTemplateArtifacts: vi.fn(),
  getPlanGateForOrgFeature: vi.fn(),
  save: vi.fn(),
  storeTemplateArtifact: vi.fn(),
  TemplateModel: vi.fn(),
}));

vi.mock('@/lib/template-access', () => ({
  normalizeTemplateSharingScope: (value: unknown) => value === 'workspace' ? 'workspace' : 'private',
}));

vi.mock('@/lib/document-conversion', () => ({
  convertOfficeDocumentToPdf: mocks.convertOfficeDocumentToPdf,
}));

vi.mock('@/lib/template-artifacts', () => ({
  deleteTemplateArtifacts: mocks.deleteTemplateArtifacts,
  storeTemplateArtifact: mocks.storeTemplateArtifact,
}));

vi.mock('@/lib/subscription-server', () => ({
  getPlanGateForOrgFeature: mocks.getPlanGateForOrgFeature,
}));

vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, mocks.authContext),
}));

vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: mocks.TemplateModel,
}));

vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));

import { POST } from '@/app/api/templates/upload/route';

type FileLike = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: ReturnType<typeof vi.fn>;
};

type StoreArtifactArgs = {
  templateId: string;
  orgId?: string;
  kind: 'pdf' | 'source';
  data: Buffer | Uint8Array;
  contentType: string;
  extension: string;
  originalFileName?: string;
};

function artifactFor(args: StoreArtifactArgs, sequence: number) {
  const data = Buffer.from(args.data);
  const key = `templates/v1/${args.orgId || 'system'}/${args.templateId}/${args.kind}/artifact-${sequence}.${args.extension}`;
  return {
    storage: {
      provider: 'r2' as const,
      bucket: 'templates-test',
      region: 'auto',
      key,
      url: `r2://templates-test/${key}`,
    },
    contentType: args.contentType,
    size: data.length,
    sha256: `hash-${sequence}`,
    ...(args.originalFileName ? { originalFileName: args.originalFileName } : {}),
  };
}

function fileFromBytes(bytes: Uint8Array, overrides: Partial<FileLike> = {}): FileLike {
  return {
    name: 'customer-agreement.pdf',
    type: 'application/pdf',
    size: bytes.byteLength,
    arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(bytes).buffer),
    ...overrides,
  };
}

function request(
  entries: Record<string, unknown>,
  options: { contentLength?: number } = {}
): NextRequest {
  return {
    headers: new Headers(
      options.contentLength === undefined
        ? undefined
        : { 'content-length': String(options.contentLength) }
    ),
    formData: vi.fn().mockResolvedValue({
      get: (key: string) => entries[key] ?? null,
    }),
  } as unknown as NextRequest;
}

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) pdf.addPage();
  return pdf.save();
}

function validEntries(file: FileLike, overrides: Record<string, unknown> = {}) {
  return {
    file,
    name: '  Customer agreement  ',
    description: 'Reusable customer agreement',
    category: 'Legal',
    tags: 'legal, customer',
    sharingScope: 'private',
    ...overrides,
  };
}

describe('template upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authContext = { userId: 'user-1', orgId: 'org-1', orgRole: 'owner' };
    mocks.createdTemplates.length = 0;
    mocks.TemplateModel.mockImplementation(function MockTemplate(
      this: Record<string, unknown>,
      values: Record<string, unknown>
    ) {
      Object.assign(this, values, { save: mocks.save });
      mocks.createdTemplates.push(this);
    });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.convertOfficeDocumentToPdf.mockReset();
    mocks.deleteTemplateArtifacts.mockResolvedValue(undefined);
    mocks.getPlanGateForOrgFeature.mockResolvedValue({ allowed: true });
    mocks.save.mockResolvedValue(undefined);
    mocks.storeTemplateArtifact.mockImplementation(async (args: StoreArtifactArgs) =>
      artifactFor(args, mocks.storeTemplateArtifact.mock.calls.length)
    );
  });

  it('parses the PDF, stores its real page count, and saves once with a final URL', async () => {
    const bytes = await makePdf(3);
    const response = await POST(request(validEntries(fileFromBytes(bytes))), {});
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.message).toBe('Template uploaded successfully');
    expect(mocks.storeTemplateArtifact).toHaveBeenCalledTimes(1);
    expect(mocks.storeTemplateArtifact).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      kind: 'pdf',
      data: Buffer.from(bytes),
      contentType: 'application/pdf',
      extension: 'pdf',
      originalFileName: 'customer-agreement.pdf',
    }));
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.createdTemplates[0]).toMatchObject({
      name: 'Customer agreement',
      category: 'Legal',
      pageCount: 3,
      sharingScope: 'private',
      fieldLayoutStatus: 'current',
      layoutRevision: 1,
      fieldLayoutRevision: 1,
    });
    const artifacts = mocks.createdTemplates[0].artifacts as {
      pdf: Record<string, unknown>;
      source: Record<string, unknown>;
    };
    expect(artifacts.pdf).toMatchObject({
      contentType: 'application/pdf',
      size: bytes.byteLength,
      storage: expect.objectContaining({ provider: 'r2', bucket: 'templates-test' }),
    });
    expect(artifacts.source).toBe(artifacts.pdf);
    expect(mocks.createdTemplates[0].templateFileUrl).toMatch(/^\/api\/templates\/[a-f0-9]{24}$/);
  });

  it('rejects PDFs larger than 25 MB before reading or writing them', async () => {
    const file = fileFromBytes(new Uint8Array([1]), { size: 25 * 1024 * 1024 + 1 });

    const response = await POST(request(validEntries(file)), {});

    expect(response.status).toBe(413);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
    expect(mocks.TemplateModel).not.toHaveBeenCalled();
  });

  it('rejects an oversized multipart request before parsing form data', async () => {
    const file = fileFromBytes(new Uint8Array([1]));
    const oversizedRequest = request(
      validEntries(file),
      { contentLength: 26 * 1024 * 1024 + 1 }
    );

    const response = await POST(oversizedRequest, {});

    expect(response.status).toBe(413);
    expect(oversizedRequest.formData).not.toHaveBeenCalled();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.convertOfficeDocumentToPdf).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'customer-agreement.doc',
      type: 'application/msword',
      bytes: createLegacyDocBytes(),
    },
    {
      name: 'customer-agreement.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: createDocxBytes(),
    },
  ])('converts $name to a validated PDF before creating the template', async ({
    name,
    type,
    bytes,
  }) => {
    const convertedPdf = await makePdf(2);
    mocks.convertOfficeDocumentToPdf.mockResolvedValueOnce(Buffer.from(convertedPdf));
    const file = fileFromBytes(bytes, { name, type });

    const response = await POST(request(validEntries(file)), {});

    expect(response.status).toBe(201);
    expect(mocks.convertOfficeDocumentToPdf).toHaveBeenCalledWith({
      inputBuffer: Buffer.from(bytes),
      originalFileName: name,
    });
    expect(mocks.storeTemplateArtifact).toHaveBeenNthCalledWith(1, expect.objectContaining({
      orgId: 'org-1',
      kind: 'pdf',
      data: Buffer.from(convertedPdf),
      contentType: 'application/pdf',
      extension: 'pdf',
    }));
    expect(mocks.storeTemplateArtifact).toHaveBeenNthCalledWith(2, expect.objectContaining({
      orgId: 'org-1',
      kind: 'source',
      data: Buffer.from(bytes),
      contentType: type,
      extension: name.endsWith('.docx') ? 'docx' : 'doc',
      originalFileName: name,
    }));
    expect(mocks.createdTemplates[0]).toMatchObject({
      pageCount: 2,
      fileSize: convertedPdf.byteLength,
      artifacts: {
        pdf: expect.objectContaining({ contentType: 'application/pdf' }),
        source: expect.objectContaining({ contentType: type }),
      },
    });
  });

  it('rejects malformed Word bytes before conversion', async () => {
    const file = fileFromBytes(new TextEncoder().encode('not a Word document'), {
      name: 'renamed.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const response = await POST(request(validEntries(file)), {});

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(
      'Only PDF, DOC, or DOCX files can be uploaded as templates.'
    );
    expect(mocks.convertOfficeDocumentToPdf).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
    expect(mocks.TemplateModel).not.toHaveBeenCalled();
  });

  it('accepts an octet-stream MIME when the DOCX extension and package are valid', async () => {
    const convertedPdf = await makePdf(1);
    mocks.convertOfficeDocumentToPdf.mockResolvedValueOnce(Buffer.from(convertedPdf));
    const file = fileFromBytes(createDocxBytes(), {
      name: 'contract.docx',
      type: 'application/octet-stream',
    });

    const response = await POST(request(validEntries(file)), {});

    expect(response.status).toBe(201);
    expect(mocks.convertOfficeDocumentToPdf).toHaveBeenCalledTimes(1);
    expect(mocks.storeTemplateArtifact).toHaveBeenCalledTimes(2);
  });

  it('rejects an XLSX package renamed to DOCX before conversion', async () => {
    const file = fileFromBytes(
      createSpreadsheetZipBytes({ includeFakeWordEntry: true }),
      {
        name: 'spreadsheet.docx',
        type: 'application/octet-stream',
      }
    );

    const response = await POST(request(validEntries(file)), {});

    expect(response.status).toBe(400);
    expect(mocks.convertOfficeDocumentToPdf).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('rejects DOCX ZIP-bomb metadata before invoking the converter', async () => {
    const file = fileFromBytes(
      withDeclaredZipEntrySize(createDocxBytes(), 'word/document.xml', 512 * 1024 * 1024),
      {
        name: 'oversized.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }
    );

    const response = await POST(request(validEntries(file)), {});

    expect(response.status).toBe(400);
    expect(mocks.convertOfficeDocumentToPdf).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('does not create a template when Word conversion does not yield a valid PDF', async () => {
    mocks.convertOfficeDocumentToPdf.mockResolvedValueOnce(Buffer.from('%PDF-1.7\nbroken'));
    const file = fileFromBytes(createDocxBytes(), {
      name: 'contract.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const response = await POST(request(validEntries(file)), {});

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('The converted document is not a valid PDF');
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
    expect(mocks.TemplateModel).not.toHaveBeenCalled();
  });

  it('returns a safe conversion error without storing a template artifact', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.convertOfficeDocumentToPdf.mockRejectedValueOnce(
      new Error('LibreOffice failed at /private/tmp/customer-secret.doc; API key=top-secret')
    );
    const file = fileFromBytes(createLegacyDocBytes(), {
      name: 'contract.doc',
      type: 'application/msword',
    });

    try {
      const response = await POST(request(validEntries(file)), {});
      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toEqual({
        message: 'Word document conversion is temporarily unavailable. Please try again later or upload a PDF.',
        code: 'TEMPLATE_WORD_CONVERSION_FAILED',
      });
      expect(JSON.stringify(payload)).not.toMatch(/private\/tmp|customer-secret|top-secret|API key/i);
      expect(consoleError).toHaveBeenCalledWith(
        'Template Word document conversion failed:',
        expect.objectContaining({ message: expect.stringContaining('/private/tmp/customer-secret.doc') })
      );
      expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
      expect(mocks.TemplateModel).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects malformed PDF bytes before creating a file', async () => {
    const response = await POST(request(validEntries(
      fileFromBytes(new TextEncoder().encode('not a pdf'))
    )), {});
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe('The uploaded file is not a valid PDF');
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('validates the category and template name length', async () => {
    const file = fileFromBytes(await makePdf(1));
    const invalidCategory = await POST(request(validEntries(file, { category: 'Unknown' })), {});
    const longName = await POST(request(validEntries(file, { name: 'x'.repeat(201) })), {});

    expect(invalidCategory.status).toBe(400);
    expect((await invalidCategory.json()).message).toBe('Invalid template category');
    expect(longName.status).toBe(400);
    expect((await longName.json()).message).toBe('Template name must be 200 characters or fewer');
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('checks workspace sharing entitlement before reading or writing the PDF', async () => {
    const file = fileFromBytes(await makePdf(1));
    mocks.getPlanGateForOrgFeature.mockResolvedValue({
      allowed: false,
      status: 403,
      message: 'Upgrade to share templates',
    });

    const response = await POST(request(validEntries(file, { sharingScope: 'workspace' })), {});
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.message).toBe('Upgrade to share templates');
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.storeTemplateArtifact).not.toHaveBeenCalled();
  });

  it('removes the uploaded PDF artifact if database persistence fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const file = fileFromBytes(await makePdf(1));
    mocks.save.mockRejectedValueOnce(new Error('database unavailable'));

    try {
      const response = await POST(request(validEntries(file)), {});
      const payload = await response.json();

      expect(response.status).toBe(500);
      expect(payload.message).toBe('An internal server error occurred');
      const artifacts = mocks.createdTemplates[0].artifacts as { pdf: Record<string, unknown> };
      expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([artifacts.pdf]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('removes both converted and source artifacts when a DOCX template cannot be persisted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const convertedPdf = await makePdf(1);
    mocks.convertOfficeDocumentToPdf.mockResolvedValueOnce(Buffer.from(convertedPdf));
    mocks.save.mockRejectedValueOnce(new Error('database unavailable'));
    const file = fileFromBytes(createDocxBytes(), {
      name: 'customer-agreement.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    try {
      const response = await POST(request(validEntries(file)), {});

      expect(response.status).toBe(500);
      expect(mocks.storeTemplateArtifact).toHaveBeenCalledTimes(2);
      const artifacts = mocks.createdTemplates[0].artifacts as {
        pdf: Record<string, unknown>;
        source: Record<string, unknown>;
      };
      expect(mocks.deleteTemplateArtifacts).toHaveBeenCalledWith([
        artifacts.pdf,
        artifacts.source,
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });
});
