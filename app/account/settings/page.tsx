'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Lock, Mail, ShieldCheck, SlidersHorizontal } from 'lucide-react';

import { Button, SaveButton } from '@ui';
import { Input } from '@ui';
import { Textarea } from '@ui';
import ResetPassword from '@/components/ResetPassword';
import { DATE_FORMAT_OPTIONS } from '@/lib/date-formats';
import { getDashboardAccountPath } from '@/lib/account-routing';
import { useSettingsForm } from '@/components/account/settings/useSettingsForm';
import {
  LOCALE_OPTIONS,
  SESSION_TIMEOUT_OPTIONS,
  SettingCard,
  TIME_ZONE_OPTIONS,
  ToggleRow,
} from '@/components/account/settings/shared';
import { Select } from '@ui';
import DeleteAccountReview from './DeleteAccountReview';

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isDeleteReview = pathname.endsWith('/settings/delete');

  const { form, onSubmit, loading } = useSettingsForm([
    'twoFactor',
    'loginAlerts',
    'requireReauthForCritical',
    'sessionTimeoutMinutes',
    'inviteSubject',
    'inviteMessage',
    'timeZone',
    'locale',
    'weekStart',
    'timeFormat',
    'dateFormat',
    'displayEsignId',
    'attachAuditTrail',
    'attachCertificate',
    'watermarkDownloads',
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

  if (isDeleteReview) {
    return <DeleteAccountReview />;
  }

  return (
    <main className="mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage login security, invitations, and additional account preferences.
          </p>
        </div>
        <SaveButton saving={isSubmitting} disabled={!isDirty} onClick={onSubmit} />
      </header>

      <form onSubmit={onSubmit} className="space-y-5">
        <SettingCard
          title="Login and security"
          description="Control login alerts, session timeouts, and critical access rules."
          icon={<Lock className="h-5 w-5" />}
        >
          <div className="flex gap-10 items-center">
          <ToggleRow
            label="Login alerts"
            description="Email me about sign-ins from new devices."
            statusLabel={watch('loginAlerts') ? 'On' : 'Off'}
            input={register('loginAlerts')}
          />
          <ToggleRow
            label="Re-authenticate critical actions"
            description="Ask for password before changing security or billing."
            statusLabel={watch('requireReauthForCritical') ? 'On' : 'Off'}
            input={register('requireReauthForCritical')}
          />
          <label className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-800">Session timeout</div>
              <div className="text-xs text-slate-500">Automatically sign out inactive sessions.</div>
            </div>
            <Select
              {...register('sessionTimeoutMinutes', { valueAsNumber: true })} className="p-2"
            >
              {SESSION_TIMEOUT_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </Select>
          </label>
          </div>
        </SettingCard>

        <SettingCard
          title="Two-factor authentication"
          description="Require MFA for logins once configured."
          icon={<ShieldCheck className="h-5 w-5" />}
        >
          <ToggleRow
            label="Two-factor preference"
            description="Prompt for MFA during sign-in after setup."
            statusLabel={watch('twoFactor') ? 'On' : 'Off'}
            input={register('twoFactor')}
          />
        </SettingCard>

        <SettingCard
          title="Default invite settings"
          description="Control the standard email sent to new signers."
          icon={<Mail className="h-5 w-5" />}
        >
          <div className="space-y-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Subject</span>
              <Input {...register('inviteSubject')} className="border-slate-200 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Message</span>
              <Textarea
                {...register('inviteMessage')}
                className="border-slate-200 bg-white text-sm text-slate-700"
                rows={4}
              />
            </label>
          </div>
        </SettingCard>

        <SettingCard
          title="Additional settings"
          description="Localization and evidence defaults for completed documents."
          icon={<SlidersHorizontal className="h-5 w-5" />}
        >
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-800">Localization</div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Time zone</span>
                  <Select
                    {...register('timeZone')}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {TIME_ZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Language</span>
                  <Select
                    {...register('locale')}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {LOCALE_OPTIONS.map((locale) => (
                      <option key={locale.value} value={locale.value}>
                        {locale.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Week starts</span>
                  <Select
                    {...register('weekStart')}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <option value="sunday">Sunday</option>
                    <option value="monday">Monday</option>
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Time format</span>
                  <Select
                    {...register('timeFormat')}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <option value="12h">12-hour</option>
                    <option value="24h">24-hour</option>
                  </Select>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Date format</span>
                  <Select
                    {...register('dateFormat')}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {DATE_FORMAT_OPTIONS.map((format) => (
                      <option key={format} value={format}>
                        {format}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-800">Evidence defaults</div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <ToggleRow
                  label="Show eSign ID"
                  description="Display eSign verification on completed PDFs."
                  statusLabel={watch('displayEsignId') ? 'On' : 'Off'}
                  input={register('displayEsignId')}
                />
                <ToggleRow
                  label="Attach audit trail"
                  description="Include audit trail with completed documents."
                  statusLabel={watch('attachAuditTrail') ? 'On' : 'Off'}
                  input={register('attachAuditTrail')}
                />
                <ToggleRow
                  label="Completion summary"
                  description="Attach a completion summary PDF with signer and event details."
                  statusLabel={watch('attachCertificate') ? 'On' : 'Off'}
                  input={register('attachCertificate')}
                />
                <ToggleRow
                  label="Watermark downloads"
                  description="Add a subtle watermark to downloaded copies."
                  statusLabel={watch('watermarkDownloads') ? 'On' : 'Off'}
                  input={register('watermarkDownloads')}
                />
              </div>
            </div>
          </div>
        </SettingCard>
      </form>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center text-brand-600">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Security actions</div>
            <div className="text-xs text-slate-500">Update password and security posture.</div>
          </div>
        </div>
        <div className="mt-4">
          <ResetPassword />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center text-rose-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-rose-700">Danger zone</div>
            <div className="text-xs text-rose-600">Permanent actions for this account.</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-rose-700">Delete account</div>
            <div className="text-xs text-rose-600">This removes your trial or personal account data.</div>
          </div>
          <Button size="sm"
            type="button"
            onClick={() => router.push(getDashboardAccountPath('settings', 'delete'))}
            className="bg-rose-600 text-white shadow-sm hover:bg-rose-500 disabled:opacity-70"
            label="Review deletion"
          />
        </div>
      </section>
    </main>
  );
}
