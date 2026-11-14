import { describe, expect, it } from 'vitest';

import {
  buildDocumentWriteFilter,
  documentShareAccessMeets,
  getDocumentShareForEmail,
  getDocumentShareForToken,
  issueDocumentShareToken,
  normalizeShareEmail,
} from '@/lib/document-sharing';

describe('document-sharing helpers', () => {
  it('normalizes and validates share emails', () => {
    expect(normalizeShareEmail('  Person@Example.COM ')).toBe('person@example.com');
    expect(normalizeShareEmail('not-an-email')).toBeNull();
  });

  it('treats access levels as an ordered permission set', () => {
    expect(documentShareAccessMeets('can_edit', 'can_view')).toBe(true);
    expect(documentShareAccessMeets('can_send', 'can_send')).toBe(true);
    expect(documentShareAccessMeets('can_view', 'can_send')).toBe(false);
  });

  it('finds only active matching email shares', () => {
    const shares = [
      { email: 'old@example.com', access: 'can_edit', revokedAt: new Date() },
      { email: 'person@example.com', access: 'can_send' },
    ];

    expect(getDocumentShareForEmail(shares, 'PERSON@example.com', 'can_view')?.access).toBe('can_send');
    expect(getDocumentShareForEmail(shares, 'person@example.com', 'can_edit')).toBeNull();
    expect(getDocumentShareForEmail(shares, 'old@example.com', 'can_view')).toBeNull();
  });

  it('finds active shares by secure share token', () => {
    const issued = issueDocumentShareToken();
    const shares = [
      { email: 'person@example.com', access: 'can_view', shareTokenHash: issued.tokenHash },
      { email: 'revoked@example.com', access: 'can_view', shareTokenHash: issued.tokenHash, revokedAt: new Date() },
    ];

    expect(getDocumentShareForToken(shares, issued.token)?.email).toBe('person@example.com');
    expect(getDocumentShareForToken(shares, 'wrong-token')).toBeNull();
  });

  it('builds write filters that include owner and shared-access clauses', () => {
    const filter = buildDocumentWriteFilter({
      userId: 'owner-1',
      orgId: 'org-1',
      userEmail: 'editor@example.com',
      documentId: 'doc-1',
      minimumAccess: 'can_send',
      extra: { currentVersion: 3 },
    });

    expect(filter).toMatchObject({
      _id: 'doc-1',
      currentVersion: 3,
      $or: [
        { userId: 'owner-1', orgId: 'org-1' },
        {
          sharedWith: {
            $elemMatch: {
              email: 'editor@example.com',
              access: { $in: ['can_send', 'can_edit'] },
            },
          },
        },
      ],
    });
  });
});
