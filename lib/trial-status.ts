export type TrialLifecycleState = 'active' | 'ending_soon' | 'expired';

export type TrialStatusInfo = {
  state: TrialLifecycleState;
  daysRemaining: number;
  formattedEndDate: string;
  headline: string;
  detail: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function formatTrialDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function getTrialStatusInfo(trialEndsAt?: string | Date | null, nowInput: Date = new Date()): TrialStatusInfo | null {
  if (!trialEndsAt) return null;

  const trialEndDate = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  if (Number.isNaN(trialEndDate.getTime())) {
    return null;
  }

  const remainingMs = trialEndDate.getTime() - nowInput.getTime();
  const formattedEndDate = formatTrialDate(trialEndDate);

  if (remainingMs <= 0) {
    return {
      state: 'expired',
      daysRemaining: 0,
      formattedEndDate,
      headline: `Free trial ended on ${formattedEndDate}`,
      detail:
        'Upgrade now to keep teams, shared audit trail, governance controls, and owner-managed billing active for this workspace.',
    };
  }

  const daysRemaining = Math.ceil(remainingMs / DAY_IN_MS);
  const state: TrialLifecycleState = daysRemaining <= 3 ? 'ending_soon' : 'active';
  const dayLabel =
    daysRemaining === 1 ? '1 day left in your free trial' : `${daysRemaining} days left in your free trial`;

  return {
    state,
    daysRemaining,
    formattedEndDate,
    headline: dayLabel,
    detail:
      state === 'ending_soon'
        ? `Upgrade before ${formattedEndDate} to keep team collaboration, audit visibility, and admin governance uninterrupted.`
        : `Your trial runs until ${formattedEndDate}. Use this time to test sending, team workflows, and admin controls before choosing a paid plan.`,
  };
}
