import Ajv from 'ajv';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiKey: vi.fn(), trialGuard: vi.fn(), find: vi.fn(), findOne: vi.fn(), create: vi.fn(),
  countDocuments: vi.fn(), updateOne: vi.fn(), findOneAndUpdate: vi.fn(),
  sendEmail: vi.fn(), deliverySummary: vi.fn(), retryJobs: vi.fn(),
  buildPdf: vi.fn(),
}));

vi.mock('@/lib/api-key', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-key')>(),
  getApiKeyContext: mocks.apiKey,
}));
vi.mock('@/lib/subscription-server', () => ({ getExpiredTrialWriteGuard: mocks.trialGuard }));
vi.mock('@/utils/db', () => ({ default: vi.fn() }));
vi.mock('@/models/Document', () => ({ default: {
  find: mocks.find, findOne: mocks.findOne, create: mocks.create,
  countDocuments: mocks.countDocuments, updateOne: mocks.updateOne, findOneAndUpdate: mocks.findOneAndUpdate,
} }));
vi.mock('@/lib/audit', () => ({ writeAuditEvent: vi.fn() }));
vi.mock('@/lib/hash', () => ({ sha256Buffer: vi.fn().mockResolvedValue('pdf-content-hash') }));
vi.mock('@/lib/email', () => ({ sendSigningRequestEmail: mocks.sendEmail }));
// The durable delivery implementation uses the same public response with optional queue results.
vi.mock('@/lib/signing-email-jobs', () => ({
  createSigningEmailDelivery: vi.fn((recipientId: string) => ({ recipientId, status: 'queued' })),
  processSigningEmailJobs: vi.fn(),
  getSigningEmailDeliverySummary: mocks.deliverySummary,
  retrySigningEmailJobs: mocks.retryJobs,
}));
vi.mock('@/lib/signed-document-pdf', () => ({ buildSignedDocumentPdf: mocks.buildPdf }));
vi.mock('@/lib/s3', () => ({
  getStorageProvider: () => 's3', getStorageBucketName: () => 'documents', getRegion: () => 'us-east-1',
  normalizeStorageProvider: () => 's3', putObjectStream: vi.fn(), deleteObject: vi.fn(), copyObject: vi.fn(),
  getObjectStream: vi.fn(), streamToBuffer: () => Buffer.from('pdf'),
}));
vi.mock('pdf-lib', () => ({ PDFDocument: { load: async () => ({ getPageCount: () => 1 }) } }));

import { GET as openapi } from '@/app/api/v1/openapi/route';
import { GET as list, POST as upload } from '@/app/api/v1/documents/route';
import { GET as detail } from '@/app/api/v1/documents/[documentId]/route';
import { PUT as prepare } from '@/app/api/v1/documents/[documentId]/prepare/route';
import { POST as send } from '@/app/api/v1/documents/[documentId]/send/route';
import { POST as retry } from '@/app/api/v1/documents/[documentId]/send/retry/route';
import { GET as download } from '@/app/api/v1/documents/[documentId]/download/route';

const ID = '507f1f77bcf86cd799439011';
const BASE = '/api/v1/documents';
const ITEM = `${BASE}/{documentId}`;
const context = { params: Promise.resolve({ documentId: ID }) };
const field = { id: 'signature', type: 'signature', x: 10, y: 10, width: 100, height: 40, recipientId: 'signer', required: true };
const recipient = { id: 'signer', name: 'Signer', email: 'signer@example.com', role: 'signer' };
const apiKey = {
  orgId: '507f1f77bcf86cd799439012', userId: '507f1f77bcf86cd799439013',
  scopes: ['documents:read', 'documents:write'],
  rateLimit: { allowed: true, limit: 600, remaining: 599, retryAfterSeconds: 0, resetAt: 1_800_000_000_000 },
};

type Schema = {
  $ref?: string; type?: string; format?: string; required?: string[];
  properties?: Record<string, Schema>; items?: Schema; allOf?: Schema[]; oneOf?: Schema[];
};
type ResponseContract = { content: Record<string, { schema: Schema }>; headers?: Record<string, { $ref?: string; schema?: Schema }> };
type Operation = { responses: Record<string, ResponseContract> };
type Spec = {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema>; headers: Record<string, { schema: Schema }> };
};
let spec: Spec;
let ajv: Ajv.Ajv;

