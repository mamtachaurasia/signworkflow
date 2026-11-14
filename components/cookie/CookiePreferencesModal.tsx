'use client';

import { useState } from 'react';

import { Button, Modal, SaveButton } from '@ui';
import { CookieCategoryToggle } from '@/components/cookie/CookieCategoryToggle';
import {
  COOKIE_CATEGORIES,
  DEFAULT_COOKIE_PREFERENCES,
} from '@/lib/consent';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import type {
  CookieConsent,
  CookieConsentCategory,
  CookieConsentPreferences,
} from '@/types/cookie';
import toast from 'react-hot-toast';

function getInitialPreferences(consent: CookieConsent | null): CookieConsentPreferences {
  return {
    necessary: true,
    analytics: consent?.analytics ?? DEFAULT_COOKIE_PREFERENCES.analytics,
    marketing: consent?.marketing ?? DEFAULT_COOKIE_PREFERENCES.marketing,
    functional: consent?.functional ?? DEFAULT_COOKIE_PREFERENCES.functional,
  };
}

export function CookiePreferencesModal() {
  const {
    acceptAll,
    rejectAll,
    savePreferences,
    closePreferences,
    consent,
    isPreferencesOpen,
  } = useCookieConsent();
  const formKey = isPreferencesOpen ? (consent?.acceptedAt ?? 'new-consent') : 'closed';

  return (
    <Modal
      open={isPreferencesOpen}
      onOpenChange={(open) => {
        if (!open) {
          closePreferences();
        }
      }}
      title={<span className="text-slate-950 dark:text-white">Cookie preferences</span>}
      description={
        <span className="text-slate-600 dark:text-slate-300">
          Choose how SignWorkflow can use optional cookies. Necessary cookies stay enabled.
        </span>
      }
      bodyClassName="p-0"
      bodyScrollable={false}
      contentClassName="max-w-2xl border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:[&>header]:border-slate-800 dark:[&>header>button]:text-slate-300 dark:[&>header>button:hover]:text-white"
    >
      <CookiePreferencesForm
        key={formKey}
        initialPreferences={getInitialPreferences(consent)}
        acceptAll={acceptAll}
        rejectAll={rejectAll}
        savePreferences={savePreferences}
      />
    </Modal>
  );
}

interface CookiePreferencesFormProps {
  initialPreferences: CookieConsentPreferences;
  acceptAll: () => void;
  rejectAll: () => void;
  savePreferences: (preferences: CookieConsentPreferences) => void;
}

function CookiePreferencesForm({
  initialPreferences,
  acceptAll,
  rejectAll,
  savePreferences,
}: CookiePreferencesFormProps) {
  const [preferences, setPreferences] = useState<CookieConsentPreferences>(
    initialPreferences
  );

  const handleToggle = (category: CookieConsentCategory, checked: boolean) => {
    if (category === 'necessary') {
      return;
    }

    setPreferences((currentPreferences) => ({
      ...currentPreferences,
      necessary: true,
      [category]: checked,
    }));
  };

  return (
    <>
      <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
        <div className="space-y-3">
          {COOKIE_CATEGORIES.map((category) => (
            <CookieCategoryToggle
              key={category.id}
              category={category}
              checked={preferences[category.id]}
              onCheckedChange={handleToggle}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/90 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/80 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={rejectAll}
          className="dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
           size="sm"
        >
          Reject All
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={acceptAll}
          className="dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          size="sm"
        >
          Accept All
        </Button>
        <SaveButton
          type="button"
          onClick={() => {
            savePreferences(preferences);
            toast.success('Cookie preferences saved');
          }}
          label="Save preferences"
        />
      </div>
    </>
  );
}
