import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ORGANIZATION_SETTINGS,
  buildEffectiveUserSettings,
  normalizeOrganizationSettings,
} from '@/lib/org-settings';

describe('organization settings', () => {
  it('normalizes invalid organization settings safely', () => {
    const settings = normalizeOrganizationSettings({
      branding: {
        brandName: '  Acme Sign  ',
        primaryColor: 'blue',
        supportEmail: 'not-an-email',
      },
      documentDefaults: {
        defaultSigningMode: 'sequential',
        defaultExpirationDays: 9999,
      },
      notificationRules: {
        inviteSubject: '  Org Subject  ',
        inviteMessage: '  Org Message  ',
        emailDigest: 'weekly',
      },
      defaultRetention: {
        enabled: true,
        triggerEvent: 'completedAt',
        durationDays: 365 * 30,
      },
    });

    expect(settings.branding.brandName).toBe('Acme Sign');
    expect(settings.branding.primaryColor).toBe(DEFAULT_ORGANIZATION_SETTINGS.branding.primaryColor);
    expect(settings.branding.supportEmail).toBe('');
    expect(settings.documentDefaults.defaultSigningMode).toBe('sequential');
    expect(settings.documentDefaults.defaultExpirationDays).toBe(
      DEFAULT_ORGANIZATION_SETTINGS.documentDefaults.defaultExpirationDays
    );
    expect(settings.notificationRules.inviteSubject).toBe('Org Subject');
    expect(settings.notificationRules.emailDigest).toBe('weekly');
    expect(settings.defaultRetention.enabled).toBe(true);
    expect(settings.defaultRetention.durationDays).toBe(
      DEFAULT_ORGANIZATION_SETTINGS.defaultRetention.durationDays
    );
  });

  it('merges org defaults beneath explicit user settings', () => {
    const settings = buildEffectiveUserSettings({
      organizationSettings: {
        documentDefaults: {
          defaultSigningMode: 'sequential',
          defaultExpirationDays: 21,
          autoReminders: false,
          reminderIntervalDays: 5,
        },
        notificationRules: {
          emailDigest: 'daily',
          notifyOnViewed: false,
          notifyOnSigned: true,
          notifyOnCompleted: true,
          notifyOnDeclined: true,
          inviteSubject: 'Org invite subject',
          inviteMessage: 'Org invite body',
        },
      },
      userSettings: {
        notifyOnViewed: true,
        inviteSubject: 'Personal subject',
      },
    });

    expect(settings.defaultSigningMode).toBe('sequential');
    expect(settings.defaultExpirationDays).toBe(21);
    expect(settings.autoReminders).toBe(false);
    expect(settings.reminderIntervalDays).toBe(5);
    expect(settings.emailDigest).toBe('daily');
    expect(settings.notifyOnViewed).toBe(true);
    expect(settings.inviteSubject).toBe('Personal subject');
    expect(settings.inviteMessage).toBe('Org invite body');
  });
});
