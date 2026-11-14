import OrganizationModel from '@/models/Organization';
import UserModel from '@/models/Users';
import {
  buildEffectiveUserSettings,
  normalizeOrganizationSettings,
  resolveEffectiveBrandName,
  type OrganizationSettings,
} from '@/lib/org-settings';
import type { UserSettings } from '@/lib/user-settings';

type OrganizationSettingsRecord = {
  organizationId: string;
  organizationName: string;
  settings: OrganizationSettings;
  brandName: string;
};

export async function getOrganizationSettingsByOrgId(orgId: string): Promise<OrganizationSettingsRecord | null> {
  const organization = await OrganizationModel.findById(orgId)
    .select('name settings')
    .lean<{ _id: unknown; name?: string; settings?: unknown } | null>();

  if (!organization) {
    return null;
  }

  const settings = normalizeOrganizationSettings(organization.settings);
  return {
    organizationId: String(organization._id),
    organizationName: organization.name?.trim() || 'Workspace',
    brandName: resolveEffectiveBrandName(organization.name, settings),
    settings,
  };
}

export async function getEffectiveUserSettingsByUserId(
  userId: string,
  orgId?: string | null
): Promise<UserSettings> {
  const [user, orgSettingsRecord] = await Promise.all([
    UserModel.findById(userId).select('settings').lean<{ settings?: unknown } | null>(),
    orgId ? getOrganizationSettingsByOrgId(orgId) : Promise.resolve(null),
  ]);

  return buildEffectiveUserSettings({
    userSettings: user?.settings,
    organizationSettings: orgSettingsRecord?.settings,
  });
}
