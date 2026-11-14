import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className = '',
  size = 'md',
}) => {
  const isSmall = size === 'sm';
  const trackClasses = isSmall ? 'h-4 w-8' : 'h-5 w-10';
  const thumbClasses = isSmall ? 'h-3 w-3' : 'h-4 w-4';
  const thumbTranslate = isSmall
    ? (checked ? 'translate-x-4' : 'translate-x-0.5')
    : (checked ? 'translate-x-5' : 'translate-x-0.5');

  return (
    <label className={`flex items-start justify-between gap-3 ${className}`}>
      {(label || description) && (
        <span className="min-w-0">
          {label && (
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
              {label}
            </span>
          )}
          {description && (
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {description}
            </span>
          )}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : 'Toggle'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`${trackClasses} inline-flex items-center rounded-full border p-0.5 transition-colors duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
          checked
            ? 'border-brand-600 bg-brand-600'
            : 'border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`block ${thumbClasses} rounded-full bg-white shadow-xs transition-transform duration-200 ${thumbTranslate}`}
        />
      </button>
    </label>
  );
};

export default ToggleSwitch;
