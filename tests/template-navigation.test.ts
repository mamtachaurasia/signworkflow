import { describe, expect, it } from 'vitest';

import {
  appendTemplateNavigationContext,
  buildDocumentBuilderHref,
  buildTemplateBuilderHref,
  buildTemplateLoginHref,
  createTemplateNavigationContext,
  getDocumentBuilderAccessDeniedHref,
  getSafeTemplateReturnHref,
  getTemplateReturnHref,
  parseTemplateNavigationContext,
  resolveTemplateNavigationContext,
  TEMPLATE_NAVIGATION_QUERY_KEYS,
} from '@/lib/template-navigation';

describe('template navigation context', () => {
  it('captures the dashboard template view and its filters', () => {
    const context = createTemplateNavigationContext(
      '/dashboard',
      new URLSearchParams('view=system&category=Legal&search=nda')
    );

    expect(context).toEqual({
      origin: 'dashboard',
      view: 'system',
      returnTo: '/dashboard?view=system&category=Legal&search=nda',
    });
  });

  it('removes one-shot actions and nested context from a templates return URL', () => {
    const context = createTemplateNavigationContext(
      '/templates',
      new URLSearchParams(
        'view=my&use=507f1f77bcf86cd799439011&customize=507f1f77bcf86cd799439099&templateOrigin=dashboard&templateReturnTo=%2Fdashboard'
      )
    );

    expect(context).toEqual({
      origin: 'templates',
      view: 'my',
      returnTo: '/templates?view=my',
    });
  });

  it('threads context through template and agreement Builder URLs', () => {
    const context = {
      origin: 'dashboard' as const,
      view: 'system' as const,
      returnTo: '/dashboard?view=system&category=Legal',
    };
    const templateHref = buildTemplateBuilderHref(
      '507f1f77bcf86cd799439011',
      'review',
      context
    );
    const templateUrl = new URL(templateHref, 'https://signworkflow.local');

    expect(templateUrl.pathname).toBe('/dashboard/builder/template/507f1f77bcf86cd799439011');
    expect(templateUrl.searchParams.get('workspace')).toBe('review');
    expect(templateUrl.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.origin)).toBe('dashboard');
    expect(templateUrl.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.view)).toBe('system');
    expect(templateUrl.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo)).toBe(
      '/dashboard?view=system&category=Legal'
    );

    const agreementHref = appendTemplateNavigationContext(
      '/builder/507f1f77bcf86cd799439012?guestId=guest_safe',
      context
    );
    const agreementUrl = new URL(agreementHref, 'https://signworkflow.local');
    expect(agreementUrl.searchParams.get('guestId')).toBe('guest_safe');
    expect(agreementUrl.searchParams.get(TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo)).toBe(
      '/dashboard?view=system&category=Legal'
    );

    const dashboardAgreementHref = buildDocumentBuilderHref(
      '507f1f77bcf86cd799439012',
      context
    );
    expect(new URL(dashboardAgreementHref, 'https://signworkflow.local').pathname).toBe(
      '/dashboard/builder/507f1f77bcf86cd799439012'
    );
  });

  it('rejects external and protocol-relative return targets', () => {
    const fallback = { origin: 'dashboard' as const, view: 'system' as const };

    expect(getSafeTemplateReturnHref('https://evil.example/phish', fallback)).toBe(
      '/dashboard?view=system'
    );
    expect(getSafeTemplateReturnHref('//evil.example/phish', fallback)).toBe(
      '/dashboard?view=system'
    );
    expect(getSafeTemplateReturnHref('/%2f%2fevil.example/phish', fallback)).toBe(
      '/dashboard?view=system'
    );
    expect(getSafeTemplateReturnHref('/account/profile', fallback)).toBe(
      '/dashboard?view=system'
    );
    expect(getSafeTemplateReturnHref('/templates?view=system', fallback)).toBe(
      '/dashboard?view=system'
    );
    expect(buildTemplateLoginHref('https://evil.example/phish')).toBe('/login');
  });

  it('sanitizes a hostile serialized return target without losing valid origin and view', () => {
    const params = new URLSearchParams({
      [TEMPLATE_NAVIGATION_QUERY_KEYS.origin]: 'dashboard',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.view]: 'system',
      [TEMPLATE_NAVIGATION_QUERY_KEYS.returnTo]: '//evil.example/phish',
    });

    const context = parseTemplateNavigationContext(params);
    expect(context).toEqual({
      origin: 'dashboard',
      view: 'system',
      returnTo: '/dashboard?view=system',
    });
    expect(context && getTemplateReturnHref(context)).toBe('/dashboard?view=system');
  });

  it('keeps legacy Builder URLs compatible through a safe fallback', () => {
    expect(parseTemplateNavigationContext(new URLSearchParams('workspace=review'))).toBeNull();
    expect(
      resolveTemplateNavigationContext(new URLSearchParams('workspace=review'), {
        origin: 'templates',
        view: 'my',
      })
    ).toEqual({
      origin: 'templates',
      view: 'my',
      returnTo: '/templates?view=my',
    });
  });

  it('returns an access-denied agreement Builder to its originating template surface', () => {
    const context = createTemplateNavigationContext(
      '/dashboard',
      new URLSearchParams('view=system&search=employment')
    );
    const builderHref = buildDocumentBuilderHref('document-1', context);
    const query = new URL(builderHref, 'https://signworkflow.local').searchParams;

    expect(getDocumentBuilderAccessDeniedHref(query)).toBe(
      '/dashboard?view=system&search=employment'
    );
    expect(getDocumentBuilderAccessDeniedHref(new URLSearchParams())).toBe('/dashboard');
  });
});
