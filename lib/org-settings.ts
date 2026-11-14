import type { RetentionTriggerEvent } from '@/models/RetentionPolicy';
import { DEFAULT_USER_SETTINGS, type UserSettings, normalizeUserSettings } from '@/lib/user-settings';

export type OrganizationBrandingSettings = {
  brandName: string;
  primaryColor: string;
  supportEmail: string;
};

export type OrganizationDocumentDefaults = {
  defaultSigningMode: UserSettings['defaultSigningMode'];
  defaultExpirationDays: number;
  autoReminders: boolean;
  reminderIntervalDays: number;
};

export type OrganizationNotificationRules = {
  emailDigest: UserSettings['emailDigest'];
  notifyOnViewed: boolean;
  notifyOnSigned: boolean;
  notifyOnCompleted: boolean;
  notifyOnDeclined: boolean;
  inviteSubject: string;
  inviteMessage: string;
};

export type OrganizationDefaultRetentionSettings = {
  enabled: boolean;
  triggerEvent: RetentionTriggerEvent;
  durationDays: number;
  regime: string;
};

export type OrganizationSettings = {
  branding: OrganizationBrandingSettings;
  documentDefaults: OrganizationDocumentDefaults;
  notificationRules: OrganizationNotificationRules;
  defaultRetention: OrganizationDefaultRetentionSettings;
};

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  branding: {
    brandName: '',
    primaryColor: '#285feb',
    supportEmail: '',
  },
  documentDefaults: {
    defaultSigningMode: DEFAULT_USER_SETTINGS.defaultSigningMode,
    defaultExpirationDays: DEFAULT_USER_SETTINGS.defaultExpirationDays,
    autoReminders: DEFAULT_USER_SETTINGS.autoReminders,
    reminderIntervalDays: DEFAULT_USER_SETTINGS.reminderIntervalDays,
  },
  notificationRules: {
    emailDigest: DEFAULT_USER_SETTINGS.emailDigest,
    notifyOnViewed: DEFAULT_USER_SETTINGS.notifyOnViewed,
    notifyOnSigned: DEFAULT_USER_SETTINGS.notifyOnSigned,
    notifyOnCompleted: DEFAULT_USER_SETTINGS.notifyOnCompleted,
    notifyOnDeclined: DEFAULT_USER_SETTINGS.notifyOnDeclined,
    inviteSubject: DEFAULT_USER_SETTINGS.inviteSubject,
    inviteMessage: DEFAULT_USER_SETTINGS.inviteMessage,
  },
  defaultRetention: {
    enabled: false,
    triggerEvent: 'completedAt',
    durationDays: 365 * 7,
    regime: '',
  },
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RETENTION_TRIGGERS: RetentionTriggerEvent[] = [
  'createdAt',
  'completedAt',
  'finalizedAt',
  'expiresAt',
  'custom',
];

