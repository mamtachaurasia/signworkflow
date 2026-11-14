const INTERNAL_ORIGIN = 'https://signworkflow.local';
const DASHBOARD_BUILDER_BASE_PATH = '/dashboard/builder';
const MAX_RETURN_HREF_LENGTH = 8_192;

export const DASHBOARD_BUILDER_REQUEST_PATH_HEADER =
  'x-signworkflow-dashboard-builder-request-path';

const hasUnsafeCharacters = (value: string): boolean =>
  value.includes('\\') || /[\u0000-\u001F\u007F]/.test(value);

export const isDashboardBuilderPathname = (pathname: string): boolean =>
  pathname === DASHBOARD_BUILDER_BASE_PATH ||
  pathname.startsWith(`${DASHBOARD_BUILDER_BASE_PATH}/`);

/**
 * Validate the proxy-forwarded Builder request target before using it in an
 * authentication redirect. Only local dashboard Builder paths are accepted.
 */
export function getSafeDashboardBuilderReturnHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RETURN_HREF_LENGTH) {
    return null;
  }

  if (
    value !== value.trim() ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('#') ||
    hasUnsafeCharacters(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN || parsed.username || parsed.password) return null;
    if (!isDashboardBuilderPathname(parsed.pathname)) return null;

    // Reject encoded path tricks as well as their raw equivalents. Repeating a
    // few times catches double-encoded separators without altering valid query data.
    let decodedPathname = parsed.pathname;
    for (let index = 0; index < 3; index += 1) {
      const decoded = decodeURIComponent(decodedPathname);
      if (decoded === decodedPathname) break;
      decodedPathname = decoded;
    }

    if (
      !isDashboardBuilderPathname(decodedPathname) ||
      hasUnsafeCharacters(decodedPathname) ||
      decodedPathname.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function buildDashboardBuilderLoginHref(value: unknown): string {
  const safeNextHref = getSafeDashboardBuilderReturnHref(value);
  return safeNextHref ? `/login?next=${encodeURIComponent(safeNextHref)}` : '/login';
}
