import { describe, expect, it } from 'vitest';

import { evaluateTemplateReadiness } from '@/lib/template-readiness';

describe('template readiness', () => {
  it('requires at least one reusable role and recipient signing field', () => {
    expect(evaluateTemplateReadiness({ fields: [], roles: [], fieldLayoutStatus: 'current' })).toEqual({
      ready: false,
      missingRoles: true,
      missingFields: true,
      layoutNeedsReview: false,
      unassignedFields: 0,
      orphanedFields: 0,
      rolesMissingFields: 0,
    });
  });

  it('requires signer and approver roles to own at least one field', () => {
    const readiness = evaluateTemplateReadiness({
      fields: [],
      roles: [
        { id: 'employee', role: 'signer' },
        { id: 'legal', role: 'approver' },
        { id: 'records', role: 'viewer' },
      ],
      fieldLayoutStatus: 'current',
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missingRoles).toBe(false);
    expect(readiness.missingFields).toBe(true);
    expect(readiness.rolesMissingFields).toBe(2);
  });

  it('reports unassigned, orphaned, and stale-layout issues together', () => {
    const readiness = evaluateTemplateReadiness({
      fields: [
        { fieldOwner: 'recipients', recipientId: null },
        { fieldOwner: 'recipients', recipientId: 'removed-role' },
        { fieldOwner: 'me', recipientId: null },
      ],
      roles: [{ id: 'signer', role: 'signer' }],
      fieldLayoutStatus: 'needs_review',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRoles: false,
      missingFields: false,
      layoutNeedsReview: true,
      unassignedFields: 1,
      orphanedFields: 1,
      rolesMissingFields: 1,
    });
  });

  it('is ready when recipient fields reference active action roles', () => {
    const readiness = evaluateTemplateReadiness({
      fields: [
        { fieldOwner: 'recipients', recipientId: 'employee' },
        { fieldOwner: 'recipients', recipientId: 'manager' },
      ],
      roles: [
        { id: 'employee', role: 'signer' },
        { id: 'manager', role: 'approver' },
      ],
      fieldLayoutStatus: 'current',
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.missingRoles).toBe(false);
    expect(readiness.missingFields).toBe(false);
  });
});
