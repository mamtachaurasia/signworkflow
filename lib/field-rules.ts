import { FieldInputType, FieldPropertySettings } from '@/types/types';
import { ensureFourDigitYearFormat } from '@/lib/date-formats';

export interface FieldRuleSubject {
  component?: string | null;
  type?: string | null;
  required?: boolean;
  value?: unknown;
  settings?: FieldPropertySettings;
}

export interface FieldValidationResult {
  valid: boolean;
  reason?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMERIC_ONLY_REGEX = /^-?\d+(\.\d+)?$/;
const FULL_NAME_ALLOWED_REGEX = /^[\p{L}\p{M}][\p{L}\p{M}'.\- ]*$/u;
const DEFAULT_CHECKBOX_CHECKED_VALUE = 'true';
const TEXT_INPUT_TYPES = new Set<FieldInputType>(['text', 'email', 'phone', 'number']);
const TEXT_LINE_LIMIT_KINDS = new Set(['text', 'email', 'phone', 'number', 'full_name']);
const READ_ONLY_UNSUPPORTED_KINDS = new Set(['signature', 'initials', 'stamp', 'image', 'live_photo']);

function normalizeKind(subject: FieldRuleSubject): string {
  const component = String(subject.component || '').trim().toLowerCase();
  if (component) {
    return component.replace(/\s+/g, '_');
  }
  return String(subject.type || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function stringifyValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  return String(raw);
}

function isEmpty(raw: unknown): boolean {
  return stringifyValue(raw).trim().length === 0;
}

// buildDateRegex is intentionally exported for unit tests.
export function buildDateRegex(format: string): RegExp | null {
  const trimmed = format.trim();
  if (!trimmed) return null;

  // user-facing formats sometimes include explanatory notes in parentheses
  // (e.g. "MM/DD/YYYY (US)").  Remove anything inside parentheses so that
  // the pattern we generate only reflects the date tokens and separators.
  const withoutNotes = ensureFourDigitYearFormat(trimmed.replace(/\(.*?\)/g, '').trim());

  // normalize token casing so that "yyyy-mm-dd" and "YYYY-MM-DD" behave
  // identically.
  const patternText = withoutNotes
    .replace(/yyyy/gi, 'YYYY')
    .replace(/mm/gi, 'MM')
    .replace(/dd/gi, 'DD');

  const escaped = patternText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped
    .replace(/YYYY/g, '(\\d{4})')
    .replace(/MM/g, '(0[1-9]|1[0-2])')
    .replace(/DD/g, '(0[1-9]|[12]\\d|3[01])');

  try {
    return new RegExp(`^${pattern}$`);
  } catch {
    return null;
  }
}

function getFieldKind(subject: FieldRuleSubject): string {
  const normalized = normalizeKind(subject);
  if (normalized === 'full_name') return 'full_name';

  const inputType = String(subject.settings?.inputType || '').trim().toLowerCase();
  if (TEXT_INPUT_TYPES.has(inputType as FieldInputType)) {
    return inputType;
  }
  if (normalized === 'e_mail') return 'email';
  return normalized;
}

export function supportsReadOnlySetting(subject: Pick<FieldRuleSubject, 'component' | 'type'>): boolean {
  const normalized = normalizeKind(subject as FieldRuleSubject);
  if (!normalized) return true;
  return !READ_ONLY_UNSUPPORTED_KINDS.has(normalized);
}

function isValidFullName(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (/\d/.test(normalized)) return false;
  return FULL_NAME_ALLOWED_REGEX.test(normalized);
}

function getCheckboxCheckedValue(settings: FieldPropertySettings | undefined): string {
  const configured = stringifyValue(settings?.checkedValue).trim();
  return configured || DEFAULT_CHECKBOX_CHECKED_VALUE;
}

function getCheckboxUncheckedValue(settings: FieldPropertySettings | undefined): string {
  return stringifyValue(settings?.uncheckedValue).trim();
}

function isCheckedValue(value: string, checkedValue: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === checkedValue.trim().toLowerCase()) return true;
  return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
}

// exported for unit testing and external logic that needs to know what kind
// of validation will be performed for a given subject.
export function normalizeValidationKind(subject: FieldRuleSubject): 'none' | 'email' | 'regex' | 'number' | 'date' {
  const explicit = String(subject.settings?.validationKind || '').toLowerCase();
  if (explicit === 'none') {
    return 'none';
  }
  if (explicit === 'email' || explicit === 'regex' || explicit === 'number' || explicit === 'date') {
    return explicit;
  }

  const kind = getFieldKind(subject);
  if (kind === 'email') return 'email';
  if (kind === 'number') return 'number';
  if (kind === 'date') return 'date';
  return 'none';
}

function validationMessage(settings: FieldPropertySettings | undefined, fallback: string): string {
  const custom = (settings?.validationMessage || '').trim();
  return custom || fallback;
}

export function getEffectiveFieldValue(subject: FieldRuleSubject): string {
  const currentRaw = subject.value;
  if (currentRaw !== null && currentRaw !== undefined) {
    return stringifyValue(currentRaw);
  }

  return stringifyValue(subject.settings?.defaultValue);
}

export function isFieldValueFilled(subject: FieldRuleSubject): boolean {
  const kind = getFieldKind(subject);
  const effectiveValue = getEffectiveFieldValue(subject);
  if (kind === 'checkbox') {
    return isCheckedValue(effectiveValue, getCheckboxCheckedValue(subject.settings));
  }
  return !isEmpty(effectiveValue);
}

export function validateFieldValue(subject: FieldRuleSubject): FieldValidationResult {
  const settings = subject.settings;
  const kind = getFieldKind(subject);
  const effectiveValue = getEffectiveFieldValue(subject);
  const required = subject.required !== false;

  if (kind === 'checkbox') {
    const checkedValue = getCheckboxCheckedValue(settings);
    const uncheckedValue = getCheckboxUncheckedValue(settings);
    const normalized = effectiveValue.trim();
    const checked = isCheckedValue(effectiveValue, checkedValue);
    const isExplicitUnchecked = normalized.length > 0 && uncheckedValue.length > 0 && normalized === uncheckedValue;

    if (normalized.length > 0 && !checked && !isExplicitUnchecked) {
      return {
        valid: false,
        reason: validationMessage(settings, 'Invalid checkbox value.'),
      };
    }
    if (required && !checked) {
      return {
        valid: false,
        reason: validationMessage(settings, 'Checkbox must be selected.'),
      };
    }
    return { valid: true };
  }

  if (isEmpty(effectiveValue)) {
    return {
      valid: !required,
      reason: required ? validationMessage(settings, 'Field is required.') : undefined,
    };
  }

  if (typeof settings?.minLength === 'number' && effectiveValue.length < settings.minLength) {
    return {
      valid: false,
      reason: validationMessage(settings, `Minimum length is ${settings.minLength}.`),
    };
  }

  if (typeof settings?.maxLength === 'number' && effectiveValue.length > settings.maxLength) {
    return {
      valid: false,
      reason: validationMessage(settings, `Maximum length is ${settings.maxLength}.`),
    };
  }

  if (
    TEXT_LINE_LIMIT_KINDS.has(kind) &&
    typeof settings?.maxLines === 'number' &&
    settings.maxLines > 0
  ) {
    const lineCount = effectiveValue.split(/\r\n|\r|\n/).length;
    if (lineCount > settings.maxLines) {
      return {
        valid: false,
        reason: validationMessage(settings, `Maximum lines is ${settings.maxLines}.`),
      };
    }
  }

  if (kind === 'full_name' && !isValidFullName(effectiveValue)) {
    return {
      valid: false,
      reason: validationMessage(settings, 'Enter a valid name (letters, spaces, apostrophe, hyphen, or dot).'),
    };
  }

  if ((kind === 'dropdown' || kind === 'radio') && Array.isArray(settings?.options) && settings.options.length > 0) {
    const options = settings.options.map((option) => option.trim()).filter(Boolean);
    if (options.length > 0 && !options.includes(effectiveValue)) {
      return {
        valid: false,
        reason: validationMessage(settings, 'Select a valid option from the list.'),
      };
    }
  }

  const validationKind = normalizeValidationKind(subject);

  if (validationKind === 'email' && !EMAIL_REGEX.test(effectiveValue.trim())) {
    return {
      valid: false,
      reason: validationMessage(settings, 'Enter a valid email address.'),
    };
  }

  if (validationKind === 'regex') {
    const pattern = settings?.validationPattern?.trim() || '';
    if (pattern) {
      try {
        const regex = new RegExp(pattern);
        if (!regex.test(effectiveValue)) {
          return {
            valid: false,
            reason: validationMessage(settings, 'Field format is invalid.'),
          };
        }
      } catch {
        return {
          valid: false,
          reason: 'Invalid regex pattern configured for this field.',
        };
      }
    }
  }

  if (validationKind === 'number') {
    if (!NUMERIC_ONLY_REGEX.test(effectiveValue.trim())) {
      return {
        valid: false,
        reason: validationMessage(settings, 'Use numeric values only.'),
      };
    }

    const numeric = Number(effectiveValue);
    if (typeof settings?.minValue === 'number' && numeric < settings.minValue) {
      return {
        valid: false,
        reason: validationMessage(settings, `Minimum value is ${settings.minValue}.`),
      };
    }

    if (typeof settings?.maxValue === 'number' && numeric > settings.maxValue) {
      return {
        valid: false,
        reason: validationMessage(settings, `Maximum value is ${settings.maxValue}.`),
      };
    }
  }

  if (validationKind === 'date') {
    const configuredFormat = settings?.dateFormat?.trim();

    if (configuredFormat) {
      const formatRegex = buildDateRegex(configuredFormat);
      if (formatRegex && !formatRegex.test(effectiveValue)) {
        return {
          valid: false,
          reason: validationMessage(settings, `Date must match format ${configuredFormat}.`),
        };
      }
    } else {
      const isoLike = /^\d{4}-\d{2}-\d{2}$/;
      if (!isoLike.test(effectiveValue)) {
        return {
          valid: false,
          reason: validationMessage(settings, 'Date must be in YYYY-MM-DD format.'),
        };
      }
    }
  }

  return { valid: true };
}
