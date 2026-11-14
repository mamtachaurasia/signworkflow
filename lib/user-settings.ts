import { DATE_FORMAT_OPTIONS } from '@/lib/date-formats';

export type UserSettings = {
  twoFactor: boolean;
  displayEsignId: boolean;
  dateFormat: (typeof DATE_FORMAT_OPTIONS)[number];
  inviteSubject: string;
  inviteMessage: string;
  timeZone: string;
  locale: string;
  weekStart: 'sunday' | 'monday';
  timeFormat: '12h' | '24h';
  defaultSigningMode: 'parallel' | 'sequential';
  defaultExpirationDays: number;
  autoReminders: boolean;
  reminderIntervalDays: number;
  emailDigest: 'immediate' | 'daily' | 'weekly' | 'off';
  notifyOnViewed: boolean;
  notifyOnSigned: boolean;
  notifyOnCompleted: boolean;
  notifyOnDeclined: boolean;
  attachAuditTrail: boolean;
  attachCertificate: boolean;
  watermarkDownloads: boolean;
  sessionTimeoutMinutes: number;
  loginAlerts: boolean;
  requireReauthForCritical: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  twoFactor: false,
  displayEsignId: true,
  dateFormat: 'MM/DD/YYYY (US)',
  inviteSubject: 'Document Name: Signature Request from Sender name',
  inviteMessage: 'Sender name invited you to sign Document Name',
  timeZone: 'UTC',
  locale: 'en-US',
  weekStart: 'sunday',
  timeFormat: '12h',
  defaultSigningMode: 'parallel',
  defaultExpirationDays: 14,
  autoReminders: true,
  reminderIntervalDays: 3,
  emailDigest: 'immediate',
  notifyOnViewed: true,
  notifyOnSigned: true,
  notifyOnCompleted: true,
  notifyOnDeclined: true,
  attachAuditTrail: true,
  attachCertificate: true,
  watermarkDownloads: false,
  sessionTimeoutMinutes: 120,
  loginAlerts: true,
  requireReauthForCritical: true,
};

const DATE_FORMATS = DATE_FORMAT_OPTIONS;

export function normalizeUserSettings(raw: unknown): UserSettings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const intWithin = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.floor(parsed);
    if (rounded < min || rounded > max) return fallback;
    return rounded;
  };

  return {
    twoFactor: input.twoFactor === true,
    displayEsignId: input.displayEsignId !== false,
    dateFormat: DATE_FORMATS.includes(input.dateFormat as UserSettings['dateFormat'])
      ? (input.dateFormat as UserSettings['dateFormat'])
      : DEFAULT_USER_SETTINGS.dateFormat,
    inviteSubject:
      typeof input.inviteSubject === 'string' && input.inviteSubject.trim().length > 0
        ? input.inviteSubject.trim()
        : DEFAULT_USER_SETTINGS.inviteSubject,
    inviteMessage:
      typeof input.inviteMessage === 'string' && input.inviteMessage.trim().length > 0
        ? input.inviteMessage.trim()
        : DEFAULT_USER_SETTINGS.inviteMessage,
    timeZone:
      typeof input.timeZone === 'string' && input.timeZone.trim().length > 0
        ? input.timeZone.trim()
        : DEFAULT_USER_SETTINGS.timeZone,
    locale:
      typeof input.locale === 'string' && input.locale.trim().length > 0
        ? input.locale.trim()
        : DEFAULT_USER_SETTINGS.locale,
    weekStart: input.weekStart === 'monday' ? 'monday' : DEFAULT_USER_SETTINGS.weekStart,
    timeFormat: input.timeFormat === '24h' ? '24h' : DEFAULT_USER_SETTINGS.timeFormat,
    defaultSigningMode: input.defaultSigningMode === 'sequential' ? 'sequential' : 'parallel',
    defaultExpirationDays: intWithin(
      input.defaultExpirationDays,
      DEFAULT_USER_SETTINGS.defaultExpirationDays,
      1,
      365
    ),
    autoReminders: input.autoReminders !== false,
    reminderIntervalDays: intWithin(
      input.reminderIntervalDays,
      DEFAULT_USER_SETTINGS.reminderIntervalDays,
      1,
      30
    ),
    emailDigest:
      input.emailDigest === 'daily' || input.emailDigest === 'weekly' || input.emailDigest === 'off'
        ? input.emailDigest
        : DEFAULT_USER_SETTINGS.emailDigest,
    notifyOnViewed: input.notifyOnViewed !== false,
    notifyOnSigned: input.notifyOnSigned !== false,
    notifyOnCompleted: input.notifyOnCompleted !== false,
    notifyOnDeclined: input.notifyOnDeclined !== false,
    attachAuditTrail: input.attachAuditTrail !== false,
    attachCertificate: input.attachCertificate !== false,
    watermarkDownloads: input.watermarkDownloads === true,
    sessionTimeoutMinutes: intWithin(
      input.sessionTimeoutMinutes,
      DEFAULT_USER_SETTINGS.sessionTimeoutMinutes,
      5,
      480
    ),
    loginAlerts: input.loginAlerts !== false,
    requireReauthForCritical: input.requireReauthForCritical !== false,
  };
}
