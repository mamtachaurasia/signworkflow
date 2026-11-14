'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

import { DEFAULT_USER_SETTINGS, normalizeUserSettings, type UserSettings } from '@/lib/user-settings';
import { useUserSettings } from '@/hooks/useUserSettings';
import useContextStore from '@/hooks/useContextStore';
import { getCookieValue } from '@/utils/cookies';

type SettingsKey = keyof UserSettings;

const pickFields = (data: UserSettings, fields: SettingsKey[]) => {
  const picked = {} as Record<SettingsKey, UserSettings[SettingsKey]>;
  fields.forEach((key) => {
    picked[key] = data[key];
  });
  return picked as Partial<UserSettings>;
};

export function useSettingsForm(fields: SettingsKey[]) {
  const { user } = useContextStore();
  const form = useForm<UserSettings>({
    defaultValues: DEFAULT_USER_SETTINGS,
    mode: 'onChange',
  });
  const { settings, loading, refresh } = useUserSettings({
    enabled: Boolean(user?.id),
    accountKey: user?.id ?? null,
  });
  const isLoading = !user?.id || loading;

  useEffect(() => {
    if (!isLoading) {
      form.reset(settings);
    }
  }, [form, isLoading, settings]);

  const onSubmit = form.handleSubmit(async (data) => {
    const payload = pickFields(data, fields);

    try {
      const csrfToken = getCookieValue('csrf_token');
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(result?.message || 'Unable to save settings');
        return;
      }

      const merged = normalizeUserSettings(result?.settings ?? { ...settings, ...payload });
      form.reset(merged);
      await refresh();
      toast.success('Settings saved');
    } catch (err) {
      console.error(err);
      toast.error('Unable to save settings');
    }
  });

  return {
    form,
    onSubmit,
    loading: isLoading,
  };
}
