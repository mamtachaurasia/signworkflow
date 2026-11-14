import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, requireSessionMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  requireSessionMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('@/lib/requireRefreshSession', () => ({
  requireRefreshSessionOrRedirect: requireSessionMock,
}));

import DashboardLayout from '@/app/dashboard/layout';
import { DASHBOARD_BUILDER_REQUEST_PATH_HEADER } from '@/lib/dashboard-builder-auth';

describe('dashboard authentication layout', () => {
  beforeEach(() => {
    headersMock.mockReset();
    requireSessionMock.mockReset();
    requireSessionMock.mockResolvedValue('user-id');
  });

  it('passes the exact proxy-forwarded Builder target to the session guard', async () => {
    const builderHref =
      '/dashboard/builder/template/507f1f77bcf86cd799439011' +
      '?workspace=review&templateReturnTo=%2Fdashboard%3Fview%3Dmy';
    headersMock.mockResolvedValue(
      new Headers({ [DASHBOARD_BUILDER_REQUEST_PATH_HEADER]: builderHref })
    );

    await DashboardLayout({ children: <div>Builder</div> });

    expect(requireSessionMock).toHaveBeenCalledWith(builderHref);
  });

  it('does not pass an untrusted forwarded target to the session guard', async () => {
    headersMock.mockResolvedValue(
      new Headers({ [DASHBOARD_BUILDER_REQUEST_PATH_HEADER]: '//evil.example' })
    );

    await DashboardLayout({ children: <div>Dashboard</div> });

    expect(requireSessionMock).toHaveBeenCalledWith(null);
  });
});
