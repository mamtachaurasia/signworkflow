'use client';

import ToggleSwitch from '@/components/forms/ToggleSwitch';
import type { CookieCategoryConfig, CookieConsentCategory } from '@/types/cookie';
import { cn } from '@/lib/utils';

interface CookieCategoryToggleProps {
  category: CookieCategoryConfig;
  checked: boolean;
  onCheckedChange: (category: CookieConsentCategory, checked: boolean) => void;
}

export function CookieCategoryToggle({
  category,
  checked,
  onCheckedChange,
}: CookieCategoryToggleProps) {
  const isDisabled = category.alwaysEnabled === true;

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white/80 p-4 shadow-xs transition-colors',
        'dark:border-slate-800 dark:bg-slate-950/80'
      )}
    >
      <ToggleSwitch
        checked={checked}
        disabled={isDisabled}
        label={category.title}
        description={
          isDisabled
            ? `${category.description} These cookies are always enabled.`
            : category.description
        }
        onChange={(nextChecked) => onCheckedChange(category.id, nextChecked)}
        className="items-center"
      />
    </div>
  );
}
