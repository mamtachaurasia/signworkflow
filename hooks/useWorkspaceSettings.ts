'use client';

import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import type { WorkspaceSettings } from '@/lib/workspace-settings';

export type WorkspaceSettingsPayload = {
  workspaceId: string | null;
  workspaceName: string;
  brandName: string;
  workspaceRole: string | null;
  settings: WorkspaceSettings;
  loading: boolean;
  refresh: () => Promise<unknown>;
};

export function useWorkspaceSettings(options?: { enabled?: boolean; orgId?: string | null }): WorkspaceSettingsPayload {
  const result = useOrganizationSettings(options);
  return {
    workspaceId: result.organizationId,
    workspaceName: result.organizationName,
    brandName: result.brandName,
    workspaceRole: result.orgRole,
    settings: result.settings,
    loading: result.loading,
    refresh: result.refresh,
  };
}
