'use client';

import { FileSignature } from 'lucide-react';

import { SaveButton } from '@ui';
import {
  EXPIRATION_OPTIONS,
  REMINDER_INTERVAL_OPTIONS,
  SettingCard,
  ToggleRow,
} from '@/components/account/settings/shared';
import { useSettingsForm } from '@/components/account/settings/useSettingsForm';
import { Select } from '@ui';

export default function SigningDefaultsPage() {
  const { form, onSubmit, loading } = useSettingsForm([
    'defaultSigningMode',
    'defaultExpirationDays',
    'autoReminders',
    'reminderIntervalDays',
  ]);

  const {
    register,
    watch,
    formState: { isSubmitting, isDirty },
  } = form;

  const autoReminders = watch('autoReminders');

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
          <h1 className="text-2xl font-semibold">Signing defaults</h1>
          <p className="mt-2 text-sm text-slate-600">
            Keep every new envelope consistent without extra clicks.
          </p>
        </div>
        <SaveButton saving={isSubmitting} disabled={!isDirty} onClick={onSubmit} />
      </header>

      <form onSubmit={onSubmit} className="space-y-5">
        <SettingCard
          title="Workflow defaults"
          description="Set the signing flow and timing for new requests."
          icon={<FileSignature className="h-5 w-5" />}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Signing mode
              </span>
              <Select
                {...register('defaultSigningMode')}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="parallel">Parallel (everyone at once)</option>
                <option value="sequential">Sequential (in order)</option>
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Expiration window
              </span>
              <Select
                {...register('defaultExpirationDays', { valueAsNumber: true })}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                {EXPIRATION_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <ToggleRow
            label="Automatic reminders"
            description="Send reminders to recipients who have not signed yet."
            statusLabel={autoReminders ? 'On' : 'Off'}
            input={register('autoReminders')}
          />

          <label className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-800">Reminder cadence</div>
              <div className="text-xs text-slate-500">Frequency for pending recipients.</div>
            </div>
            <Select
              {...register('reminderIntervalDays', { valueAsNumber: true })}
              disabled={!autoReminders}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {REMINDER_INTERVAL_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  Every {days} day{days > 1 ? 's' : ''}
                </option>
              ))}
            </Select>
          </label>
        </SettingCard>
      </form>
    </main>
  );
}
