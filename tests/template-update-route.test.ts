import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type TrialHandler = (
  req: NextRequest,
  context: unknown,
  authContext: { userId: string; orgId: string; orgRole: string }
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  canManageTemplate: vi.fn(),
  connectDB: vi.fn(),
  findById: vi.fn(),
  sanitizeTemplateFields: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/models/Template', () => ({
  __esModule: true,
  default: { findById: mocks.findById },
}));
vi.mock('@/utils/db', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/template-access', () => ({
  canManageTemplate: mocks.canManageTemplate,
  canReadTemplate: vi.fn(),
  normalizeTemplateSharingScope: (value: unknown) => value === 'workspace' ? 'workspace' : 'private',
}));
vi.mock('@/lib/template-persistence', () => ({
  sanitizeTemplateDefaultSigners: vi.fn((value) => value),
  sanitizeTemplateFields: mocks.sanitizeTemplateFields,
  sanitizeTemplateTags: vi.fn((value) => value),
}));
vi.mock('@/lib/trial-access', () => ({
  withTrialWriteAccessFromAuthContext: (handler: TrialHandler) =>
    (req: NextRequest, context: unknown) => handler(req, context, {
      userId: 'user-1',
      orgId: 'org-1',
      orgRole: 'owner',
    }),
}));

import { PUT } from '@/app/api/templates/[templateId]/route';

const TEMPLATE_ID = '507f1f77bcf86cd799439011';

describe('template field update route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue(undefined);
    mocks.canManageTemplate.mockReturnValue(true);
    mocks.sanitizeTemplateFields.mockImplementation((value) => value);
    mocks.save.mockResolvedValue(undefined);
  });

  it('marks saved fields current against the active layout revision', async () => {
    const template = {
      _id: TEMPLATE_ID,
      userId: 'user-1',
      orgId: 'org-1',
      isSystemTemplate: false,
      name: 'NDA',
      category: 'Legal',
      fields: [{ id: 'old-field' }],
      defaultSigners: [],
      fieldLayoutStatus: 'needs_review',
      layoutRevision: 3,
      fieldLayoutRevision: 2,
      save: mocks.save,
    };
    mocks.findById.mockResolvedValue(template);
    const fields = [{ id: 'reviewed-field' }];
    const req = new NextRequest(`https://example.com/api/templates/${TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });

    const response = await PUT(req, { params: Promise.resolve({ templateId: TEMPLATE_ID }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(template).toMatchObject({
      fields,
      fieldLayoutStatus: 'current',
      layoutRevision: 3,
      fieldLayoutRevision: 3,
    });
    expect(payload.template.fieldLayoutStatus).toBe('current');
    expect(payload.template.fieldLayoutRevision).toBe(3);
  });

  it('renames a manageable template and trims the submitted name', async () => {
    const template = {
      _id: TEMPLATE_ID,
      userId: 'user-1',
      orgId: 'org-1',
      isSystemTemplate: false,
      name: 'Old name',
      category: 'Legal',
      fields: [],
      defaultSigners: [],
      save: mocks.save,
    };
    mocks.findById.mockResolvedValue(template);
    const req = new NextRequest(`https://example.com/api/templates/${TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Client onboarding agreement  ' }),
    });

    const response = await PUT(req, { params: Promise.resolve({ templateId: TEMPLATE_ID }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(template.name).toBe('Client onboarding agreement');
    expect(payload.template.name).toBe('Client onboarding agreement');
  });

  it.each([
    ['', 'Template name is required'],
    ['x'.repeat(201), 'Template name must be 200 characters or fewer'],
  ])('rejects an invalid template name', async (name, message) => {
    const template = {
      _id: TEMPLATE_ID,
      userId: 'user-1',
      orgId: 'org-1',
      isSystemTemplate: false,
      name: 'Existing name',
      category: 'Legal',
      fields: [],
      defaultSigners: [],
      save: mocks.save,
    };
    mocks.findById.mockResolvedValue(template);
    const req = new NextRequest(`https://example.com/api/templates/${TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const response = await PUT(req, { params: Promise.resolve({ templateId: TEMPLATE_ID }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ message });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
