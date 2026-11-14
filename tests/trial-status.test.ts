import { describe, expect, it } from 'vitest';

import { getTrialStatusInfo } from '@/lib/trial-status';

describe('getTrialStatusInfo', () => {
  it('returns an active trial state when the end date is more than three days away', () => {
    const status = getTrialStatusInfo('2026-04-10T00:00:00.000Z', new Date('2026-04-01T00:00:00.000Z'));

    expect(status).toMatchObject({
      state: 'active',
      daysRemaining: 9,
    });
    expect(status?.headline).toContain('9 days left');
  });

  it('returns an ending-soon state when the trial has three days or less remaining', () => {
    const status = getTrialStatusInfo('2026-04-04T00:00:00.000Z', new Date('2026-04-01T12:00:00.000Z'));

    expect(status).toMatchObject({
      state: 'ending_soon',
      daysRemaining: 3,
    });
    expect(status?.detail).toContain('Upgrade before');
  });

  it('returns an expired state after the trial end date passes', () => {
    const status = getTrialStatusInfo('2026-04-01T00:00:00.000Z', new Date('2026-04-02T00:00:00.000Z'));

    expect(status).toMatchObject({
      state: 'expired',
      daysRemaining: 0,
    });
    expect(status?.headline).toContain('Free trial ended');
  });
});
