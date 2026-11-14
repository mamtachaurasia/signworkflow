import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-context', () => ({
  getAuthContext: vi.fn(),
}));

vi.mock('@/models/Contact', () => ({
  default: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndDelete: vi.fn(),
    findOneAndUpdate: vi.fn(),
    insertMany: vi.fn(),
  },
}));

vi.mock('@/utils/csvParser', () => ({
  parseCSVToContacts: vi.fn(),
}));

vi.mock('@/lib/subscription-server', () => ({
  getExpiredTrialWriteGuard: vi.fn(async () => ({ allowed: true })),
}));

import { POST as bulkImportContactsRoute } from '@/app/api/contacts/bulk-import/route';
import { DELETE as bulkDeleteContactsRoute } from '@/app/api/contacts/bulk-delete/route';
import { PUT as putContactRoute } from '@/app/api/contacts/[id]/route';
import { GET as getContactsRoute, POST as postContactsRoute } from '@/app/api/contacts/route';
import { getAuthContext } from '@/lib/auth-context';
import Contact from '@/models/Contact';
import { parseCSVToContacts } from '@/utils/csvParser';

type QueryMock = {
  lean: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  sort: ReturnType<typeof vi.fn>;
};

type MockedContactModel = {
  create: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  findOneAndDelete: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  insertMany: ReturnType<typeof vi.fn>;
};

const getAuthContextMock = vi.mocked(getAuthContext);
const parseCSVToContactsMock = vi.mocked(parseCSVToContacts);
const contactModelMock = Contact as unknown as MockedContactModel;

function createQueryMock(value: unknown): QueryMock {
  const query: QueryMock = {
    lean: vi.fn().mockResolvedValue(value),
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  };

  return query;
}

describe('contacts routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated contact list requests', async () => {
    getAuthContextMock.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/contacts');
    const res = await getContactsRoute(req);
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(401);
    expect(payload.message).toBe('Unauthorized');
    expect(contactModelMock.find).not.toHaveBeenCalled();
  });

  it('rejects creating duplicate contacts for the same user', async () => {
    getAuthContextMock.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'user' });
    contactModelMock.findOne.mockReturnValue(createQueryMock({ _id: 'contact-1' }));

    const req = new NextRequest('http://localhost/api/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN@example.com',
      }),
    });

    const res = await postContactsRoute(req);
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(409);
    expect(payload.message).toBe('Contact with this email already exists');
    expect(contactModelMock.create).not.toHaveBeenCalled();
  });

  it('rejects invalid contact ids before updating', async () => {
    getAuthContextMock.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'user' });

    const req = new NextRequest('http://localhost/api/contacts/not-an-id', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      }),
    });

    const res = await putContactRoute(req, {
      params: Promise.resolve({ id: 'not-an-id' }),
    });
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(400);
    expect(payload.message).toBe('Invalid contact ID');
    expect(contactModelMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects non-csv files during bulk import', async () => {
    getAuthContextMock.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'user' });

    const formData = new FormData();
    formData.set('file', new File(['hello'], 'contacts.txt', { type: 'text/plain' }));

    const req = new NextRequest('http://localhost/api/contacts/bulk-import', {
      method: 'POST',
      body: formData,
    });

    const res = await bulkImportContactsRoute(req);
    const payload = (await res.json()) as { message?: string };

    expect(res.status).toBe(400);
    expect(payload.message).toBe('Please upload a CSV file');
    expect(parseCSVToContactsMock).not.toHaveBeenCalled();
  });

  it('imports only new normalized contacts during bulk import', async () => {
    getAuthContextMock.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'user' });
    parseCSVToContactsMock.mockReturnValue([
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN@example.com',
      },
      {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
      {
        firstName: 'Jane Duplicate',
        lastName: 'Doe',
        email: 'JANE@example.com',
      },
      {
        firstName: 'Invalid',
        lastName: 'Email',
        email: 'not-an-email',
      },
    ]);
    contactModelMock.find.mockReturnValue(createQueryMock([{ email: 'john@example.com' }]));
    contactModelMock.insertMany.mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set('file', new File(['firstName,lastName,email'], 'contacts.csv', { type: 'text/csv' }));

    const req = new NextRequest('http://localhost/api/contacts/bulk-import', {
      method: 'POST',
      body: formData,
    });

    const res = await bulkImportContactsRoute(req);
    const payload = (await res.json()) as {
      importedCount?: number;
      message?: string;
      skippedCount?: number;
    };

    expect(res.status).toBe(200);
    expect(payload.importedCount).toBe(1);
    expect(payload.skippedCount).toBe(3);
    expect(payload.message).toBe('Imported 1 contact(s); skipped 3 duplicate or invalid row(s).');
    expect(contactModelMock.insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          userId: 'user-1',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
        }),
      ],
      { ordered: false }
    );
  });

  it('rejects invalid ids during bulk delete', async () => {
    getAuthContextMock.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', orgRole: 'user' });

    const req = new NextRequest('http://localhost/api/contacts/bulk-delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contactIds: ['not-an-id'],
      }),
    });

    const res = await bulkDeleteContactsRoute(req);
    const payload = (await res.json()) as { errors?: string[]; message?: string };

    expect(res.status).toBe(400);
    expect(payload.message).toBe('Validation failed');
    expect(payload.errors).toContain('Invalid contact ID: not-an-id');
    expect(contactModelMock.deleteMany).not.toHaveBeenCalled();
  });
});
