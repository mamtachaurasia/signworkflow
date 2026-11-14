import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  assistWriting: vi.fn(),
  buildDocumentWriteFilter: vi.fn(),
  canManageTemplate: vi.fn(),
  connectDB: vi.fn(),
  consumeRateLimit: vi.fn(),
  documentFindOne: vi.fn(),
  findById: vi.fn(),
  getAIService: vi.fn(),
  getAuthContext: vi.fn(),
  getClientIp: vi.fn(),
  hasAnySignedRecipient: vi.fn(),
  isSecureRequest: vi.fn(),
  validateCsrfToken: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: mocks.getClientIp,
  isSecureRequest: mocks.isSecureRequest,
  validateCsrfToken: mocks.validateCsrfToken,
  withSecurityHeaders: (_req: NextRequest, response: Response) => response,
}));

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: mocks.getAuthContext,
}));

vi.mock('@/lib/document-guards', () => ({
  hasAnySignedRecipient: mocks.hasAnySignedRecipient,
}));

vi.mock('@/lib/document-sharing', () => ({
  buildDocumentWriteFilter: mocks.buildDocumentWriteFilter,
  normalizeShareEmail: (value: unknown) => typeof value === 'string' ? value : null,
}));

vi.mock('@/lib/template-access', () => ({
  canManageTemplate: mocks.canManageTemplate,
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

vi.mock('@/lib/modules/ai/ai.service', () => ({
  getAIService: mocks.getAIService,
}));

vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: {
    findById: mocks.findById,
  },
}));

vi.mock('@/models/Document', () => ({
  __esModule: true,
  default: {
    findOne: mocks.documentFindOne,
  },
}));

vi.mock('@/models/Users', () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('@/utils/db', () => ({
  default: mocks.connectDB,
}));

import { POST } from '@/app/api/ai/template-writing-assistant/route';
import {
  WritingAssistantProviderError,
  WritingPlaceholderIntegrityError,
} from '@/lib/modules/ai/writing-assistant';

const TEMPLATE_ID = '507f1f77bcf86cd799439011';
const DOCUMENT_ID = '507f1f77bcf86cd799439012';

function writingRequest(
  resource: { templateId?: string; documentId?: string } = { templateId: TEMPLATE_ID },
  overrides: Record<string, unknown> = {}
): NextRequest {
  return new NextRequest('https://example.com/api/ai/template-writing-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...resource,
      mode: 'professional',
      instruction: 'Polish this language.',
      selectedText: '{{company_name}} shall pay within 30 days.',
      sectionText: '',
      ...overrides,
    }),
  });
}

