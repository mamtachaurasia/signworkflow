'use client';

import { Check, LoaderCircle, Save } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { Button } from './button';

type SaveButtonProps = Omit<ComponentProps<typeof Button>, 'label' | 'loading' | 'leadingIcon'> & {
  label?: ReactNode;
  savingLabel?: ReactNode;
  savedLabel?: ReactNode;
  saving?: boolean;
  saved?: boolean;
  showIcon?: boolean;
};

export function SaveButton({
  label = 'Save changes',
  savingLabel = 'Saving…',
  savedLabel = 'Saved',
  saving = false,
  saved = false,
  showIcon = true,
  disabled,
  size = 'sm',
  type = 'button',
  ...props
}: SaveButtonProps) {
  const content = saving ? savingLabel : saved ? savedLabel : label;
  const icon = saving
    ? <LoaderCircle className="h-4 w-4 animate-spin" />
    : saved
      ? <Check className="h-4 w-4" />
      : <Save className="h-4 w-4" />;

  return (
    <Button
      {...props}
      type={type}
      size={size}
      disabled={disabled || saving}
      aria-busy={saving}
      leadingIcon={showIcon ? icon : undefined}
    >
      {content}
    </Button>
  );
}
