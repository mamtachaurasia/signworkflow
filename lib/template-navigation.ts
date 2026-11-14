export type TemplateNavigationOrigin = 'dashboard' | 'templates';
export type TemplateNavigationView = 'my' | 'system' | 'all';
export type TemplateNavigationWorkspace = 'content' | 'fields' | 'review' | 'settings';

export interface TemplateNavigationContext {
  origin: TemplateNavigationOrigin;
  view: TemplateNavigationView;
  returnTo: string;
}

export interface SearchParamsReader {
  get(name: string): string | null;
  toString(): string;
}

export type RouteSearchParams = Record<string, string | string[] | undefined>;

export const TEMPLATE_NAVIGATION_QUERY_KEYS = {
  origin: 'templateOrigin',
  view: 'templateView',
  returnTo: 'templateReturnTo',
} as const;

const INTERNAL_BASE_URL = 'https://signworkflow.local';

const isTemplateNavigationOrigin = (value: unknown): value is TemplateNavigationOrigin =>
  value === 'dashboard' || value === 'templates';

const isTemplateNavigationView = (value: unknown): value is TemplateNavigationView =>
  value === 'my' || value === 'system' || value === 'all';

const defaultTemplateReturnHref = (
  origin: TemplateNavigationOrigin,
  view: TemplateNavigationView
): string => `${origin === 'dashboard' ? '/dashboard' : '/templates'}?view=${view}`;

const readSearchParams = (searchParams?: SearchParamsReader | null): URLSearchParams =>
  new URLSearchParams(searchParams?.toString() || '');

export function createSearchParamsFromRecord(values?: RouteSearchParams | null): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(values || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value === 'string') {
      params.set(key, value);
    }
  });
  return params;
}

/**
 * Accept an application-relative URL while rejecting absolute, protocol-relative,
 * backslash-based, and control-character destinations.
 */
export function getSafeInternalHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return null;
  }

  try {
    const parsed = new URL(candidate, INTERNAL_BASE_URL);
    if (parsed.origin !== INTERNAL_BASE_URL || parsed.username || parsed.password) return null;
    const decodedPathname = decodeURIComponent(parsed.pathname);
    if (
      decodedPathname.startsWith('//') ||
      decodedPathname.includes('\\') ||
      /[\u0000-\u001F\u007F]/.test(decodedPathname)
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function getSafeTemplateReturnHref(
  value: unknown,
  fallback: Pick<TemplateNavigationContext, 'origin' | 'view'> = {
    origin: 'templates',
    view: 'my',
  }
): string {
  const safeHref = getSafeInternalHref(value);
  if (safeHref) {
    const parsed = new URL(safeHref, INTERNAL_BASE_URL);
    const expectedPath = fallback.origin === 'dashboard' ? '/dashboard' : '/templates';
    if (parsed.pathname === expectedPath) return safeHref;
  }

  return defaultTemplateReturnHref(fallback.origin, fallback.view);
}

/** Build navigation context at the My/System Templates surface before entering Builder. */
export function createTemplateNavigationContext(
  pathname: string,
  searchParams?: SearchParamsReader | null,
  viewOverride?: TemplateNavigationView
): TemplateNavigationContext {
  const params = readSearchParams(searchParams);
  const origin: TemplateNavigationOrigin = pathname === '/dashboard' ? 'dashboard' : 'templates';
  const queryView = params.get('view');
  const view = isTemplateNavigationView(viewOverride)
    ? viewOverride
    : isTemplateNavigationView(queryView)
      ? queryView
      : pathname === '/templates'
        ? 'system'
        : 'my';

  // One-shot actions and previously serialized context must not replay or nest.
  params.delete('use');
  params.delete('customize');
  params.delete(TEMPLATE_NAVIGATION_QUERY_KEYS.origin);
  params.delete(TEMPLATE_NAVIGATION_QUERY_KEYS.view);
  params.delete(TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo);
  params.set('view', view);

  const sourcePath = origin === 'dashboard' ? '/dashboard' : '/templates';
  const returnTo = getSafeTemplateReturnHref(
    `${sourcePath}${params.size ? `?${params.toString()}` : ''}`,
    { origin, view }
  );

  return { origin, view, returnTo };
}

/** Parse context only when a Builder URL explicitly carries it. */
export function parseTemplateNavigationContext(
  searchParams?: SearchParamsReader | null
): TemplateNavigationContext | null {
  if (!searchParams) return null;

  const rawOrigin = searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.origin);
  const rawView = searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.view);
  const rawReturnTo = searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo);
  if (rawOrigin === null && rawView === null && rawReturnTo === null) return null;

  const safeReturnTo = getSafeInternalHref(rawReturnTo);
  const returnPath = safeReturnTo
    ? new URL(safeReturnTo, INTERNAL_BASE_URL).pathname
    : null;
  const inferredOrigin: TemplateNavigationOrigin = returnPath === '/dashboard'
    ? 'dashboard'
    : 'templates';
  const origin = isTemplateNavigationOrigin(rawOrigin) ? rawOrigin : inferredOrigin;
  const view = isTemplateNavigationView(rawView) ? rawView : 'my';

  return {
    origin,
    view,
    returnTo: getSafeTemplateReturnHref(rawReturnTo, { origin, view }),
  };
}