function request(method = 'GET', body?: unknown) {
  return new NextRequest(`https://signworkflow.com${BASE}`, {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

function draft() {
  return {
    _id: ID, orgId: apiKey.orgId, userId: apiKey.userId, documentName: 'Agreement', originalFileName: 'agreement.pdf',
    status: 'draft', currentVersion: 1, updatedAt: new Date('2026-01-01T00:00:00Z'), recipients: [], signingEvents: [],
    versions: [{ version: 1, label: 'prepared', fields: [field], storage: { provider: 's3', bucket: 'documents', key: 'prepared.pdf' } }],
    save: vi.fn(), set: vi.fn(),
  };
}

// OpenAPI 3.0 uses boolean exclusiveMinimum; AJV's JSON Schema dialect uses a number.
function jsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (!value || typeof value !== 'object') return value;
  const schema = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSchema(item)]));
  if (schema.exclusiveMinimum === true) { schema.exclusiveMinimum = schema.minimum; delete schema.minimum; }
  return schema;
}

function validate(schema: Schema, body: unknown) {
  const check = ajv.compile({ ...jsonSchema(schema) as object, components: jsonSchema(spec.components) });
  expect(check(body), JSON.stringify(check.errors)).toBe(true);
  return check;
}

async function assertResponse(path: string, method: string, response: Response, status: number) {
  expect(response.status).toBe(status);
  const contract = spec.paths[path][method].responses[String(status)];
  expect(contract).toBeDefined();
  const body: unknown = await response.json();
  validate(contract.content['application/json'].schema, body);
  return body;
}

const operations = [
  { path: BASE, method: 'get', invoke: () => list(request()) },
  { path: BASE, method: 'post', invoke: () => upload(request('POST', { name: 'Agreement', contentBase64: Buffer.from('%PDF-1.7\n' + ' '.repeat(64)).toString('base64') })) },
  { path: ITEM, method: 'get', invoke: () => detail(request(), context) },
  { path: `${ITEM}/prepare`, method: 'put', invoke: () => prepare(request('PUT', { fields: [field] }), context) },
  { path: `${ITEM}/send`, method: 'post', invoke: () => send(request('POST', { recipients: [recipient] }), context) },
  { path: `${ITEM}/send/retry`, method: 'post', invoke: () => retry(request('POST'), context) },
  { path: `${ITEM}/download`, method: 'get', invoke: () => download(request(), context) },
];

