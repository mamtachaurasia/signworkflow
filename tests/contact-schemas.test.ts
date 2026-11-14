import { describe, expect, it } from 'vitest';

import {
  BulkDeleteContactsBodySchema,
  buildCaseInsensitiveEmailFilter,
  dedupeContactsByEmail,
  normalizeImportedContacts,
} from '@/lib/contact-schemas';

describe('contact schema helpers', () => {
  it('normalizes imported contacts and drops invalid rows', () => {
    const result = normalizeImportedContacts([
      {
        firstName: ' John ',
        lastName: ' Doe ',
        email: ' JOHN.DOE@example.com ',
        phone: '   ',
        address: {
          city: ' Boston ',
          state: ' MA ',
          streetAddress: '   ',
        },
      },
      {
        firstName: 'Invalid',
        lastName: 'Email',
        email: 'not-an-email',
      },
    ]);

    expect(result.invalidCount).toBe(1);
    expect(result.contacts).toEqual([
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        address: {
          city: 'Boston',
          state: 'MA',
        },
      },
    ]);
  });

  it('deduplicates contacts by email case-insensitively', () => {
    const result = dedupeContactsByEmail([
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      },
      {
        firstName: 'Johnny',
        lastName: 'Doe',
        email: 'JOHN@example.com',
      },
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.contacts).toEqual([
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      },
    ]);
  });

  it('builds case-insensitive exact email filters', () => {
    const filter = buildCaseInsensitiveEmailFilter('john+alerts@example.com');

    expect(filter.test('JOHN+ALERTS@example.com')).toBe(true);
    expect(filter.test('john@example.com')).toBe(false);
  });

  it('rejects invalid contact ids in bulk delete requests', () => {
    const parsed = BulkDeleteContactsBodySchema.safeParse({
      contactIds: ['507f1f77bcf86cd799439011', 'not-a-valid-id'],
    });

    expect(parsed.success).toBe(false);
  });
});