describe('writing assistant route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.isSecureRequest.mockReturnValue(true);
    mocks.validateCsrfToken.mockReturnValue(true);
    mocks.getClientIp.mockReturnValue('127.0.0.1');
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    });
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true });
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.buildDocumentWriteFilter.mockImplementation((args: unknown) => args);
    mocks.documentFindOne.mockResolvedValue({
      editableContent: { blocks: [{ id: 'body', type: 'paragraph' }] },
      status: 'draft',
      recipients: [],
    });
    mocks.findById.mockResolvedValue({ isSystemTemplate: false });
    mocks.hasAnySignedRecipient.mockReturnValue(false);
    mocks.canManageTemplate.mockReturnValue(true);
    mocks.getAIService.mockReturnValue({ assistWriting: mocks.assistWriting });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a safe typed response when variables fail integrity validation', async () => {
    mocks.assistWriting.mockRejectedValue(
      new WritingPlaceholderIntegrityError(['{{company_name}}'], ['{{company}}'])
    );

    const response = await POST(writingRequest());
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      code: 'WRITING_PLACEHOLDER_INTEGRITY_FAILED',
      message: 'The AI suggestion changed one or more template variables. Please try again.',
    });
    expect(JSON.stringify(payload)).not.toContain('{{company_name}}');
  });

  it('maps provider failures to a safe upstream-error response', async () => {
    mocks.assistWriting.mockRejectedValue(
      new WritingAssistantProviderError(new Error('provider secret and configuration details'))
    );

    const response = await POST(writingRequest());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      code: 'WRITING_PROVIDER_FAILED',
      message: 'AI writing is temporarily unavailable. Please try again.',
    });
    expect(JSON.stringify(payload)).not.toContain('provider secret');
  });

  it('maps provider initialization failures without exposing configuration details', async () => {
    mocks.getAIService.mockImplementation(() => {
      throw new Error('OPENAI_API_KEY is missing');
    });

    const response = await POST(writingRequest());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.code).toBe('WRITING_PROVIDER_FAILED');
    expect(JSON.stringify(payload)).not.toContain('OPENAI_API_KEY');
  });

  it('allows writing assistance for an editable personal draft document', async () => {
    mocks.getAuthContext.mockResolvedValue({
      userId: 'user-1',
      orgId: null,
      orgRole: null,
    });
    mocks.assistWriting.mockResolvedValue('Payment is due within 30 days.');

    const response = await POST(writingRequest({ documentId: DOCUMENT_ID }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ suggestion: 'Payment is due within 30 days.' });
    expect(mocks.documentFindOne).toHaveBeenCalledWith(expect.objectContaining({
      documentId: DOCUMENT_ID,
      minimumAccess: 'can_edit',
      orgId: null,
      userId: 'user-1',
    }));
    expect(mocks.assistWriting).toHaveBeenCalledWith(
      '{{company_name}} shall pay within 30 days.',
      'Polish this language.',
      'professional'
    );
  });

  it('returns server-defined Smart variables for a blank scratch document draft', async () => {
    const instruction = 'Draft an agreement to sell with editable details.';
    mocks.assistWriting.mockResolvedValue(
      'This Agreement is between {{seller_name}} and {{buyer_name}} for {{property_address}} at {{sale_price}} on {{agreement_date}}.'
    );

    const response = await POST(writingRequest(
      { documentId: DOCUMENT_ID },
      {
        mode: 'draft',
        allowNewVariables: true,
        instruction,
        selectedText: '',
        sectionText: '',
      }
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      suggestion: 'This Agreement is between {{seller_name}} and {{buyer_name}} for {{property_address}} at {{sale_price}} on {{agreement_date}}.',
      newVariables: [
        { key: 'seller_name', label: 'Seller Name', defaultValue: '', required: true },
        { key: 'buyer_name', label: 'Buyer Name', defaultValue: '', required: true },
        { key: 'property_address', label: 'Property Address', defaultValue: '', required: true },
        { key: 'sale_price', label: 'Sale Price', defaultValue: '', required: true },
        { key: 'agreement_date', label: 'Agreement Date', defaultValue: '', required: true },
      ],
    });
    expect(mocks.assistWriting).toHaveBeenCalledWith(
      'Draft new agreement language.',
      instruction,
      'draft',
      { allowNewVariables: true }
    );
  });

  it('requires an explicit opt-in before a draft can create Smart variables', async () => {
    mocks.assistWriting.mockRejectedValue(
      new WritingPlaceholderIntegrityError([], ['{{seller_name}}'])
    );

    const response = await POST(writingRequest(
      { documentId: DOCUMENT_ID },
      {
        mode: 'draft',
        selectedText: '',
        sectionText: '',
      }
    ));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      code: 'WRITING_PLACEHOLDER_INTEGRITY_FAILED',
      message: 'The AI suggestion changed one or more template variables. Please try again.',
    });
    expect(mocks.assistWriting).toHaveBeenCalledWith(
      'Draft new agreement language.',
      'Polish this language.',
      'draft'
    );
  });

  it('keeps Smart-variable creation disabled when a blank scratch draft explicitly opts out', async () => {
    mocks.assistWriting.mockRejectedValue(
      new WritingPlaceholderIntegrityError([], ['{{seller_name}}'])
    );

    const response = await POST(writingRequest(
      { documentId: DOCUMENT_ID },
      {
        mode: 'draft',
        allowNewVariables: false,
        selectedText: '',
        sectionText: '',
      }
    ));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      code: 'WRITING_PLACEHOLDER_INTEGRITY_FAILED',
      message: 'The AI suggestion changed one or more template variables. Please try again.',
    });
    expect(mocks.assistWriting).toHaveBeenCalledWith(
      'Draft new agreement language.',
      'Polish this language.',
      'draft'
    );
  });

  it('allows an editable nonblank document draft to explicitly create Smart variables', async () => {
    mocks.documentFindOne.mockResolvedValue({
      editableContent: {
        blocks: [
          { id: 'title', type: 'title', text: 'Untitled Agreement' },
          { id: 'body', type: 'paragraph', text: '{{seller_name}} agrees to sell the property.' },
        ],
        variables: [{ key: 'seller_name', label: 'Seller Name', defaultValue: '', required: true }],
      },
      status: 'draft',
      recipients: [],
    });
    mocks.assistWriting.mockResolvedValue(
      '{{seller_name}} agrees to sell the property to {{buyer_name}} for {{sale_price}}.'
    );

    const response = await POST(writingRequest(
      { documentId: DOCUMENT_ID },
      {
        mode: 'draft',
        allowNewVariables: true,
        selectedText: '{{seller_name}} agrees to sell the property.',
        sectionText: 'Untitled Agreement\n{{seller_name}} agrees to sell the property.',
      }
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      suggestion: '{{seller_name}} agrees to sell the property to {{buyer_name}} for {{sale_price}}.',
      newVariables: [
        { key: 'buyer_name', label: 'Buyer Name', defaultValue: '', required: true },
        { key: 'sale_price', label: 'Sale Price', defaultValue: '', required: true },
      ],
    });
    expect(mocks.assistWriting).toHaveBeenCalledWith(
      '{{seller_name}} agrees to sell the property.',
      'Polish this language.',
      'draft',
      { allowNewVariables: true }
    );
  });

  it('does not present an already-defined document variable as a newly-added one', async () => {
    mocks.documentFindOne.mockResolvedValue({
      editableContent: {
        blocks: [{ id: 'body', type: 'paragraph', text: 'Existing agreement text.' }],
        variables: [{ key: 'seller_name', label: 'Seller Name', defaultValue: '', required: true }],
      },
      status: 'draft',
      recipients: [],
    });
    mocks.assistWriting.mockResolvedValue(
      'The {{seller_name}} agrees to sell the property to {{buyer_name}}.'
    );

    const response = await POST(writingRequest(
      { documentId: DOCUMENT_ID },
      {
        mode: 'draft',
        allowNewVariables: true,
        selectedText: '',
        sectionText: '',
      }
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      suggestion: 'The {{seller_name}} agrees to sell the property to {{buyer_name}}.',
      newVariables: [
        { key: 'buyer_name', label: 'Buyer Name', defaultValue: '', required: true },
      ],
    });
  });

  it('does not allow a template to opt into Smart-variable creation', async () => {
    mocks.assistWriting.mockResolvedValue('A fresh agreement draft.');

    const response = await POST(writingRequest(
      { templateId: TEMPLATE_ID },
      {
        mode: 'draft',
        allowNewVariables: true,
        selectedText: '',
        sectionText: '',
      }
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ suggestion: 'A fresh agreement draft.' });
    expect(mocks.assistWriting).toHaveBeenCalledWith(
      'Draft new agreement language.',
      'Polish this language.',
      'draft'
    );
  });

  it('rejects writing assistance for a document that cannot be edited', async () => {
    mocks.documentFindOne.mockResolvedValue({
      editableContent: { blocks: [{ id: 'body', type: 'paragraph' }] },
      status: 'sent',
      recipients: [],
    });

    const response = await POST(writingRequest({ documentId: DOCUMENT_ID }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ message: 'Only editable draft documents can use AI writing.' });
    expect(mocks.assistWriting).not.toHaveBeenCalled();
  });
});