describe('published document API response contracts', () => {
  beforeAll(async () => {
    spec = await (await openapi()).json() as Spec;
    ajv = new Ajv({ allErrors: true, nullable: true, unknownFormats: ['binary', 'byte', 'int64'] });
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.apiKey.mockResolvedValue(apiKey);
    mocks.trialGuard.mockResolvedValue({ allowed: true });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.deliverySummary.mockResolvedValue({ status: 'in_progress', recipients: [{ id: 'signer', status: 'sent' }], failures: [], pending: 0 });
    mocks.retryJobs.mockResolvedValue(true);
  });

  it('references a schema for every published response and resolves every schema/header reference', () => {
    expect(spec.openapi).toBe('3.0.3');
    expect(Object.keys(spec.paths).sort()).toEqual([...new Set(operations.map((operation) => operation.path))].sort());
    for (const { path, method } of operations) {
      for (const response of Object.values(spec.paths[path][method].responses)) {
        expect(Object.values(response.content)[0].schema.$ref).toMatch(/^#\/components\/schemas\//);
      }
    }
    function visit(value: unknown) {
      if (!value || typeof value !== 'object') return;
      const object = value as Record<string, unknown>;
      if (typeof object.$ref === 'string') {
        expect(object.$ref.startsWith('#/')).toBe(true);
        let resolved: unknown = spec;
        for (const part of object.$ref.slice(2).split('/')) resolved = (resolved as Record<string, unknown>)[part];
        expect(resolved, object.$ref).toBeDefined();
      }
      Object.values(object).forEach(visit);
    }
    visit(spec);
    for (const name of Object.keys(spec.components.schemas)) {
      expect(() => ajv.compile({ $ref: `#/components/schemas/${name}`, components: jsonSchema(spec.components) })).not.toThrow();
    }
  });

  it('validates the real list envelope, aliases, timestamps, and pagination requiredness', async () => {
    const item = { _id: ID, documentName: 'Agreement', status: 'draft', completedAt: null, createdAt: new Date('2026-01-01T00:00:00Z') };
    const query = { select: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([item]) };
    mocks.find.mockReturnValue(query);
    mocks.countDocuments.mockResolvedValue(2);
    const body = await assertResponse(BASE, 'get', await list(request()), 200) as { data: unknown[]; pagination?: unknown };
    expect(body.data[0]).toMatchObject({ id: ID, name: 'Agreement', documentName: 'Agreement', completedAt: null });
    const check = validate(spec.paths[BASE].get.responses['200'].content['application/json'].schema, body);
    expect(check({ data: body.data })).toBe(false);
    expect(check({ ...body, pagination: { page: 1, limit: 25, total: 2 } })).toBe(false);
  });

  it('validates detail without inventing a name alias, required timestamps, or draft email format', async () => {
    const document = {
      _id: ID, documentName: 'Agreement', originalFileName: 'agreement.pdf', status: 'draft', finalizedAt: null,
      recipients: [{ ...recipient, email: '', status: 'pending', signingToken: 'secret', signingTokenHash: 'secret-hash', signedAt: null }],
    };
    mocks.findOne.mockReturnValue({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(document) });
    const body = await assertResponse(ITEM, 'get', await detail(request(), context), 200) as { data: { recipients: unknown[]; name?: string } };
    expect(body.data.name).toBeUndefined();
    expect(body.data.recipients[0]).not.toHaveProperty('signingToken');
    expect(body.data.recipients[0]).not.toHaveProperty('signingTokenHash');
    const check = validate(spec.paths[ITEM].get.responses['200'].content['application/json'].schema, body);
    expect(check({ data: { ...body.data, documentName: undefined, name: 'Agreement' } })).toBe(false);
  });

  it('validates the actual upload result with only the three fields it returns', async () => {
    mocks.create.mockImplementation(async (document) => document);
    const operation = operations[1];
    const body = await assertResponse(operation.path, operation.method, await operation.invoke(), 201);
    expect(body).toEqual({ data: { id: expect.any(String), name: 'Agreement', status: 'draft' } });
  });

  it('validates preparation output and rejects missing version or field count', async () => {
    mocks.findOne.mockResolvedValue(draft());
    const operation = operations[3];
    const body = await assertResponse(operation.path, operation.method, await operation.invoke(), 200);
    expect(body).toEqual({ data: { id: ID, version: 1, fieldCount: 1, status: 'draft' } });
    const check = validate(spec.components.schemas.PrepareDocumentResponse, body);
    expect(check({ data: { id: ID, status: 'draft' } })).toBe(false);
  });

  it.each([false, true])('validates send output with delivery failure = %s', async (failed) => {
    mocks.findOne.mockResolvedValue(draft());
    if (failed) mocks.sendEmail.mockRejectedValue(new Error('SMTP unavailable'));
    const failures = failed ? [{ id: 'signer', reason: 'SMTP unavailable' }] : [];
    mocks.deliverySummary.mockResolvedValue({ status: 'in_progress', recipients: [{ id: 'signer', status: failed ? 'delivery_failed' : 'sent' }], failures, pending: 0 });
    const operation = operations[4];
    const body = await assertResponse(operation.path, operation.method, await operation.invoke(), 200) as Record<string, unknown>;
    expect(body).toMatchObject({ data: { id: ID, status: 'in_progress' }, deliveryFailures: failures, retryable: failed });
    const check = validate(spec.components.schemas.SendDocumentResponse, body);
    expect(check({ ...body, deliveryFailures: undefined })).toBe(false);
    expect(check({ ...body, data: { id: ID, status: 'in_progress', recipients: [{ id: 'signer' }] } })).toBe(false);
    expect(check({ ...body, deliveryPending: 2, retryable: true })).toBe(true);
    expect(check({ ...body, deliveryPending: -1 })).toBe(false);
  });

  it('validates retry output including partial failures and optional queue results', async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ ...draft(), recipients: [{ ...recipient, status: 'delivery_failed' }] });
    mocks.sendEmail.mockRejectedValue(new Error('SMTP unavailable'));
    mocks.deliverySummary.mockResolvedValue({ failures: [{ id: 'signer', reason: 'SMTP unavailable' }], pending: 1 });
    const operation = operations[5];
    const body = await assertResponse(operation.path, operation.method, await operation.invoke(), 200) as Record<string, unknown>;
    expect(body).toMatchObject({ data: { id: ID, retried: true }, deliveryFailures: [{ id: 'signer', reason: 'SMTP unavailable' }] });
    const check = validate(spec.components.schemas.RetryDocumentResponse, body);
    expect(check({ ...body, deliveryPending: 1, retryable: true })).toBe(true);
    expect(check({ ...body, data: { id: ID, retried: 'true' } })).toBe(false);
    expect(check({ ...body, deliveryFailures: [{ id: 'signer' }] })).toBe(false);
  });

  it('documents the actual binary PDF response and download headers', async () => {
    mocks.findOne.mockResolvedValue({ ...draft(), status: 'completed' });
    const pdf = Buffer.from('%PDF-1.7 test');
    mocks.buildPdf.mockResolvedValue({ buffer: pdf, fileName: 'agreement.pdf' });
    const response = await download(request(), context);
    expect(response.status).toBe(200);
    const contract = spec.paths[`${ITEM}/download`].get.responses['200'];
    expect(contract.content['application/pdf'].schema.$ref).toBe('#/components/schemas/FinalizedPdf');
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="agreement.pdf"');
    expect(response.headers.get('Content-Length')).toBe(String(pdf.length));
    expect(Object.keys(contract.headers!)).toEqual(['Content-Disposition', 'Content-Length']);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
  });

  it.each(operations)('validates rate limits and every advertised rate-limit header for $method $path', async ({ path, method, invoke }) => {
    mocks.apiKey.mockResolvedValue({ ...apiKey, rateLimit: { ...apiKey.rateLimit, allowed: false, remaining: 0, retryAfterSeconds: 42 } });
    const response = await invoke();
    const headers = spec.paths[path][method].responses['429'].headers!;
    expect(Object.keys(headers)).toHaveLength(4);
    for (const [name, header] of Object.entries(headers)) {
      const value = response.headers.get(name);
      expect(value).not.toBeNull();
      validate(spec.components.headers[header.$ref!.split('/').at(-1)!].schema, Number(value));
    }
    expect(await assertResponse(path, method, response, 429)).toEqual({ error: 'rate_limit_exceeded', retryAfterSeconds: 42 });
  });

  it.each(operations)('validates authentication and scope errors for $method $path', async ({ path, method, invoke }) => {
    mocks.apiKey.mockResolvedValueOnce(null);
    await assertResponse(path, method, await invoke(), 401);
    mocks.apiKey.mockResolvedValueOnce({ ...apiKey, scopes: [] });
    await assertResponse(path, method, await invoke(), 403);
  });

  it.each(operations.filter(({ method }) => method !== 'get'))('accepts real trial/workspace errors without an error property for $method $path', async ({ path, method, invoke }) => {
    for (const [status, reason] of [[403, 'trial_expired'], [404, 'workspace_not_found']] as const) {
      mocks.trialGuard.mockResolvedValueOnce({ allowed: false, status, reason, message: 'Workspace access denied.' });
      expect(await assertResponse(path, method, await invoke(), status)).toEqual({ message: 'Workspace access denied.', reason });
    }
  });

  it('validates real request-validation details and page-boundary errors', async () => {
    const invalid = await prepare(request('PUT', { fields: [] }), context);
    const body = await assertResponse(`${ITEM}/prepare`, 'put', invalid, 400);
    expect(body).toMatchObject({ error: 'invalid_request', details: { formErrors: [], fieldErrors: { fields: expect.any(Array) } } });
    mocks.findOne.mockResolvedValue(draft());
    const outOfRange = await prepare(request('PUT', { fields: [{ ...field, pageNumber: 2 }] }), context);
    expect(await assertResponse(`${ITEM}/prepare`, 'put', outOfRange, 400)).toEqual({ error: 'page_number_out_of_range', fieldId: 'signature', pageNumber: 2, pageCount: 1 });
  });

  it('validates not-found and conflict responses from the routes', async () => {
    mocks.findOne.mockResolvedValue(null);
    await assertResponse(`${ITEM}/send`, 'post', await operations[4].invoke(), 404);
    await assertResponse(`${ITEM}/download`, 'get', await operations[6].invoke(), 404);
    mocks.findOne.mockResolvedValue({ ...draft(), status: 'completed' });
    await assertResponse(`${ITEM}/send`, 'post', await operations[4].invoke(), 409);
    mocks.findOne.mockResolvedValue(draft());
    await assertResponse(`${ITEM}/download`, 'get', await operations[6].invoke(), 409);
    mocks.findOneAndUpdate.mockResolvedValue(null);
    mocks.retryJobs.mockResolvedValue(false);
    await assertResponse(`${ITEM}/send/retry`, 'post', await operations[5].invoke(), 409);
  });

  it('validates service errors without requiring optional error metadata', async () => {
    mocks.apiKey.mockRejectedValue(new Error('Database unavailable'));
    await assertResponse(BASE, 'get', await list(request()), 503);
    const check = validate(spec.components.schemas.Error, { error: 'api_unavailable' });
    expect(check({})).toBe(false);
  });
});
