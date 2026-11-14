'use client';

import { useEffect, useRef } from 'react';
import { UNSAVED_CHANGES_MESSAGE } from '@/lib/unsaved-changes';

export function useUnsavedChangesGuard(enabled: boolean): void {
  const allowNextUnload = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNextUnload.current) return;
      event.preventDefault();
      event.returnValue = UNSAVED_CHANGES_MESSAGE;
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;

      if (!window.confirm(UNSAVED_CHANGES_MESSAGE)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      allowNextUnload.current = true;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [enabled]);
}
