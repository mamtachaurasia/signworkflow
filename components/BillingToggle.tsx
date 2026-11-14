'use client';

import * as Switch from '@radix-ui/react-switch';
import type { BillingCycle } from '@/lib/billing';

type BillingToggleProps = {
  value: BillingCycle;
  onChange: (value: BillingCycle) => void;
  annualSavingsLabel?: string | null;
};

export default function BillingToggle({
  value,
  onChange,
  annualSavingsLabel,
}: BillingToggleProps) {
  const isAnnual = value === 'annually';

  function handleChange(checked: boolean) {
    onChange(checked ? 'annually' : 'monthly');
  }

  return (
    <div className="items-center justify-center gap-3">
       {annualSavingsLabel ? (
        <div className="mx-auto relative inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {annualSavingsLabel}
          <svg width="30" height="30" viewBox="0 0 0.9 0.9" className="absolute top-0 -right-7 text-emerald-700" aria-hidden="true">
            <path fill="green" d="M.701.649a.04.04 0 0 0-.053 0L.599.698V.581A.53.53 0 0 0 .237.076.038.038 0 1 0 .213.15a.45.45 0 0 1 .312.431v.116L.476.648a.038.038 0 0 0-.053.053l.112.112a.04.04 0 0 0 .053 0L.7.701a.04.04 0 0 0 0-.053"/>
          </svg>
        </div>
      ) : null}

      <div className="relative mx-auto my-4 flex h-6 w-45 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-100">
        {/* Left label */}
        <span
          className={`absolute left-0 w-1/2 rounded-l-full py-1 pr-4 text-center text-xs font-medium transition ${
            !isAnnual ? 'bg-teal-400 text-slate-900' : 'text-slate-400'
          }`}
        >
          Monthly
        </span>

        {/* Switch */}
        <Switch.Root
          checked={isAnnual}
          onCheckedChange={handleChange}
          aria-label={`Billing cycle: ${
            isAnnual ? 'Annually' : 'Monthly'
          }`}
          className="relative z-10 h-6 w-11 cursor-pointer rounded-full bg-slate-300 outline-none transition data-[state=checked]:bg-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 will-change-transform data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>

        {/* Right label */}
        <span
          className={`absolute right-0 w-1/2 rounded-r-full py-1 pl-4 text-center text-xs font-medium transition ${
            isAnnual ? 'bg-sky-300 text-slate-900' : 'text-slate-400'
          }`}
        >
          Annually
        </span>
      </div>

    </div>
  );
}
