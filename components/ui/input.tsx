'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface UIInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | boolean;
  tone?: 'default' | 'dark';
  containerClassName?: string;
  labelClassName?: string;
  hintClassName?: string;
  errorClassName?: string;
  leadingAdornment?: ReactNode;
  trailingAdornment?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, UIInputProps>(function Input(
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
    leadingAdornment,
    trailingAdornment,
    readOnly,
    type = 'text',
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasError = Boolean(error);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = typeof error === 'string' ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hasError ? errorId : hintId].filter(Boolean).join(' ') || undefined;
  const toneClasses =
    tone === 'dark'
      ? 'border-white/10 bg-white/5 text-white shadow-sm placeholder:text-slate-400 focus-visible:border-sky-400 focus-visible:ring-sky-400/20'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-brand-500 focus-visible:ring-brand-100';
  const inputClasses = cn(
    'flex h-10 w-full rounded-md border px-3 py-2 text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
    'file:border-0 file:bg-transparent file:text-sm file:font-medium',
    toneClasses,
    readOnly && (tone === 'dark' ? 'cursor-default bg-white/10' : 'cursor-default bg-slate-50'),
    Boolean(leadingAdornment) && 'pl-10',
    Boolean(trailingAdornment) && 'pr-10',
    hasError && 'border-rose-500 focus-visible:border-rose-500 focus-visible:ring-rose-100',
    className
  );

  const isSimpleInput =
    !label &&
    !hint &&
    !error &&
    !containerClassName &&
    !labelClassName &&
    !hintClassName &&
    !errorClassName &&
    !leadingAdornment &&
    !trailingAdornment;

  if (isSimpleInput) {
    return (
      <input
        id={inputId}
        ref={ref}
        type={type}
        readOnly={readOnly}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        aria-errormessage={hasError ? errorId : undefined}
        className={inputClasses}
        {...props}
      />
    );
  }

  return (
    <div className={cn('w-full', containerClassName)}>
      {label ? (
        <label
          htmlFor={inputId}
          className={cn('mb-2 block text-sm font-medium text-slate-700', labelClassName)}
        >
          {label}
        </label>
      ) : null}

      <div className="relative">
        {leadingAdornment ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            {leadingAdornment}
          </div>
        ) : null}

        <input
          id={inputId}
          ref={ref}
          type={type}
          readOnly={readOnly}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          aria-errormessage={hasError ? errorId : undefined}
          className={inputClasses}
          {...props}
        />

        {trailingAdornment ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
            {trailingAdornment}
          </div>
        ) : null}
      </div>

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
