'use client';

import { forwardRef, useId } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface UITextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | boolean;
  tone?: 'default' | 'dark';
  containerClassName?: string;
  labelClassName?: string;
  hintClassName?: string;
  errorClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, UITextareaProps>(function Textarea(
  {
    id,
    label,
    hint,
    error,
    tone = 'default',
    'aria-describedby': ariaDescribedBy,
    className,
    containerClassName,
    labelClassName,
    hintClassName,
    errorClassName,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hasError = Boolean(error);
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = typeof error === 'string' ? `${textareaId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hasError ? errorId : hintId].filter(Boolean).join(' ') || undefined;
  const toneClasses =
    tone === 'dark'
      ? 'border-white/10 bg-white/5 text-white shadow-sm placeholder:text-slate-400 focus-visible:border-sky-400 focus-visible:ring-sky-400/20'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-brand-500 focus-visible:ring-brand-100';
  const textareaClasses = cn(
    'flex min-h-28 w-full rounded-md border px-3 py-2 text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
    toneClasses,
    hasError && 'border-rose-500 focus-visible:border-rose-500 focus-visible:ring-rose-100',
    className
  );

  const isSimpleTextarea =
    !label &&
    !hint &&
    !error &&
    !containerClassName &&
    !labelClassName &&
    !hintClassName &&
    !errorClassName;

  if (isSimpleTextarea) {
    return (
      <textarea
        id={textareaId}
        ref={ref}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        aria-errormessage={hasError ? errorId : undefined}
        className={textareaClasses}
        {...props}
      />
    );
  }

  return (
    <div className={cn('w-full', containerClassName)}>
      {label ? (
        <label
          htmlFor={textareaId}
          className={cn('mb-2 block text-sm font-medium text-slate-700', labelClassName)}
        >
          {label}
        </label>
      ) : null}

      <textarea
        id={textareaId}
        ref={ref}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        aria-errormessage={hasError ? errorId : undefined}
        className={textareaClasses}
        {...props}
      />

      {hint && !hasError ? (
        <p id={hintId} className={cn('mt-2 text-xs text-slate-500', hintClassName)}>
          {hint}
        </p>
      ) : null}
      {typeof error === 'string' ? (
        <p id={errorId} className={cn('mt-2 text-xs text-rose-600', errorClassName)}>
          {error}
        </p>
      ) : null}
    </div>
  );
});
