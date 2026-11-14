'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Input as UIInput, Select as UISelect, Textarea } from '@ui';
import ToggleSwitch from '@/components/forms/ToggleSwitch';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import RepeatFieldDialog from './RepeatFieldDialog';

import {
  DroppedComponent,
  FieldInputType,
  FieldPropertySettings,
  FieldValidationKind,
  Recipient,
} from '@/types/types';
import { supportsReadOnlySetting, validateFieldValue } from '@/lib/field-rules';
import { resolveTextInputType, multilineCapableComponents, textLikeComponents, mapToHtmlInputType } from './DroppedComponents';
import { DATE_FORMAT_OPTIONS, DateFormatOption, ensureFourDigitYearFormat, formatForPicker, normalizeDateFormat } from '@/lib/date-formats';
import DatePicker, { type ChangedValue } from 'react-multi-date-picker';

type FieldPatch = Partial<DroppedComponent>;

interface FieldPropertyPanelProps {
  field: DroppedComponent | null;
  recipients: Recipient[];
  isReadOnly?: boolean;
  defaultDateFormat?: string;
  defaultWeekStart?: 'sunday' | 'monday';
  onClose: () => void;
  onUpdateField: (fieldId: number, patch: FieldPatch) => void;
  onAssignRecipient: (fieldId: number, recipientId: string | null) => void;
  onDuplicateField: (field: DroppedComponent) => void;
  onDeleteField: (field: DroppedComponent) => void;
  onRepeatFieldOnPages?: (field: DroppedComponent, pageNumbers: number[]) => void;
  pageCount?: number;
  repeatCoveredPageNumbers?: number[];
}

const dateLikeComponents = new Set(['Date']);
const dropdownLikeComponents = new Set(['Dropdown']);
const checkboxLikeComponents = new Set(['Checkbox']);
const radioLikeComponents = new Set(['Radio']);
const contentlessComponents = new Set(['Signature', 'Image', 'Live Photo', 'Initials', 'Stamp']);
const placeholderCapableComponents = new Set(['Text', 'Full Name', 'Email', 'Dropdown']);
const defaultValueCapableComponents = new Set(['Text', 'Full Name', 'Email', 'Date', 'Dropdown', 'Radio']);

const inputTypeOptions: Array<{ value: FieldInputType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
];

const validationOptions: Array<{ value: FieldValidationKind; label: string }> = [
  { value: 'none', label: 'No validation' },
  { value: 'email', label: 'Email format' },
  { value: 'regex', label: 'Regex pattern' },
  { value: 'number', label: 'Numeric only' },
  { value: 'date', label: 'Date format' },
];

const validationOptionsByKind = new Map<FieldValidationKind, { value: FieldValidationKind; label: string }>(
  validationOptions.map((option) => [option.value, option])
);

const fieldSettingsSchema = z.object({
  label: z.string().max(500).optional().or(z.literal('')),
  placeholder: z.string().max(500).optional().or(z.literal('')),
  defaultValue: z.string().max(2000).optional().or(z.literal('')),
  hint: z.string().max(1000).optional().or(z.literal('')),
  checkedValue: z.string().max(200).optional().or(z.literal('')),
  uncheckedValue: z.string().max(200).optional().or(z.literal('')),
  optionsText: z.string().optional().or(z.literal('')),
  minLength: z.string().optional(),
  maxLength: z.string().optional(),
  maxLines: z.string().optional(),
  minValue: z.string().optional(),
  maxValue: z.string().optional(),
  validationPattern: z.string().optional().or(z.literal('')),
  validationMessage: z.string().optional().or(z.literal('')),
});

type FieldSettingsFormValues = z.infer<typeof fieldSettingsSchema>;

const resolveAllowedValidationKinds = (
  component: string | undefined,
  inputType: FieldInputType
): FieldValidationKind[] => {
  switch (component) {
  case 'Date':
    return ['none', 'date'];
  case 'Text':
  case 'Email':
    if (inputType === 'email') return ['none', 'email'];
    if (inputType === 'number') return ['none', 'number'];
    if (inputType === 'phone') return ['none', 'regex'];
    return ['none', 'regex'];
  case 'Full Name':
    return ['none', 'regex'];
  default:
    return ['none'];
  }
};

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolValue(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

// since normalizeDateFormat already handles note stripping we don't need extra code
const getPickerFormat = normalizeDateFormat;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-b  p-3 bg-white">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">{title}</h3>
    <div className="space-y-3">{children}</div>
  </section>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-xs font-medium text-slate-700">{children}</label>
);

