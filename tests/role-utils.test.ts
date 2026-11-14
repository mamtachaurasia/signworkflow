import { describe, expect, it } from 'vitest';

import { isAdminRole, isAuditorRole, isOwnerRole } from '@/lib/role-utils';

describe('role-utils', () => {
  it('treats admin and owner as admin roles', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('owner')).toBe(true);
    expect(isAdminRole('user')).toBe(false);
    expect(isAdminRole('auditor')).toBe(false);
  });

  it('normalizes role casing', () => {
    expect(isAdminRole(' ADMIN ')).toBe(true);
    expect(isOwnerRole('Owner')).toBe(true);
    expect(isAuditorRole('AUDITOR')).toBe(true);
  });
});
