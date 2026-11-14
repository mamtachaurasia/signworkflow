'use client';

import { Bell } from 'lucide-react';

import { SaveButton } from '@ui';
import { DIGEST_OPTIONS, SettingCard, ToggleRow } from '@/components/account/settings/shared';
import { useSettingsForm } from '@/components/account/settings/useSettingsForm';
import { Select } from '@ui';

export default function NotificationSettingsPage() {
  const { form, onSubmit, loading } = useSettingsForm([
    'notifyOnViewed',
    'notifyOnSigned',
    'notifyOnCompleted',
    'notifyOnDeclined',
    'emailDigest',
  ]);

  const {
    register,
    watch,
    formState: { isSubmitting, isDirty },
  } = form;

  if (loading) {
    return (
      <main className="mx-auto px-6 py-10">
        <p className="text-slate-600">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notification settings</h1>
          <p className="mt-2 text-sm text-slate-600">
            Control event alerts and summary cadence for signing activity.
          </p>
        </div>
        <SaveButton saving={isSubmitting} disabled={!isDirty} onClick={onSubmit} />
      </header>

      <form onSubmit={onSubmit} className="space-y-5">
        <SettingCard
          title="Alerts"
          description="Get notified for key recipient actions."
          icon={<Bell className="h-5 w-5" />}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <ToggleRow
              label="Viewed alerts"
              description="Notify me when a recipient views a document."
              statusLabel={watch('notifyOnViewed') ? 'On' : 'Off'}
              input={register('notifyOnViewed')}
            />
            <ToggleRow
              label="Signed alerts"
              description="Notify me when a recipient signs."
              statusLabel={watch('notifyOnSigned') ? 'On' : 'Off'}
              input={register('notifyOnSigned')}
            />
            <ToggleRow
              label="Completed alerts"
              description="Notify me when all signatures are complete."
              statusLabel={watch('notifyOnCompleted') ? 'On' : 'Off'}
              input={register('notifyOnCompleted')}
            />
            <ToggleRow
              label="Declined alerts"
              description="Notify me when a recipient declines."
              statusLabel={watch('notifyOnDeclined') ? 'On' : 'Off'}
              input={register('notifyOnDeclined')}
            />
          </div>

          <label className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-800">Email digest</div>
              <div className="text-xs text-slate-500">Summaries for high-volume activity.</div>
            </div>
            <Select
              {...register('emailDigest')}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {DIGEST_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </SettingCard>
      </form>
    </main>
  );
}
