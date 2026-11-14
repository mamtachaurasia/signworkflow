import UserModel from '@/models/Users';
import { normalizeUserSettings, type UserSettings } from '@/lib/user-settings';

export async function getUserSettingsByUserId(userId: string): Promise<UserSettings> {
  const user = await UserModel.findById(userId).select('settings').lean<{ settings?: unknown } | null>();
  return normalizeUserSettings(user?.settings);
}
