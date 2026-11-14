import { describe, expect, it } from 'vitest';

import {
  AUTH_GOOGLE_USER_SELECT,
  AUTH_LOGIN_USER_SELECT,
  AUTH_RESTORE_GOOGLE_USER_SELECT,
  AUTH_RESTORE_USER_SELECT,
} from '@/lib/auth-user-select';

describe('auth user select projections', () => {
  it('includes required fields for credential login and restore flows', () => {
    expect(AUTH_LOGIN_USER_SELECT).toContain('email');
    expect(AUTH_LOGIN_USER_SELECT).toContain('primaryOrgId');
    expect(AUTH_LOGIN_USER_SELECT).toContain('tokenVersion');
    expect(AUTH_LOGIN_USER_SELECT).toContain('mfaEnabled');
    expect(AUTH_LOGIN_USER_SELECT).toContain('+passwordHash');
    expect(AUTH_LOGIN_USER_SELECT).toContain('+password');
    expect(AUTH_LOGIN_USER_SELECT).toContain('+mfaSecret');
    expect(AUTH_RESTORE_USER_SELECT).toContain('email');
    expect(AUTH_RESTORE_USER_SELECT).toContain('primaryOrgId');
    expect(AUTH_RESTORE_USER_SELECT).toContain('+passwordHash');
    expect(AUTH_RESTORE_USER_SELECT).toContain('+mfaSecret');
  });

  it('includes required fields for Google auth and restore flows', () => {
    expect(AUTH_GOOGLE_USER_SELECT).toContain('email');
    expect(AUTH_GOOGLE_USER_SELECT).toContain('primaryOrgId');
    expect(AUTH_GOOGLE_USER_SELECT).toContain('tokenVersion');
    expect(AUTH_GOOGLE_USER_SELECT).toContain('mfaEnabled');
    expect(AUTH_GOOGLE_USER_SELECT).toContain('+mfaSecret');
    expect(AUTH_RESTORE_GOOGLE_USER_SELECT).toBe(AUTH_GOOGLE_USER_SELECT);
  });
});
