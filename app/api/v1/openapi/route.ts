import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonResponse = (description: string, schema: string) => ({
  description,
  content: { 'application/json': { schema: schemaRef(schema) } },
});
const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' };
const optionalDate = { type: 'string', format: 'date-time', nullable: true };
const recipientStatus = {
  type: 'string',
  enum: ['pending', 'sent', 'viewed', 'signed', 'approved', 'rejected', 'delivery_failed', 'expired'],
  description: 'Recipient signing state. A sent state alone does not confirm email delivery; inspect deliveryFailures and deliveryPending on send/retry responses.',
};
const deliveryProperties = {
  deliveryFailures: { type: 'array', items: schemaRef('DeliveryFailure') },
  deliveryPending: {
    type: 'integer', minimum: 0,
    description: 'When present, the number of signing emails still queued or processing. A successful HTTP response does not guarantee every email has been delivered.',
  },
  retryable: {
    type: 'boolean',
    description: 'Whether failed or pending deliveries remain. Retry does not guarantee successful delivery.',
  },
};

export async function GET() {
  const documentIdParameter = {
    name: 'documentId',
    in: 'path',
    required: true,
    schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
  };
  const standardErrors = {
    '400': jsonResponse('Invalid request; error identifies the failure and may include validation details', 'Error'),
    '401': jsonResponse('Invalid API key', 'Error'),
    '403': jsonResponse('Insufficient scope', 'Error'),
    '429': {
      ...jsonResponse('Rate limit exceeded', 'RateLimitError'),
      headers: Object.fromEntries(['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
        .map((name) => [name, { $ref: `#/components/headers/${name}` }])),
    },
    '503': jsonResponse('Service or storage unavailable', 'Error'),
  };
  const writeErrors = {
    ...standardErrors,
    '403': jsonResponse('Insufficient scope or expired workspace trial', 'WriteAccessError'),
    '404': jsonResponse('Document or workspace not found', 'WriteAccessError'),
  };
  return NextResponse.json({
    openapi: '3.0.3',
    info: {
      title: 'SignWorkflow API',
      version: '1.0.0',
      description: 'Create, inspect, send, and download documents using a workspace API key.',
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        BearerAuth: { type: 'http', scheme: 'bearer', description: 'The same workspace API key may instead be supplied as a Bearer token.' },
      },
      headers: {
        'Retry-After': { description: 'Seconds to wait before retrying.', schema: { type: 'integer', minimum: 0 } },
        'X-RateLimit-Limit': { description: 'Request allowance for this API key in the current window.', schema: { type: 'integer', minimum: 1 } },
        'X-RateLimit-Remaining': { description: 'Remaining requests in the current window.', schema: { type: 'integer', minimum: 0 } },
        'X-RateLimit-Reset': { description: 'Window reset time as Unix epoch seconds.', schema: { type: 'integer', format: 'int64' } },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', description: 'Machine-readable failure code.' },
            message: { type: 'string' },
            details: schemaRef('ValidationDetails'),
            fieldId: { type: 'string', description: 'Field that references a page outside the PDF.' },
            pageNumber: { type: 'integer', minimum: 1 },
            pageCount: { type: 'integer', minimum: 1 },
          },
        },
        ValidationDetails: {
          type: 'object', required: ['formErrors', 'fieldErrors'],
          properties: {
            formErrors: { type: 'array', items: { type: 'string' } },
            fieldErrors: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
          },
        },
        WorkspaceAccessError: {
          type: 'object', required: ['message', 'reason'],
          properties: {
            message: { type: 'string' },
            reason: { type: 'string', enum: ['trial_expired', 'workspace_not_found'] },
          },
        },
        WriteAccessError: { oneOf: [schemaRef('Error'), schemaRef('WorkspaceAccessError')] },
        RateLimitError: {
          type: 'object', required: ['error', 'retryAfterSeconds'],
          properties: {
            error: { type: 'string', enum: ['rate_limit_exceeded'] },
            retryAfterSeconds: { type: 'integer', minimum: 0 },
          },
        },
        Document: {
          type: 'object',
          required: ['id', 'name', 'status'],
          properties: {
            id: objectId,
            name: { type: 'string' },
            status: { type: 'string' },
          },
        },
        DocumentListItem: {
          allOf: [schemaRef('Document'), {
            type: 'object', required: ['documentName'],
            properties: {
              documentName: { type: 'string', description: 'The stored document name; name is also returned as an alias.' },
              createdAt: optionalDate,
              updatedAt: optionalDate,
              completedAt: optionalDate,
              finalizedAt: optionalDate,
            },
          }],
        },
        DocumentDetail: {
          type: 'object', required: ['id', 'documentName', 'originalFileName', 'recipients'],
          properties: {
            id: objectId,
            documentName: { type: 'string', description: 'The detail endpoint returns documentName, without a name alias.' },
            originalFileName: { type: 'string' },
            status: { type: 'string' },
            signingMode: { type: 'string', enum: ['parallel', 'sequential'] },
            currentVersion: { type: 'integer', minimum: 0 },
            recipients: { type: 'array', items: schemaRef('DocumentRecipient') },
            createdAt: optionalDate,
            updatedAt: optionalDate,
            completedAt: optionalDate,
            finalizedAt: optionalDate,
          },
        },
        DocumentRecipient: {
          type: 'object', required: ['id', 'name', 'role'],
          description: 'Stored recipient details, with signingToken and signingTokenHash removed. Optional metadata is returned when stored; draft template roles may have an empty email.',
          properties: {
            _id: objectId,
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['signer', 'approver', 'viewer'] },
            status: recipientStatus,
            order: { type: 'number', nullable: true },
            color: { type: 'string' },
            isCC: { type: 'boolean' },
            captureGpsLocation: { type: 'boolean' },
            sendReminders: { type: 'boolean' },
            reminderDays: { type: 'number', nullable: true },
            expiresAt: optionalDate,
            signedAt: optionalDate,
            signedVersion: { type: 'number', nullable: true },
            approvedAt: optionalDate,
            rejectedAt: optionalDate,
            viewedAt: optionalDate,
            location: {
              type: 'object', nullable: true,
              properties: {
                latitude: { type: 'number' }, longitude: { type: 'number' }, accuracyMeters: { type: 'number' },
                city: { type: 'string' }, state: { type: 'string' }, country: { type: 'string' }, capturedAt: optionalDate,
              },
            },
            device: {
              type: 'object', nullable: true,
              properties: {
                type: { type: 'string', enum: ['mobile', 'desktop', 'tablet'] },
                os: { type: 'string' }, browser: { type: 'string' }, userAgent: { type: 'string' },
              },
            },
            network: {
              type: 'object', nullable: true,
              properties: {
                ip: { type: 'string' }, ipUnavailableReason: { type: 'string' }, isp: { type: 'string' },
                ipLocation: { type: 'object', properties: { city: { type: 'string' }, country: { type: 'string' } } },
              },
            },
            consent: {
              type: 'object', nullable: true,
              properties: {
                locationGranted: { type: 'boolean' }, grantedAt: optionalDate,
                method: { type: 'string', enum: ['system_prompt', 'checkbox', 'other'] },
                esignDisclosureAccepted: { type: 'boolean' }, esignDisclosureAcceptedAt: optionalDate,
                esignDisclosureVersion: { type: 'string' }, esignDisclosureMethod: { type: 'string', enum: ['checkbox', 'typed', 'other'] },
              },
            },
            identityVerification: {
              type: 'object', nullable: true,
              properties: {
                method: { type: 'string', enum: ['email', 'sms', 'kba', 'id_document', 'bank_id', 'selfie', 'manual', 'none'] },
                provider: { type: 'string' }, result: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
                verifiedAt: optionalDate, transactionId: { type: 'string' }, payloadHash: { type: 'string' },
              },
            },
            authentication: {
              type: 'object', nullable: true,
              properties: {
                method: { type: 'string', enum: ['email', 'sms', 'otp', 'sso', 'none'] },
                channel: { type: 'string' }, verifiedAt: optionalDate, transactionId: { type: 'string' },
              },
            },
          },
        },
        Pagination: {
          type: 'object', required: ['page', 'limit', 'total', 'hasMore'],
          properties: {
            page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 },
            total: { type: 'integer', minimum: 0 }, hasMore: { type: 'boolean' },
          },
        },
        ListDocumentsResponse: {
          type: 'object', required: ['data', 'pagination'],
          properties: { data: { type: 'array', items: schemaRef('DocumentListItem') }, pagination: schemaRef('Pagination') },
        },
        CreateDocumentResponse: {
          type: 'object', required: ['data'], properties: { data: schemaRef('Document') },
        },
        GetDocumentResponse: {
          type: 'object', required: ['data'], properties: { data: schemaRef('DocumentDetail') },
        },
        PrepareDocumentResponse: {
          type: 'object', required: ['data'],
          properties: {
            data: {
              type: 'object', required: ['id', 'version', 'fieldCount', 'status'],
              properties: { id: objectId, version: { type: 'integer', minimum: 0 }, fieldCount: { type: 'integer', minimum: 1 }, status: { type: 'string' } },
            },
          },
        },
        DeliveryFailure: {
          type: 'object', required: ['id', 'reason'],
          properties: { id: { type: 'string', description: 'Recipient ID.' }, reason: { type: 'string' } },
        },
        SendDocumentResponse: {
          type: 'object', required: ['data', 'deliveryFailures', 'retryable'],
          properties: {
            ...deliveryProperties,
            data: {
              type: 'object', required: ['id', 'status', 'recipients'],
              properties: {
                id: objectId, status: { type: 'string' },
                recipients: {
                  type: 'array', items: {
                    type: 'object', required: ['id', 'status'],
                    properties: { id: { type: 'string' }, status: recipientStatus },
                  },
                },
              },
            },
          },
        },
        RetryDocumentResponse: {
          type: 'object', required: ['data', 'deliveryFailures'],
          properties: {
            ...deliveryProperties,
            data: {
              type: 'object', required: ['id', 'retried'],
              properties: { id: objectId, retried: { type: 'boolean', enum: [true] } },
            },
          },
        },
        FinalizedPdf: { type: 'string', format: 'binary' },
        CreateDocumentRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'contentBase64'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            contentBase64: { type: 'string', minLength: 32, maxLength: 40_000_000, description: 'Base64-encoded PDF, optionally prefixed with data:application/pdf;base64,. The decoded PDF must be at most 25 MiB.' },
          },
        },
        Recipient: {
          type: 'object',
          required: ['id', 'email', 'name'],
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 120 },
            email: { type: 'string', format: 'email', maxLength: 320 },
            name: { type: 'string', minLength: 1, maxLength: 200 },
            role: { type: 'string', enum: ['signer', 'approver', 'viewer'], default: 'signer' },
            order: { type: 'integer', minimum: 1 },
          },
        },
        Field: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'type', 'x', 'y', 'width', 'height'],
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 120 },
            type: {
              type: 'string',
              enum: ['signature', 'text', 'full_name', 'date', 'checkbox', 'radio', 'dropdown', 'image', 'initials', 'live_photo', 'stamp'],
            },
            x: { type: 'number', minimum: 0, description: 'Left edge in PDF points, or viewport pixels when pageRect is supplied.' },
            y: { type: 'number', minimum: 0, description: 'Top edge in PDF points, or viewport pixels when pageRect is supplied.' },
            width: { type: 'number', minimum: 0, exclusiveMinimum: true },
            height: { type: 'number', minimum: 0, exclusiveMinimum: true },
            pageNumber: { type: 'integer', minimum: 1, default: 1, description: 'One-based page number; must not exceed the uploaded PDF page count.' },
            recipientId: { type: 'string', nullable: true, minLength: 1, maxLength: 120 },
            required: { type: 'boolean', default: true },
            value: { type: 'string', maxLength: 100_000, description: 'Image-based fields require a decodable PNG or JPEG data URL; remote image URLs are rejected.' },
            placeholder: { type: 'string', maxLength: 500 },
            fieldOwner: { type: 'string', enum: ['me', 'recipients'], default: 'recipients' },
            pageRect: {
              type: 'object',
              additionalProperties: false,
              nullable: true,
              required: ['width', 'height'],
              properties: {
                width: { type: 'number', minimum: 0, exclusiveMinimum: true },
                height: { type: 'number', minimum: 0, exclusiveMinimum: true },
                x: { type: 'number' },
                y: { type: 'number' },
                left: { type: 'number' },
                top: { type: 'number' },
                right: { type: 'number' },
                bottom: { type: 'number' },
              },
            },
            settings: { type: 'object', additionalProperties: true },
          },
        },
        PrepareDocumentRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['fields'],
          properties: {
            fields: {
              type: 'array',
              minItems: 1,
              maxItems: 4000,
              items: { $ref: '#/components/schemas/Field' },
            },
          },
        },
        SendDocumentRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['recipients'],
          properties: {
            recipients: { type: 'array', minItems: 1, maxItems: 100, items: { $ref: '#/components/schemas/Recipient' } },
            subject: { type: 'string', maxLength: 300 },
            message: { type: 'string', maxLength: 2000 },
          },
        },
      },
    },
    paths: {
      '/api/v1/documents': {
        get: {
          summary: 'List documents',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
          ],
          responses: { '200': jsonResponse('Document collection with pagination', 'ListDocumentsResponse'), ...standardErrors },
        },
        post: {
          summary: 'Create a PDF document',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateDocumentRequest' } } } },
          responses: { '201': jsonResponse('Document created', 'CreateDocumentResponse'), ...writeErrors },
        },
      },
      '/api/v1/documents/{documentId}': {
        parameters: [documentIdParameter],
        get: { summary: 'Get document status', responses: { '200': jsonResponse('Document details and sanitized recipients', 'GetDocumentResponse'), '404': jsonResponse('Document not found', 'Error'), ...standardErrors } },
      },
      '/api/v1/documents/{documentId}/send': {
        parameters: [documentIdParameter],
        post: {
          summary: 'Send a prepared document for signing',
          description: 'The document must contain a prepared version with required fields assigned to every signer.',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SendDocumentRequest' } } } },
          responses: { '200': jsonResponse('Document accepted for signing; inspect deliveryFailures, retryable, and deliveryPending when present for email delivery results', 'SendDocumentResponse'), '409': jsonResponse('Document cannot be sent from its current state or dispatch is already claimed', 'Error'), ...writeErrors },
        },
      },
      '/api/v1/documents/{documentId}/prepare': {
        parameters: [documentIdParameter],
        put: {
          summary: 'Create or replace a prepared field layout',
          description: 'Creates an unlocked prepared version when needed and replaces its field layout. Recipient-owned fields must include recipientId values that match the later send request.',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PrepareDocumentRequest' } } } },
          responses: { '200': jsonResponse('Prepared field layout saved', 'PrepareDocumentResponse'), '409': jsonResponse('Document or prepared version cannot be modified, or a concurrent update conflicted', 'Error'), ...writeErrors },
        },
      },
      '/api/v1/documents/{documentId}/send/retry': {
        parameters: [documentIdParameter],
        post: { summary: 'Retry failed signing-request deliveries', responses: { '200': jsonResponse('Retry attempted; inspect deliveryFailures and optional pending/retryable results', 'RetryDocumentResponse'), '409': jsonResponse('No retryable deliveries are available for this document', 'Error'), ...writeErrors } },
      },
      '/api/v1/documents/{documentId}/download': {
        parameters: [documentIdParameter],
        get: {
          summary: 'Download finalized PDF',
          responses: {
            '200': {
              description: 'Finalized PDF', content: { 'application/pdf': { schema: schemaRef('FinalizedPdf') } },
              headers: {
                'Content-Disposition': { description: 'Attachment disposition with the PDF filename.', schema: { type: 'string' } },
                'Content-Length': { description: 'PDF size in bytes.', schema: { type: 'integer', minimum: 0 } },
              },
            },
            '404': jsonResponse('Document not found', 'Error'),
            '409': jsonResponse('Document is not complete', 'Error'),
            ...standardErrors,
          },
        },
      },
    },
  });
}
