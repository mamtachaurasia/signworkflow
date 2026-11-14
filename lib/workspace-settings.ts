export {
  DEFAULT_ORGANIZATION_SETTINGS as DEFAULT_WORKSPACE_SETTINGS,
  buildEffectiveUserSettings,
  normalizeOrganizationSettings as normalizeWorkspaceSettings,
  organizationSettingsToUserSettingsInput as workspaceSettingsToUserSettingsInput,
  resolveEffectiveBrandName,
} from '@/lib/org-settings';

export type {
  OrganizationBrandingSettings as WorkspaceBrandingSettings,
  OrganizationDefaultRetentionSettings as WorkspaceDefaultRetentionSettings,
  OrganizationDocumentDefaults as WorkspaceDocumentDefaults,
  OrganizationNotificationRules as WorkspaceNotificationRules,
  OrganizationSettings as WorkspaceSettings,
} from '@/lib/org-settings';
