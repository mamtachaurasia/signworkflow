'use client';

import type { ReactNode } from 'react';

import { Button } from '@ui';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { cn } from '@/lib/utils';

interface CookieSettingsButtonProps {
  children?: ReactNode;
  className?: string;
}

export function CookieSettingsButton({
  children = 'Cookie Settings',
  className,
}: CookieSettingsButtonProps) {
  const { openPreferences, isLoaded } = useCookieConsent();

  return (
    <Button
      type="button"
      variant="link"
      size="xs"
      disabled={!isLoaded}
      onClick={openPreferences}
      className={cn(
        'h-auto p-0 text-xs font-normal text-white/35 hover:text-white hover:no-underline disabled:pointer-events-auto disabled:cursor-not-allowed',
        className
      )}
    >
      {children}
    </Button>
  );
}
