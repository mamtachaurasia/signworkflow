import { describe, expect, it } from 'vitest';

import {
  buildDashboardBuilderLoginHref,
  getSafeDashboardBuilderReturnHref,
} from '@/lib/dashboard-builder-auth';

describe('dashboard Builder authentication continuation', () => {
  const exactBuilderHref =
    '/dashboard/builder/template/507f1f77bcf86cd799439011' +
    '?workspace=fields&templateOrigin=dashboard&templateView=my' +
    '&templateReturnTo=%2Fdashboard%3Fview%3Dmy%26search%3DNDA';

  it('preserves the exact dashboard Builder path and query', () => {
    expect(getSafeDashboardBuilderReturnHref(exactBuilderHref)).toBe(exactBuilderHref);
    expect(buildDashboardBuilderLoginHref(exactBuilderHref)).toBe(
      `/login?next=${encodeURIComponent(exactBuilderHref)}`
    );
  });

  it.each([
    'https://evil.example/dashboard/builder/document-id',
    '//evil.example/dashboard/builder/document-id',
    '/dashboard',
    '/dashboard/builderish/document-id',
    '/dashboard/builder/../account',
    '/dashboard/builder/%2e%2e/account',
    '/dashboard/builder/document-id\\evil',
    '/dashboard/builder/document-id%5Cevil',
    '/dashboard/builder/document-id\nlocation:https://evil.example',
    '/dashboard/builder/document-id%0Alocation:https://evil.example',
  ])('rejects unsafe continuation target %s', (unsafeHref) => {
    expect(getSafeDashboardBuilderReturnHref(unsafeHref)).toBeNull();
    expect(buildDashboardBuilderLoginHref(unsafeHref)).toBe('/login');
  });
});
