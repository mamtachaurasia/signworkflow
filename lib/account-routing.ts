import type { AccountSection } from '@/config/account.config';

export const DASHBOARD_ACCOUNT_BASE = '/dashboard/account';
export const NO_WORKSPACE_ACCOUNT_SECTION = 'workspace-access';
export const NO_WORKSPACE_ALLOWED_ACCOUNT_SECTIONS = new Set<AccountSection>([
  'profile',
  'subscription',
  'settings',
  'signing-defaults',
  'notifications',
  'payment-services',
  'integrations',
  'cloud-storages',
  'workspace',
  'workspace-access',
]);

export const NO_ORG_ACCOUNT_SECTION = NO_WORKSPACE_ACCOUNT_SECTION;
export const NO_ORG_ALLOWED_ACCOUNT_SECTIONS = NO_WORKSPACE_ALLOWED_ACCOUNT_SECTIONS;

export const ACCOUNT_SECTION_SLUGS: Record<AccountSection, string> = {
  profile: 'profile',
  subscription: 'subscription',
  settings: 'settings',
  'signing-defaults': 'signing-defaults',
  'payment-services': 'payment-services',
  notifications: 'notifications',
  integrations: 'integrations',
  'cloud-storages': 'cloud-storages',
  'my-teams': 'my-teams',
  workspace: 'workspace',
  'workspace-access': 'workspace-access',
  'audit-trail': 'audit-trail',
  'admin-governance': 'admin-governance',
};

const ACCOUNT_SECTION_ALIASES: Record<AccountSection, string[]> = {
  profile: ['profile'],
  subscription: ['subscription'],
  settings: ['settings'],
  'signing-defaults': ['signing-defaults', 'signingDefaults'],
  'payment-services': ['payment-services', 'paymentServices'],
  notifications: ['notifications', 'notificationSettings'],
  integrations: ['integrations'],
  'cloud-storages': ['cloud-storages', 'cloudStorage'],
  'my-teams': ['my-teams', 'myTeams'],
  workspace: ['workspace', 'organization', 'myWorkspaces', 'my-workspaces', 'myOrganizations', 'my-organizations'],
  'workspace-access': ['workspace-access', 'workspaceAccess', 'organization-access', 'organizationAccess'],
  'audit-trail': ['audit-trail', 'auditTrail'],
  'admin-governance': ['admin-governance', 'adminGovernance'],
};

const ACCOUNT_PATH_TO_SECTION = new Map<string, AccountSection>();

Object.entries(ACCOUNT_SECTION_ALIASES).forEach(([section, aliases]) => {
  aliases.forEach((alias) => {
    ACCOUNT_PATH_TO_SECTION.set(alias.toLowerCase(), section as AccountSection);
  });
  ACCOUNT_PATH_TO_SECTION.set(section.toLowerCase(), section as AccountSection);
});

export const getAccountSectionFromSegment = (
  segment?: string | null
): AccountSection | null => {
  if (!segment) return null;
  const normalized = segment.replace(/^\/+|\/+$/g, '').toLowerCase();
  return ACCOUNT_PATH_TO_SECTION.get(normalized) ?? null;
};

export const getDashboardAccountPath = (
  section: AccountSection,
  extraPath?: string
) => {
  const base = `${DASHBOARD_ACCOUNT_BASE}/${ACCOUNT_SECTION_SLUGS[section]}`;
  if (!extraPath) return base;
  const trimmed = extraPath.replace(/^\/+/, '');
  return `${base}/${trimmed}`;
};

export function canAccessAccountSectionWithoutOrg(section: AccountSection): boolean {
  return NO_WORKSPACE_ALLOWED_ACCOUNT_SECTIONS.has(section);
}

export function getPostAuthRedirectPath(): string {
  return '/dashboard';
}

export function isSupportSsoHandoffPath(value: string): boolean {
  const pathname = value.split('?')[0].toLowerCase();
  return pathname === '/api/support/sso' || pathname === '/api/support/sso/complete';
}

export function navigateToPostAuthPath(
  path: string,
  replace: (path: string) => void,
  assign: (path: string) => void = (destination) => window.location.assign(destination)
): void {
  if (isSupportSsoHandoffPath(path)) {
    assign(path);
    return;
  }

  replace(path);
}

export function getSafePostAuthRedirectPath(value?: string | null): string {
  const fallback = getPostAuthRedirectPath();
  const candidate = typeof value === 'string' ? value.trim() : '';

  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return fallback;
  }

  const pathname = candidate.split('?')[0].toLowerCase();
  if (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/reset-password' ||
    (pathname.startsWith('/api/') && !isSupportSsoHandoffPath(candidate))
  ) {
    return fallback;
  }

  return candidate;
}
