const DEFAULT_GRACE_DAYS = 30;
const MIN_GRACE_DAYS = 1;
const MAX_GRACE_DAYS = 365;

export function getAccountDeletionGraceDays(): number {
  const raw = process.env.ACCOUNT_DELETION_GRACE_DAYS;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GRACE_DAYS;
  }
  const rounded = Math.floor(parsed);
  if (rounded < MIN_GRACE_DAYS || rounded > MAX_GRACE_DAYS) {
    return DEFAULT_GRACE_DAYS;
  }
  return rounded;
}

export function computeDeletionSchedule(now: Date = new Date()): {
  deletedAt: Date;
  deletionScheduledAt: Date;
  graceDays: number;
} {
  const graceDays = getAccountDeletionGraceDays();
  const deletedAt = new Date(now);
  const deletionScheduledAt = new Date(now);
  deletionScheduledAt.setDate(deletionScheduledAt.getDate() + graceDays);
  return { deletedAt, deletionScheduledAt, graceDays };
}

export function getDeletionWindowState(
  user: { isDeleted?: boolean | null; deletionScheduledAt?: Date | string | null } | null | undefined,
  now: Date = new Date()
): { canRestore: boolean; deletionScheduledAt?: Date } {
  if (!user || user.isDeleted !== true) {
    return { canRestore: false };
  }
  if (!user.deletionScheduledAt) {
    return { canRestore: false };
  }
  const scheduledAt = user.deletionScheduledAt instanceof Date
    ? user.deletionScheduledAt
    : new Date(user.deletionScheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { canRestore: false };
  }
  return { canRestore: now.getTime() <= scheduledAt.getTime(), deletionScheduledAt: scheduledAt };
}
