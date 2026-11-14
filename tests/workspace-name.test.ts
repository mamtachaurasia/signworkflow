import { describe, expect, it } from 'vitest';

import { resolveWorkspaceName } from '@/lib/workspace-name';

describe('resolveWorkspaceName', () => {
  it('uses the user name when available', () => {
    expect(resolveWorkspaceName({ name: 'Ava Owner', email: 'owner@example.com' })).toBe(
      'Ava Owner Workspace'
    );
  });

  it('falls back to the email local part', () => {
    expect(resolveWorkspaceName({ name: '', email: 'owner@example.com' })).toBe(
      'owner Workspace'
    );
  });

  it('falls back to a generic workspace name', () => {
    expect(resolveWorkspaceName({})).toBe('My Workspace');
  });
});
