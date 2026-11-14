import { describe, expect, it, vi } from 'vitest';

import {
  getPostAuthRedirectPath,
  getSafePostAuthRedirectPath,
  navigateToPostAuthPath,
} from '@/lib/account-routing';

describe('account routing helpers', () => {
  it('sends users with an active org to the main dashboard', () => {
    expect(getPostAuthRedirectPath({ orgId: 'org-1' })).toBe('/dashboard');
  });

  it('sends users without an active org to the organization access page', () => {
    expect(getPostAuthRedirectPath({ orgId: null })).toBe('/dashboard');
  });

  it('allows safe local post-auth redirects', () => {
    expect(getSafePostAuthRedirectPath('/builder/507f1f77bcf86cd799439011')).toBe(
      '/builder/507f1f77bcf86cd799439011'
    );
  });

  it('rejects external and auth-loop post-auth redirects', () => {
    expect(getSafePostAuthRedirectPath('https://evil.example')).toBe('/dashboard');
    expect(getSafePostAuthRedirectPath('//evil.example')).toBe('/dashboard');
    expect(getSafePostAuthRedirectPath('/login?next=/builder/1')).toBe('/dashboard');
    expect(getSafePostAuthRedirectPath('/api/documents/list')).toBe('/dashboard');
  });

  it('allows only the explicit support SSO callback paths', () => {
    expect(getSafePostAuthRedirectPath('/api/support/sso/complete')).toBe('/api/support/sso/complete');
    expect(getSafePostAuthRedirectPath('/api/support/sso')).toBe('/api/support/sso');
    expect(getSafePostAuthRedirectPath('/api/support/sso/evil')).toBe('/dashboard');
  });

  it.each([
    '/api/support/sso',
    '/api/support/sso/complete',
    '/api/support/sso/complete?returnTo=%2Fcreate',
  ])('uses full-document navigation for the support SSO handoff %s', (path) => {
    const replace = vi.fn();
    const assign = vi.fn();

    navigateToPostAuthPath(path, replace, assign);

    expect(assign).toHaveBeenCalledWith(path);
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps client-side navigation for ordinary post-auth destinations', () => {
    const replace = vi.fn();
    const assign = vi.fn();

    navigateToPostAuthPath('/dashboard', replace, assign);

    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(assign).not.toHaveBeenCalled();
  });
});
