'use client';

import type { ReactNode, RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { Button } from './button';
import { cn } from '@/lib/utils';

export interface UIModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  visible?: boolean;
  onClose?: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  contentClassName?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  handleCancel?: () => void;
  handleConfirm?: () => void;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  confirmClass?: string;
  cancelClass?: string;
  cancelIcon?: ReactNode;
  confirmIcon?: ReactNode;
  bodyScrollable?: boolean;
}

export function Modal({
  open,
  onOpenChange,
  visible,
  onClose,
  title,
  description,
  children,
  className,
  overlayClassName,
  contentClassName,
  bodyClassName,
  footer,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEsc,
  initialFocusRef,
  handleCancel,
  handleConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled,
  cancelDisabled,
  confirmClass,
  cancelClass,
  cancelIcon,
  confirmIcon,
  bodyScrollable = true,
}: UIModalProps) {
  const sizingUtilities = [className, contentClassName]
    .flatMap((value) => (value ?? '').split(/\s+/))
    .map((token) => token.split(':').pop() ?? token);
  const hasExplicitWidth = sizingUtilities.some(
    (utility) => utility.startsWith('w-') || utility.startsWith('min-w-')
  );
  const hasExplicitMaxWidth = sizingUtilities.some((utility) => utility.startsWith('max-w-'));
  const sizingClasses = hasExplicitWidth
    ? 'max-w-[calc(100vw-2rem)]'
    : hasExplicitMaxWidth
      ? 'w-auto max-w-[calc(100vw-2rem)]'
      : 'w-[calc(100vw-2rem)] max-w-lg';
  const isLegacyMode = visible !== undefined || (typeof onClose === 'function' && open === undefined);
  const resolvedOpen = open ?? visible ?? false;
  const resolvedCloseOnEsc = closeOnEsc ?? !isLegacyMode;
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onClose?.();
    }
    onOpenChange?.(nextOpen);
  };
  const resolvedFooter =
    footer ??
    (handleConfirm ? (
      <>
        <Button
          type="button"
          variant="outline"
          disabled={cancelDisabled}
          className={cn('shrink-0', cancelClass)}
          leadingIcon={cancelIcon}
          onClick={() => {
            handleCancel?.();
            handleDialogOpenChange(false);
          }}
          size="sm"
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          disabled={confirmDisabled}
          className={cn('shrink-0', confirmClass)}
          leadingIcon={confirmIcon}
          onClick={handleConfirm}
           size="sm"
        >
          {confirmLabel}
        </Button>
      </>
    ) : undefined);

  return (
    <Dialog.Root open={resolvedOpen} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-999999 bg-slate-950/60 backdrop-blur-sm',
            overlayClassName
          )}
        />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed left-1/2 top-1/2 z-1000000 flex max-h-[70vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl focus:outline-none',
            sizingClasses,
            className,
            contentClassName
          )}
          onOpenAutoFocus={(event) => {
            if (initialFocusRef?.current) {
              event.preventDefault();
              initialFocusRef.current.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (!resolvedCloseOnEsc) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if ((event.target as HTMLElement | null)?.closest('[data-dropdown-portal="true"]')) {
              event.preventDefault();
              return;
            }
            if (!closeOnBackdrop) {
              event.preventDefault();
            }
          }}
        >
          {(title || description || showCloseButton) && (
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 flex-1">
                {title ? (
                  <Dialog.Title className="text-lg font-semibold text-slate-950">
                    {title}
                  </Dialog.Title>
                ) : null}
                {description ? (
                  <Dialog.Description className="mt-1 text-sm text-slate-600">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>

              {showCloseButton ? (
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close modal"
                    className="shrink-0 text-slate-500 hover:text-slate-950"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </Dialog.Close>
              ) : null}
            </header>
          )}

          <div
            data-slot="modal-body"
            className={cn(
              'min-h-0 flex-1',
              bodyScrollable ? 'overflow-y-auto px-5 py-4' : 'overflow-hidden',
              bodyClassName
            )}
          >
            {children}
          </div>

          {resolvedFooter ? (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-4">
              {resolvedFooter}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
