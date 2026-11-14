'use client';

import Link from 'next/link';

import { Button, Card } from '@ui';
import { useCookieConsent } from '@/hooks/useCookieConsent';

export function CookieBanner() {
  const {
    acceptAll,
    rejectAll,
    openPreferences,
    consent,
    isLoaded,
    isPreferencesOpen,
  } = useCookieConsent();

  if (!isLoaded || consent || isPreferencesOpen) {
    return null;
  }

  return (
    <section
      aria-label="Cookie consent"
      className="bottom-4 fixed inset-x-0 max-w-xl mx-auto px-0 sm:bottom-6 z-1000000"
      role="region"
    >
      <Card className="overflow-hidden rounded-xl border-slate-200/80 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90 dark:text-slate-50">
        <div className=" gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Your privacy choices
            </h2>
          <div className="flex gap-2">
            <p className="mt-2 max-w-xl text-sm  text-slate-600 dark:text-slate-300">
              SignWorkflow uses necessary cookies to run the service. With your permission,
              we also use analytics, marketing, and functional cookies to improve the product
              and support future integrations.
            </p>
          
          </div>
          <div className="my-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <Link className="font-medium text-brand-700 hover:underline dark:text-brand-300" href="/privacy">
                Privacy Policy
              </Link>
              <span aria-hidden="true">/</span>
              <Link className="font-medi  um text-brand-700 hover:underline dark:text-brand-300" href="/cookies">
                Cookie Policy
              </Link>
            </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-108">
            <Button type="button" size="sm" onClick={acceptAll}>
              Accept All
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={rejectAll}
              className="dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
              Reject All
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={openPreferences}
              className="dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white">
              Preferences
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
