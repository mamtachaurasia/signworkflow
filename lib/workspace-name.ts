export function resolveWorkspaceName(user: { name?: string | null; email?: string | null }): string {
  const name = (user.name || '').trim();
  if (name) return `${name} Workspace`;

  const email = (user.email || '').trim();
  if (email) return `${email.split('@')[0]} Workspace`;

  return 'My Workspace';
}