function intWithin(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function normalizeString(value: unknown, fallback = '', maxLength = 300): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function normalizeOptionalEmail(value: unknown): string {
  const email = normalizeString(value, '', 320).toLowerCase();
  if (!email) return '';
  return EMAIL_PATTERN.test(email) ? email : '';
}

function normalizeColor(value: unknown): string {
  const fallback = DEFAULT_ORGANIZATION_SETTINGS.branding.primaryColor;
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

export function normalizeOrganizationSettings(raw: unknown): OrganizationSettings {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const branding =
    input.branding && typeof input.branding === 'object'
      ? (input.branding as Record<string, unknown>)
      : {};
  const documentDefaults =
    input.documentDefaults && typeof input.documentDefaults === 'object'
      ? (input.documentDefaults as Record<string, unknown>)
      : {};
  const notificationRules =
    input.notificationRules && typeof input.notificationRules === 'object'
      ? (input.notificationRules as Record<string, unknown>)
      : {};
  const defaultRetention =
    input.defaultRetention && typeof input.defaultRetention === 'object'
      ? (input.defaultRetention as Record<string, unknown>)
      : {};

  return {
    branding: {
      brandName: normalizeString(branding.brandName, '', 120),
      primaryColor: normalizeColor(branding.primaryColor),
      supportEmail: normalizeOptionalEmail(branding.supportEmail),
    },
    documentDefaults: {
      defaultSigningMode:
        documentDefaults.defaultSigningMode === 'sequential' ? 'sequential' : 'parallel',
      defaultExpirationDays: intWithin(
        documentDefaults.defaultExpirationDays,
        DEFAULT_ORGANIZATION_SETTINGS.documentDefaults.defaultExpirationDays,
        1,
        365
      ),
      autoReminders: documentDefaults.autoReminders !== false,
      reminderIntervalDays: intWithin(
        documentDefaults.reminderIntervalDays,
        DEFAULT_ORGANIZATION_SETTINGS.documentDefaults.reminderIntervalDays,
        1,
        30
      ),
    },
    notificationRules: {
      emailDigest:
        notificationRules.emailDigest === 'daily' ||
          notificationRules.emailDigest === 'weekly' ||
          notificationRules.emailDigest === 'off'
          ? notificationRules.emailDigest
          : DEFAULT_ORGANIZATION_SETTINGS.notificationRules.emailDigest,
      notifyOnViewed: notificationRules.notifyOnViewed !== false,
      notifyOnSigned: notificationRules.notifyOnSigned !== false,
      notifyOnCompleted: notificationRules.notifyOnCompleted !== false,
      notifyOnDeclined: notificationRules.notifyOnDeclined !== false,
      inviteSubject: normalizeString(
        notificationRules.inviteSubject,
        DEFAULT_ORGANIZATION_SETTINGS.notificationRules.inviteSubject,
        300
      ),
      inviteMessage: normalizeString(
        notificationRules.inviteMessage,
        DEFAULT_ORGANIZATION_SETTINGS.notificationRules.inviteMessage,
        2000
      ),
    },
    defaultRetention: {
      enabled: defaultRetention.enabled === true,
      triggerEvent: RETENTION_TRIGGERS.includes(defaultRetention.triggerEvent as RetentionTriggerEvent)
        ? (defaultRetention.triggerEvent as RetentionTriggerEvent)
        : DEFAULT_ORGANIZATION_SETTINGS.defaultRetention.triggerEvent,
      durationDays: intWithin(
        defaultRetention.durationDays,
        DEFAULT_ORGANIZATION_SETTINGS.defaultRetention.durationDays,
        1,
        365 * 25
      ),
      regime: normalizeString(defaultRetention.regime, '', 160),
    },
  };
}

export function organizationSettingsToUserSettingsInput(
  settings: OrganizationSettings
): Partial<UserSettings> {
  return {
    defaultSigningMode: settings.documentDefaults.defaultSigningMode,
    defaultExpirationDays: settings.documentDefaults.defaultExpirationDays,
    autoReminders: settings.documentDefaults.autoReminders,
    reminderIntervalDays: settings.documentDefaults.reminderIntervalDays,
    emailDigest: settings.notificationRules.emailDigest,
    notifyOnViewed: settings.notificationRules.notifyOnViewed,
    notifyOnSigned: settings.notificationRules.notifyOnSigned,
    notifyOnCompleted: settings.notificationRules.notifyOnCompleted,
    notifyOnDeclined: settings.notificationRules.notifyOnDeclined,
    inviteSubject: settings.notificationRules.inviteSubject,
    inviteMessage: settings.notificationRules.inviteMessage,
  };
}

export function buildEffectiveUserSettings(args: {
  userSettings?: unknown;
  organizationSettings?: unknown;
}): UserSettings {
  const orgSettings = normalizeOrganizationSettings(args.organizationSettings);
  const mergedInput = {
    ...organizationSettingsToUserSettingsInput(orgSettings),
    ...(args.userSettings && typeof args.userSettings === 'object'
      ? (args.userSettings as Record<string, unknown>)
      : {}),
  };
  return normalizeUserSettings(mergedInput);
}

export function resolveEffectiveBrandName(
  organizationName: string | undefined | null,
  settings: OrganizationSettings
): string {
  return settings.branding.brandName || organizationName?.trim() || 'SignWorkflow';
}
