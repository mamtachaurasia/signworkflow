'use client';

import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

export const TIME_ZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'US Eastern (ET)' },
  { value: 'America/Chicago', label: 'US Central (CT)' },
  { value: 'America/Denver', label: 'US Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AET)' },
];

export const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
];

export const EXPIRATION_OPTIONS = [7, 14, 30, 60, 90, 120];
export const REMINDER_INTERVAL_OPTIONS = [1, 2, 3, 5, 7, 14];
export const SESSION_TIMEOUT_OPTIONS = [15, 30, 60, 120, 240];

export const DIGEST_OPTIONS = [
  { value: 'immediate', label: 'Send immediately' },
  { value: 'daily', label: 'Daily summary' },
  { value: 'weekly', label: 'Weekly summary' },
  { value: 'off', label: 'Do not email' },
];

type SettingCardProps = {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
};

export const SettingCard = ({ title, description, icon, children }: SettingCardProps) => {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center text-brand-600">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
};

type ToggleRowProps = {
  label: string;
  description: string;
  statusLabel: string;
  disabled?: boolean;
  input: UseFormRegisterReturn<string>;
};

export const ToggleRow = ({ label, description, statusLabel, disabled, input }: ToggleRowProps) => {
  return (
    <label
      className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 transition ${
        disabled ? 'opacity-60' : 'hover:border-slate-300'
      }`}
    >
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
        <span>{statusLabel}</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand-600"
          disabled={disabled}
          {...input}
        />
      </div>
    </label>
  );
};
