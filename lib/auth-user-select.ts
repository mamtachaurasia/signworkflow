const AUTH_USER_BASE_FIELDS = [
  'email',
  'firstName',
  'lastName',
  'picture',
  'primaryOrgId',
  'isActive',
  'isDeleted',
  'deletionScheduledAt',
  'tokenVersion',
  'mfaEnabled',
  'settings',
] as const;

export const AUTH_LOGIN_USER_SELECT = [
  ...AUTH_USER_BASE_FIELDS,
  'failedLoginAttempts',
  'lockUntil',
  '+passwordHash',
  '+password',
  '+mfaSecret',
].join(' ');

export const AUTH_GOOGLE_USER_SELECT = [
  ...AUTH_USER_BASE_FIELDS,
  '+mfaSecret',
].join(' ');

export const AUTH_RESTORE_USER_SELECT = [
  ...AUTH_USER_BASE_FIELDS,
  '+passwordHash',
  '+password',
  '+mfaSecret',
].join(' ');

export const AUTH_RESTORE_GOOGLE_USER_SELECT = AUTH_GOOGLE_USER_SELECT;
