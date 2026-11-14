export const ADMIN_ROLES = new Set(['admin', 'owner']);

export function normalizeRole(role?: string | null): string | null {
  if (!role || typeof role !== 'string') return null;
  const normalized = role.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isAdminRole(role?: string | null): boolean {
  const normalized = normalizeRole(role);
  return normalized ? ADMIN_ROLES.has(normalized) : false;
}

export function isOwnerRole(role?: string | null): boolean {
  return normalizeRole(role) === 'owner';
}

export function isAuditorRole(role?: string | null): boolean {
  return normalizeRole(role) === 'auditor';
}