const LabelWithHint: React.FC<{ label: string; hint: string }> = ({ label, hint }) => (
  <div className="relative inline-flex items-center gap-1 group">
    <Label>{label}</Label>
    <button
      type="button"
      tabIndex={0}
      aria-label={`${label} help`}
      className="text-slate-400 hover:text-slate-600 focus:text-slate-600"
    >
      <CircleHelp size={13} />
    </button>
    <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-600 shadow-lg group-hover:block group-focus-within:block">
      {hint}
    </div>
  </div>
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return (
      <UIInput
        {...props}
        ref={ref}
        className={`mt-1 ${className}`}
      />
    );
  }
);

const FieldPropertyPanel: React.FC<FieldPropertyPanelProps> = ({
  field,
  recipients,
  isReadOnly = false,
  defaultDateFormat,
  defaultWeekStart,
  onClose,
  onUpdateField,
  onAssignRecipient,
  onDuplicateField,
  onDeleteField,
  onRepeatFieldOnPages,
  pageCount = 1,
  repeatCoveredPageNumbers = [],
}) => {
  const [recipientMenuOpen, setRecipientMenuOpen] = useState(false);
  const [repeatDialogOpen, setRepeatDialogOpen] = useState(false);
  const recipientMenuRef = useRef<HTMLDivElement | null>(null);
  const settings = useMemo<FieldPropertySettings>(() => field?.settings || {}, [field?.settings]);
  const isTextLike = Boolean(field && textLikeComponents.has(field.component));
  const isFullNameField = field?.component === 'Full Name';
  const textInputType = useMemo<FieldInputType>(
    () => resolveTextInputType(field?.component, settings),
    [field?.component, settings]
  );
  const supportsMultiline = Boolean(
    field &&
    multilineCapableComponents.has(field.component) &&
    textInputType === 'text'
  );
  const isDateLike = Boolean(field && dateLikeComponents.has(field.component));
  const isDropdownLike = Boolean(field && dropdownLikeComponents.has(field.component));
  const isCheckboxLike = Boolean(field && checkboxLikeComponents.has(field.component));
  const isRadioLike = Boolean(field && radioLikeComponents.has(field.component));
  const isChoiceControl = isCheckboxLike || isRadioLike;
  const isEmailField = field?.component === 'Email';
  const isAssigned = !!field?.assignedRecipientId;
  const isContentlessField = Boolean(field && contentlessComponents.has(field.component));
  const supportsReadOnlyToggle = Boolean(field && supportsReadOnlySetting({ component: field.component }));
  const isReadOnlyEnabled = supportsReadOnlyToggle && boolValue(settings.readOnly, false);
  const allowResizeInSigning = boolValue(settings.allowResize, false);
  const isRecipientOwned = (field?.fieldOwner || 'recipients') === 'recipients';
  const isRecipientDateField = Boolean(isDateLike && isRecipientOwned);
  const fallbackDateFormat = ensureFourDigitYearFormat(defaultDateFormat || 'DD/MM/YYYY (EU)');
  const weekStartDayIndex = defaultWeekStart === 'monday' ? 1 : 0;
  const normalizedDateFormat = settings.dateFormat ? ensureFourDigitYearFormat(settings.dateFormat) : settings.dateFormat;
  const normalizedDefaultDateValue =
    isDateLike && settings.defaultValue
      ? formatForPicker(String(settings.defaultValue), getPickerFormat(normalizedDateFormat)) ||
        String(settings.defaultValue)
      : settings.defaultValue || '';

  const supportsPlaceholder = Boolean(field && placeholderCapableComponents.has(field.component));
  const supportsDefaultValue = Boolean(field && defaultValueCapableComponents.has(field.component));
  const allowedValidationKinds = useMemo<FieldValidationKind[]>(
    () => resolveAllowedValidationKinds(field?.component, textInputType),
    [field?.component, textInputType]
  );
  const allowedValidationOptions = useMemo(
    () =>
      allowedValidationKinds
        .map((kind) => validationOptionsByKind.get(kind))
        .filter((option): option is { value: FieldValidationKind; label: string } => Boolean(option)),
    [allowedValidationKinds]
  );
  const allowedValidationKindSet = useMemo(
    () => new Set<FieldValidationKind>(allowedValidationKinds),
    [allowedValidationKinds]
  );

  const {
    register: registerSettingsForm,
    reset: resetSettingsForm,
    getValues: getSettingsFormValues,
  } = useForm<FieldSettingsFormValues>({
    mode: 'onBlur',
    defaultValues: {
      label: settings.label || '',
      placeholder: field?.placeholder || '',
      defaultValue: settings.defaultValue || '',
      hint: settings.hint || '',
      checkedValue: settings.checkedValue || '',
      uncheckedValue: settings.uncheckedValue || '',
      optionsText: Array.isArray(settings.options) ? settings.options.join('\n') : '',
      minLength: settings.minLength != null ? String(settings.minLength) : '',
      maxLength: settings.maxLength != null ? String(settings.maxLength) : '',
      maxLines: settings.maxLines != null ? String(settings.maxLines) : '',
      minValue: settings.minValue != null ? String(settings.minValue) : '',
      maxValue: settings.maxValue != null ? String(settings.maxValue) : '',
      validationPattern: settings.validationPattern || '',
      validationMessage: settings.validationMessage || '',
    },
  });

  useEffect(() => {
    if (!field) return;
    resetSettingsForm({
      label: settings.label || '',
      placeholder: field.placeholder || '',
      defaultValue: settings.defaultValue || '',
      hint: settings.hint || '',
      checkedValue: settings.checkedValue || '',
      uncheckedValue: settings.uncheckedValue || '',
      optionsText: Array.isArray(settings.options) ? settings.options.join('\n') : '',
      minLength: settings.minLength != null ? String(settings.minLength) : '',
      maxLength: settings.maxLength != null ? String(settings.maxLength) : '',
      maxLines: settings.maxLines != null ? String(settings.maxLines) : '',
      minValue: settings.minValue != null ? String(settings.minValue) : '',
      maxValue: settings.maxValue != null ? String(settings.maxValue) : '',
      validationPattern: settings.validationPattern || '',
      validationMessage: settings.validationMessage || '',
    });
  }, [field, resetSettingsForm, settings]);

  const availableRecipients = useMemo(
    () => recipients.filter((recipient) => !recipient.isCC),
    [recipients]
  );
  const assignedRecipientId = field?.assignedRecipientId?.trim() || '';
  const selectedRecipient = useMemo(
    () => availableRecipients.find((recipient) => recipient.id === assignedRecipientId),
    [assignedRecipientId, availableRecipients]
  );

  const updateSettings = (patch: Partial<FieldPropertySettings>) => {
    if (!field || isReadOnly) return;
    onUpdateField(field.id, {
      settings: {
        ...settings,
        ...patch,
      },
    });
  };

  const syncFormToField = useCallback(() => {
    if (!field || isReadOnly) return;
    const rawValues = getSettingsFormValues();
    const parsed = fieldSettingsSchema.safeParse(rawValues);
    if (!parsed.success) {
      return;
    }
    const v = parsed.data;

    const toInt = (val?: string) => {
      if (!val) return undefined;
      const n = Number(val);
      return Number.isFinite(n) ? Math.round(n) : undefined;
    };
    const toNumberOrUndefined = (val?: string) => {
      if (!val) return undefined;
      const n = Number(val);
      return Number.isFinite(n) ? n : undefined;
    };

    const settingsPatch: Partial<FieldPropertySettings> = {
      label: v.label ?? '',
      hint: v.hint ?? '',
      checkedValue: v.checkedValue ?? '',
      uncheckedValue: v.uncheckedValue ?? '',
      minLength: toInt(v.minLength),
      maxLength: toInt(v.maxLength),
      maxLines: toInt(v.maxLines),
      minValue: toNumberOrUndefined(v.minValue),
      maxValue: toNumberOrUndefined(v.maxValue),
      validationPattern: v.validationPattern ?? '',
      validationMessage: v.validationMessage ?? '',
      options: (v.optionsText ?? '').split('\n'),
    };

    if ((v.defaultValue ?? '') !== (settings.defaultValue ?? '')) {
      settingsPatch.defaultValue = v.defaultValue ?? '';
    }

    const patch: FieldPatch = {
      settings: settingsPatch,
    };

    if (v.placeholder !== undefined) {
      patch.placeholder = v.placeholder;
    }

    onUpdateField(field.id, patch);
  }, [field, getSettingsFormValues, isReadOnly, onUpdateField, settings]);

  const handleAllowResizeChange = (checked: boolean) => {
    if (!field || isReadOnly) return;
    if (isReadOnlyEnabled && checked) return;
    updateSettings({ allowResize: checked });
  };

  const handleReadOnlyChange = (checked: boolean) => {
    if (!field || isReadOnly) return;
    if (checked) {
      updateSettings({ readOnly: true, allowResize: false });
      return;
    }
    updateSettings({ readOnly: false });
  };

  const updateNumberProperty = (key: 'x' | 'y' | 'width' | 'height' | 'pageNumber', value: string) => {
    if (!field || isReadOnly) return;
    const num = toNumber(value);
    if (num === undefined) return;
    const finalNumber = key === 'pageNumber' ? Math.max(1, Math.round(num)) : Math.max(0, Math.round(num));
    onUpdateField(field.id, { [key]: finalNumber } as FieldPatch);
  };

  const configuredValidationKind = settings.validationKind || 'none';
  const validationKind = allowedValidationKindSet.has(configuredValidationKind)
    ? configuredValidationKind
    : 'none';
  const showValidationRuleSelect = allowedValidationOptions.length > 1;
  const showValidationSection =
    showValidationRuleSelect || isTextLike || isDateLike || isCheckboxLike || isDropdownLike || isRadioLike;

  // when the field type/input implies a specific rule but none is configured,
  // automatically choose a sensible default. also ensure any existing configured
  // kind is valid for the current field. once a user or this effect writes a
  // value to `settings.validationKind`, we treat it as explicit and stop
  // auto‑assigning on subsequent updates.
  useEffect(() => {
    if (!field || isReadOnly) return;

    const hasExplicitValidationKind =
      settings && Object.prototype.hasOwnProperty.call(settings, 'validationKind');

    let desiredKind: FieldValidationKind = configuredValidationKind;
    if (!allowedValidationKindSet.has(desiredKind)) {
      // configured value no longer allowed
      desiredKind = 'none';
    }

    if (!hasExplicitValidationKind && desiredKind === 'none' && allowedValidationKinds.length > 1) {
      if (field.component === 'Date') {
        desiredKind = 'date';
      } else if (field.component === 'Email') {
        desiredKind = 'email';
      } else if (field.component === 'Text' || field.component === 'Full Name') {
        if (textInputType === 'email') desiredKind = 'email';
        else if (textInputType === 'number') desiredKind = 'number';
        else if (textInputType === 'phone') desiredKind = 'regex';
      }
    }

    if (desiredKind !== configuredValidationKind) {
      onUpdateField(field.id, { settings: { validationKind: desiredKind } });
    }
  }, [allowedValidationKindSet, allowedValidationKinds.length, configuredValidationKind, field, isReadOnly, onUpdateField, textInputType, settings]);

  // if a date format is entered, ensure the validation kind is set to date as
  // long as the field supports it.
  useEffect(() => {
    if (
      !field ||
      isReadOnly ||
      !settings.dateFormat ||
      validationKind === 'date' ||
      !allowedValidationKindSet.has('date')
    ) {
      return;
    }
    onUpdateField(field.id, { settings: { validationKind: 'date' } });
  }, [field, isReadOnly, settings.dateFormat, validationKind, allowedValidationKindSet, onUpdateField]);

  // ensure date fields always have a format; default to user preference when missing
  useEffect(() => {
    if (
      !field ||
      isReadOnly ||
      field.component !== 'Date' ||
      settings.dateFormat
    ) {
      return;
    }
    onUpdateField(field.id, { settings: { dateFormat: fallbackDateFormat } });
  }, [fallbackDateFormat, field, isReadOnly, settings.dateFormat, onUpdateField]);

  useEffect(() => {
    if (!field || isReadOnly || field.component !== 'Date' || !settings.dateFormat) {
      return;
    }
    if (normalizedDateFormat && normalizedDateFormat !== settings.dateFormat) {
      onUpdateField(field.id, { settings: { dateFormat: normalizedDateFormat } });
    }
  }, [field, isReadOnly, normalizedDateFormat, onUpdateField, settings.dateFormat]);


  // when format is ISO and a default value exists, coerce it to YYYY-MM-DD
  useEffect(() => {
    if (
      !field ||
      isReadOnly ||
      field.component !== 'Date' ||
      !settings.defaultValue ||
      !settings.dateFormat ||
      !settings.dateFormat.includes('YYYY-MM-DD')
    ) {
      return;
    }

    let val = String(settings.defaultValue);
    // handle simple mm-dd-yy input manually (common shorthand)
    const mdy = val.match(/^(\d{2})-(\d{2})-(\d{2})$/);
    if (mdy) {
      const [, mm, dd, yy] = mdy;
      val = `20${yy}-${mm}-${dd}`;
    }

    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      // use UTC to avoid timezone shift
      const iso = d.toISOString().slice(0, 10);
      if (iso !== String(settings.defaultValue)) {
        onUpdateField(field.id, { settings: { defaultValue: iso } });
      }
    }
  }, [field, isReadOnly, settings.defaultValue, settings.dateFormat, onUpdateField]);

  // when the dateFormat setting changes, reformat any existing defaultValue
  useEffect(() => {
    if (
      !field ||
      isReadOnly ||
      field.component !== 'Date' ||
      !settings.dateFormat
    ) {
      return;
    }

    const current = String(settings.defaultValue || '');

    // when switching to ISO, try to parse & convert; only clear if unparseable
    if (settings.dateFormat.includes('YYYY-MM-DD')) {
      if (current) {
        // use our formatter to convert; handles EU/US and mm-dd-yy cleanly
        const iso = formatForPicker(current, 'YYYY-MM-DD');
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso)) {
          // conversion failed/invalid => clear
          onUpdateField(field.id, { settings: { defaultValue: '' } });
          return;
        }
        if (iso !== current) {
          onUpdateField(field.id, { settings: { defaultValue: iso } });
        }
        return;
      }
      return;
    }

    if (current) {
      const reformatted = formatForPicker(current, settings.dateFormat);
      if (reformatted !== current) {
        onUpdateField(field.id, { settings: { defaultValue: reformatted } });
      }
    }
  }, [field, isReadOnly, settings.defaultValue, settings.dateFormat, onUpdateField]);

  useEffect(() => {
    if (!recipientMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (recipientMenuRef.current?.contains(target)) return;
      setRecipientMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [recipientMenuOpen]);

  useEffect(() => {
    if (!field || isReadOnly || !supportsReadOnlyToggle) return;
    if (settings.readOnly === true && settings.allowResize === true) {
      onUpdateField(field.id, { settings: { allowResize: false } });
    }
  }, [field, isReadOnly, onUpdateField, settings.allowResize, settings.readOnly, supportsReadOnlyToggle]);

  if (!field) {
    return (
      <aside data-field-property-panel="true" className="w-70 h-full border-l border-slate-200 bg-slate-50 p-4 shadow-2xl">
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 bg-white">
          Select a field to edit properties.
        </div>
      </aside>
    );
  }

  const effectiveRequired = boolValue(field.required, true);
  const repeatTargetPageCount = Math.max(0, pageCount - 1);
  const coveredRepeatTargetPageCount = repeatCoveredPageNumbers.filter(
    (pageNumber) => pageNumber !== (field.pageNumber ?? 1)
  ).length;
  const repeatGroupComplete =
    repeatTargetPageCount > 0 && coveredRepeatTargetPageCount >= repeatTargetPageCount;
  const canRepeatField = Boolean(
    onRepeatFieldOnPages &&
    !isReadOnly &&
    repeatTargetPageCount > 0 &&
    !repeatGroupComplete
  );

  return (
    <aside data-field-property-panel="true" className="w-70 h-full border-l border-slate-200 bg-slate-50 flex flex-col min-h-0 shadow-2xl">
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Field Properties</h2>
          <p className="text-xs text-slate-500">{field.component} #{field.fieldId ?? field.id}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 text-slate-500 hover:bg-slate-100"
          aria-label="Close properties panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="overflow-auto">
        <Section title="Layout">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>X</Label>
              <Input
                type="number"
                defaultValue={Math.round(field.x)}
                disabled={isReadOnly}
                onBlur={(e) => updateNumberProperty('x', e.target.value)}
              />
            </div>
            <div>
              <Label>Y</Label>
              <Input
                type="number"
                defaultValue={Math.round(field.y)}
                disabled={isReadOnly}
                onBlur={(e) => updateNumberProperty('y', e.target.value)}
              />
            </div>
            <div>
              <Label>Width</Label>
              <Input
                type="number"
                defaultValue={Math.round(field.width)}
                disabled={isReadOnly}
                onBlur={(e) => updateNumberProperty('width', e.target.value)}
              />
            </div>
            <div>
              <Label>Height</Label>
              <Input
                type="number"
                defaultValue={Math.round(field.height)}
                disabled={isReadOnly}
                onBlur={(e) => updateNumberProperty('height', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label>Page</Label>
              <Input
                type="number"
                min={1}
                defaultValue={field.pageNumber ?? 1}
                disabled={isReadOnly}
                onBlur={(e) => updateNumberProperty('pageNumber', e.target.value)}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Moves this field to the selected page and keeps its relative position.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Repeat">
          <button
            type="button"
            disabled={!canRepeatField}
            onClick={() => setRepeatDialogOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white"
          >
            <Copy size={14} /> {repeatGroupComplete ? 'Already repeated' : 'Repeat...'}
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            {repeatGroupComplete
              ? 'This field already appears on every page'
              : repeatTargetPageCount > 0
              ? `${repeatTargetPageCount} other ${repeatTargetPageCount === 1 ? 'page' : 'pages'}`
              : 'Only one page available'}
          </p>
        </Section>

        <Section title="Assignment">
          <div>
            <Label>Field Owner</Label>
            <Input
              value={(field.fieldOwner || 'recipients') === 'me' ? 'Me (Fill now)' : 'Recipients'}
              readOnly
              disabled
            />
          </div>

          {(field.fieldOwner || 'recipients') === 'recipients' && (
            <div>
              <Label>Recipient</Label>
              <div className="relative mt-1" ref={recipientMenuRef}>
                <button
                  type="button"
                  disabled={isReadOnly}
                  aria-haspopup="listbox"
                  aria-expanded={recipientMenuOpen}
                  onClick={() => {
                    setRecipientMenuOpen((open) => !open);
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 outline-hidden transition focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                      style={{ backgroundColor: selectedRecipient?.color || '#6B7280' }}
                    >
                      {selectedRecipient?.name?.charAt(0)?.toUpperCase() || <User className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{selectedRecipient?.name || 'Unassigned'}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${recipientMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {recipientMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Recipient options"
                    className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onAssignRecipient(field.id, null);
                        setRecipientMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 border-b border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-400 text-white">
                        <User className="h-2.5 w-2.5" />
                      </span>
                      <span className="flex-1">Unassigned</span>
                      {!assignedRecipientId && <Check className="h-4 w-4 text-brand-600" />}
                    </button>
                    <div className="max-h-64 overflow-auto py-1">
                      {availableRecipients.map((recipient) => {
                        const isDisabled = recipient.role === 'viewer' || recipient.role === 'approver';
                        const isSelected = assignedRecipientId === recipient.id;
                        return (
                          <button
                            key={recipient.id}
                            type="button"
                            disabled={isDisabled}
                            title={isDisabled ? 'Viewers and approvers cannot be assigned fields.' : recipient.name}
                            onClick={() => {
                              if (isDisabled) return;
                              onAssignRecipient(field.id, recipient.id);
                              setRecipientMenuOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                              isDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                              style={{ backgroundColor: recipient.color }}
                            >
                              {recipient.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-slate-800">{recipient.name}</span>
                              <span className="block truncate text-xs text-slate-500">{recipient.email}</span>
                            </span>
                            {isSelected && <Check className="h-4 w-4 text-brand-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        <Section title="Behavior">
          <ToggleSwitch
            label="Required"
            checked={effectiveRequired}
            disabled={isReadOnly}
            onChange={(checked) => onUpdateField(field.id, { required: checked })}
          />
          {supportsReadOnlyToggle && (
            <ToggleSwitch
              label="Read only"
              checked={boolValue(settings.readOnly, false)}
              disabled={isReadOnly}
              onChange={handleReadOnlyChange}
            />
          )}
          {supportsMultiline && (
            <ToggleSwitch
              label="Multiline"
              checked={boolValue(settings.multiline, true)}
              disabled={isReadOnly}
              onChange={(checked) => updateSettings({ multiline: checked })}
            />
          )}
          <ToggleSwitch
            label="Allow Resize"
            checked={allowResizeInSigning}
            disabled={isReadOnly || isReadOnlyEnabled}
            onChange={handleAllowResizeChange}
            description={<div className='w-[200px]'>When enabled, recipients can resize this field in Signing</div>}
          />
        
        </Section>

        {!isContentlessField && (
          <Section title="Content">
            <div>
              <LabelWithHint
                label="Label"
                hint={
                  isChoiceControl
                    ? 'Label shown next to the control. You can use line breaks for longer text (for example Terms and Conditions).'
                    : 'Permanent field name shown to users. Example: Signer Email.'
                }
              />
              {isChoiceControl ? (
                <Textarea
                  disabled={isReadOnly}
                  {...registerSettingsForm('label', {
                    onBlur: () => syncFormToField(),
                  })}
                  placeholder="Visible field label"
                  rows={3}
                  className="mt-1 min-h-0 border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500"
                />
              ) : (
                <Input
                  disabled={isReadOnly}
                  {...registerSettingsForm('label', {
                    onBlur: () => syncFormToField(),
                  })}
                  placeholder="Visible field label"
                />
              )}
            </div>

            {supportsPlaceholder && (
              <div>
                <LabelWithHint
                  label="Placeholder"
                  hint="Temporary hint inside the input. It disappears when a value is entered."
                />
                <Input
                  disabled={isReadOnly}
                  {...registerSettingsForm('placeholder', {
                    onBlur: () => syncFormToField(),
                  })}
                  placeholder="Hint shown inside field"
                />
              </div>
            )}

            {supportsDefaultValue && (
              <div>
                <LabelWithHint label={textInputType === 'email' ? 'Email Address' : 'Default Value'} hint={textInputType === 'email' ? 'Email address for this field.' : 'Pre-filled value used when the field is empty.'} />
                {/**
                 * Always render the third‑party date picker for date fields.
                    * It supports all formats and replaces any native browser control.
                     */}
                {isDateLike && (
                  <DatePicker
                    key={`date-default-${field?.id ?? 'none'}-${normalizedDefaultDateValue || 'empty'}`}
                    value={normalizedDefaultDateValue}
                    format={getPickerFormat(normalizedDateFormat)}
                    weekStartDayIndex={weekStartDayIndex}
                    onChange={(date: ChangedValue) => {
                      if (isRecipientDateField) return;
                      // date-fns returns object, convert to string
                      const str = date
                        ? date.format?.(getPickerFormat(normalizedDateFormat)) || String(date)
                        : '';
                      updateSettings({ defaultValue: str });
                    }}
                    onOpenPickNewDate={!isRecipientDateField}
                    disabled={isReadOnly || isRecipientDateField}
                    data-testid="date-picker"
                    placeholder={normalizedDateFormat && !DATE_FORMAT_OPTIONS.includes(normalizedDateFormat as DateFormatOption) ? normalizedDateFormat : ''}
                    render={(value, openCalendar) => (
                      <div className="relative">
                        <UIInput
                          value={value}
                          onClick={openCalendar}
                          readOnly
                          disabled={isReadOnly || isRecipientDateField}
                          placeholder={
                            normalizedDateFormat && !DATE_FORMAT_OPTIONS.includes(normalizedDateFormat as DateFormatOption)
                              ? normalizedDateFormat
                              : ''
                          }
                          className="rmdp-input w-full rounded-md border border-slate-300 px-2 py-1.5 pr-8 text-sm outline-hidden focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                        {value && !isReadOnly && (
                          <button
                            type="button"
                            aria-label="Clear date"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              updateSettings({ defaultValue: '' });
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  />
                )}
                {!isDateLike &&
                  (() => {
                    if (isEmailField) {
                      return (
                        <Input
                          type={mapToHtmlInputType(textInputType)}
                          value={field.data || ''}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            if (!field || isReadOnly) return;
                            onUpdateField(field.id, { data: e.target.value });
                          }}
                          placeholder={isAssigned ? selectedRecipient?.email || 'Recipient email' : 
                            textInputType === 'email' ? 'e.g., name@example.com' :
                            textInputType === 'phone' ? 'e.g., +12223334444' :
                            textInputType === 'number' ? 'e.g., 123' :
                            'Enter custom value'
                          }
                        />
                      );
                    }
                    return (
                      <Input
                        type={mapToHtmlInputType(textInputType)}
                        disabled={isReadOnly}
                        {...registerSettingsForm('defaultValue', {
                          onBlur: () => syncFormToField(),
                        })}
                        placeholder={
                          textInputType === 'email' ? 'e.g., name@example.com' :
                          textInputType === 'phone' ? 'e.g., +12223334444' :
                          textInputType === 'number' ? 'e.g., 123' :
                          'Optional preset'
                        }
                      />
                    );
                  })()}

                {/** show validation error for default value */}
                {(() => {
                  const val = isEmailField ? field.data : settings.defaultValue;
                  if (val && val.toString().trim()) {
                    const validation = validateFieldValue({
                      component: field?.component,
                      required: false,
                      value: val,
                      settings,
                    });
                    if (!validation.valid) {
                      return (
                        <p className="mt-1 text-xs text-red-600">
                          {validation.reason || 'Invalid default value.'}
                        </p>
                      );
                    }
                  }
                  return null;
                })()}
              </div>
            )}
          </Section>
        )}

        <Section title="Help">
          <div>
            <LabelWithHint
              label="Help Text"
              hint="Extra guidance shown to signers via the help icon on the field."
            />
            <Input
              disabled={isReadOnly}
              {...registerSettingsForm('hint', {
                onBlur: () => syncFormToField(),
              })}
              placeholder="Recipient guidance"
            />
          </div>
        </Section>

        {showValidationSection && (
          <Section title="Validation">
            {isTextLike && !isFullNameField && (
              <div>
                <Label>Input Type</Label>
                <UISelect
                  value={textInputType}
                  disabled={isReadOnly}
                  onChange={(e) => {
                    const nextInputType = e.target.value as FieldInputType;
                    const nextAllowedKinds = new Set(
                      resolveAllowedValidationKinds(field.component, nextInputType)
                    );
                    let nextValidationKind = validationKind;
                    if (nextInputType === 'email') {
                      nextValidationKind = 'email';
                    } else if (nextInputType === 'number') {
                      nextValidationKind = 'number';
                    } else if (!nextAllowedKinds.has(nextValidationKind)) {
                      nextValidationKind = 'none';
                    }
                    updateSettings({
                      inputType: nextInputType,
                      validationKind: nextValidationKind,
                      ...(nextInputType !== 'text' ? { multiline: false } : {}),
                    });
                  }}
                >
                  {inputTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </UISelect>
              </div>
            )}

            {showValidationRuleSelect && (
              <div>
                <Label>Validation Rule</Label>
                <UISelect
                  value={validationKind}
                  disabled={isReadOnly}
                  onChange={(e) => updateSettings({ validationKind: e.target.value as FieldValidationKind })}
                >
                  {allowedValidationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </UISelect>
              </div>
            )}

            {isTextLike && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Min Characters</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={isReadOnly}
                    {...registerSettingsForm('minLength', {
                      onBlur: () => syncFormToField(),
                    })}
                  />
                </div>
                <div>
                  <Label>Characters Limit</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={isReadOnly}
                    {...registerSettingsForm('maxLength', {
                      onBlur: () => syncFormToField(),
                    })}
                  />
                </div>
                {supportsMultiline && boolValue(settings.multiline, true) && (
                  <div className="col-span-2">
                    <Label>Lines Limit</Label>
                    <Input
                      type="number"
                      min={1}
                      disabled={isReadOnly}
                      {...registerSettingsForm('maxLines', {
                        onBlur: () => syncFormToField(),
                      })}
                    />
                  </div>
                )}
              </div>
            )}

            {isFullNameField && (
              <p className="text-[11px] text-slate-500">
                Full Name uses built-in validation: accepts single or multiple words and blocks numeric characters.
              </p>
            )}

            {validationKind === 'regex' && (
              <>
                <div>
                  <Label>Regex Pattern</Label>
                  <Input
                    disabled={isReadOnly}
                    {...registerSettingsForm('validationPattern', {
                      onBlur: () => syncFormToField(),
                    })}
                    placeholder="e.g. ^[A-Z0-9]{6,}$"
                  />
                </div>
                <div>
                  <Label>Validation Message</Label>
                  <Input
                    disabled={isReadOnly}
                    {...registerSettingsForm('validationMessage', {
                      onBlur: () => syncFormToField(),
                    })}
                    placeholder="Shown when validation fails"
                  />
                </div>
              </>
            )}

            {validationKind === 'number' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Min Value</Label>
                  <Input
                    type="number"
                    disabled={isReadOnly}
                    {...registerSettingsForm('minValue', {
                      onBlur: () => syncFormToField(),
                    })}
                  />
                </div>
                <div>
                  <Label>Max Value</Label>
                  <Input
                    type="number"
                    disabled={isReadOnly}
                    {...registerSettingsForm('maxValue', {
                      onBlur: () => syncFormToField(),
                    })}
                  />
                </div>
              </div>
            )}

            {(validationKind === 'date' || isDateLike) && (
              <div>
                <Label>Date Format</Label>
                <div className="flex items-center gap-2">
                  <UISelect
                    value={
                      DATE_FORMAT_OPTIONS.includes(settings.dateFormat as DateFormatOption)
                        ? settings.dateFormat
                        : fallbackDateFormat
                    }
                    disabled={isReadOnly}
                    onChange={(e) => {
                      updateSettings({ dateFormat: ensureFourDigitYearFormat(e.target.value) });
                    }}
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    {DATE_FORMAT_OPTIONS.map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {fmt}
                      </option>
                    ))}
                  </UISelect>
                </div>
              </div>
            )}

            {isCheckboxLike && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Checked Value</Label>
                  <Input
                    disabled={isReadOnly}
                    {...registerSettingsForm('checkedValue', {
                      onBlur: () => syncFormToField(),
                    })}
                  />
                </div>
                <div>
                  <Label>Unchecked Value</Label>
                  <Input
                    disabled={isReadOnly}
                    {...registerSettingsForm('uncheckedValue', {
                      onBlur: () => syncFormToField(),
                    })}
                  />
                </div>
              </div>
            )}

            {(isDropdownLike || isRadioLike) && (
              <div>
                <Label>{isRadioLike ? 'Radio Options (one per line)' : 'Dropdown Options (one per line)'}</Label>
                <Textarea
                  disabled={isReadOnly}
                  {...registerSettingsForm('optionsText', {
                    onBlur: () => syncFormToField(),
                  })}
                  className="mt-1 min-h-20 border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500"
                />
                {isRadioLike && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Each line creates one option. Long option text wraps automatically in the field.
                  </p>
                )}
              </div>
            )}
          </Section>
        )}
      </div>

      {onRepeatFieldOnPages && repeatDialogOpen && (
        <RepeatFieldDialog
          open={repeatDialogOpen}
          field={field}
          pageCount={pageCount}
          coveredPageNumbers={repeatCoveredPageNumbers}
          onClose={() => setRepeatDialogOpen(false)}
          onConfirm={(pageNumbers) => onRepeatFieldOnPages(field, pageNumbers)}
        />
      )}

      <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center gap-2">
        <button
          type="button"
          disabled={isReadOnly}
          onClick={() => onDuplicateField(field)}
          className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Copy size={14} /> Duplicate
        </button>
        <button
          type="button"
          disabled={isReadOnly}
          onClick={() => onDeleteField(field)}
          className="inline-flex items-center justify-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </aside>
  );
};

export default FieldPropertyPanel;