export function resolveTemplateNavigationContext(
  searchParams: SearchParamsReader | null | undefined,
  fallback: Partial<TemplateNavigationContext> = {}
): TemplateNavigationContext {
  const parsed = parseTemplateNavigationContext(searchParams);
  if (parsed) return parsed;

  const origin = isTemplateNavigationOrigin(fallback.origin) ? fallback.origin : 'templates';
  const view = isTemplateNavigationView(fallback.view) ? fallback.view : 'my';
  return {
    origin,
    view,
    returnTo: getSafeTemplateReturnHref(fallback.returnTo, { origin, view }),
  };
}

function applyTemplateNavigationContext(
  params: URLSearchParams,
  context: TemplateNavigationContext
): void {
  const origin = isTemplateNavigationOrigin(context.origin) ? context.origin : 'templates';
  const view = isTemplateNavigationView(context.view) ? context.view : 'my';
  params.set(TEMPLATE_NAVIGATION_QUERY_KEYS.origin, origin);
  params.set(TEMPLATE_NAVIGATION_QUERY_KEYS.view, view);
  params.set(
    TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo,
    getSafeTemplateReturnHref(context.returnTo, { origin, view })
  );
}

export function appendTemplateNavigationContext(
  href: string,
  context: TemplateNavigationContext
): string {
  const safeHref = getSafeInternalHref(href);
  if (!safeHref) return getSafeTemplateReturnHref(context.returnTo, context);

  const parsed = new URL(safeHref, INTERNAL_BASE_URL);
  applyTemplateNavigationContext(parsed.searchParams, context);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildTemplateBuilderHref(
  templateId: string,
  workspace: TemplateNavigationWorkspace,
  context: TemplateNavigationContext
): string {
  const params = new URLSearchParams({ workspace });
  applyTemplateNavigationContext(params, context);
  const builderBase = context.origin === 'dashboard'
    ? '/dashboard/builder/template'
    : '/builder/template';
  return `${builderBase}/${encodeURIComponent(templateId)}?${params.toString()}`;
}

export function buildDocumentBuilderHref(
  documentId: string,
  context: TemplateNavigationContext,
  guestId?: string | null
): string {
  const params = new URLSearchParams();
  if (typeof guestId === 'string' && guestId.startsWith('guest_')) {
    params.set('guestId', guestId);
  }
  applyTemplateNavigationContext(params, context);
  const builderBase = context.origin === 'dashboard'
    ? '/dashboard/builder'
    : '/builder';
  return `${builderBase}/${encodeURIComponent(documentId)}?${params.toString()}`;
}

export function getTemplateReturnHref(context: TemplateNavigationContext): string {
  return getSafeTemplateReturnHref(context.returnTo, context);
}

/**
 * Keep access-denied document Builder exits on the template surface that
 * launched them. Bare/non-template Builder URLs retain the dashboard fallback.
 */
export function getDocumentBuilderAccessDeniedHref(
  searchParams?: SearchParamsReader | null
): string {
  const context = parseTemplateNavigationContext(searchParams);
  return context ? getTemplateReturnHref(context) : '/dashboard';
}

export function buildTemplateLoginHref(nextHref: string): string {
  const safeNextHref = getSafeInternalHref(nextHref);
  return safeNextHref ? `/login?next=${encodeURIComponent(safeNextHref)}` : '/login';
}
