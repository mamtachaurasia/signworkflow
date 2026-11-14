import { DocumentField, DroppedComponent, FieldOwner, FieldPropertySettings } from '@/types/types';
import { ensureFourDigitYearFormat } from '@/lib/date-formats';
import type { DateFormatOption } from '@/lib/date-formats';
import { resolveAutoResizeDimensions } from '@/utils/builder/fieldLayout';

type FieldLike = DocumentField & {
  fieldId?: unknown;
  fieldOwner?: unknown;
  value?: unknown;
};

const normalizeFieldId = (value: unknown, fallback?: string): string => {
  const str = value !== null && value !== undefined ? String(value) : '';
  if (str.trim().length > 0) return str;
  return fallback ?? '';
};

const allocateNumericId = (preferred: unknown, usedIds: Set<number>): number => {
  const parsed =
    typeof preferred === 'number'
      ? preferred
      : Number.parseInt(String(preferred ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0 && !usedIds.has(parsed)) {
    usedIds.add(parsed);
    return parsed;
  }

  let nextId = usedIds.size > 0 ? Math.max(...Array.from(usedIds)) + 1 : 1;
  while (usedIds.has(nextId)) {
    nextId += 1;
  }
  usedIds.add(nextId);
  return nextId;
};

const toComponentLabel = (type: unknown): string =>
  String(type || '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const resolveComponentLabel = (field: DocumentField): string => {
  const type = String(field.type || '').toLowerCase();
  if (type === 'email') {
    return 'Email';
  }
  if (type === 'text') {
    const inputType = String(field.settings?.inputType || '').toLowerCase();
    const validationKind = String(field.settings?.validationKind || '').toLowerCase();
    if (inputType === 'email' || validationKind === 'email') {
      return 'Email';
    }
  }
  return toComponentLabel(field.type);
};

export const normalizeComponentSettings = (
  component: string | undefined,
  settings: FieldPropertySettings | undefined
): FieldPropertySettings | undefined => {
  const label = String(component || '').trim();
  const normalized: FieldPropertySettings = {
    ...(settings || {}),
  };

  if (label === 'Email') {
    normalized.inputType = 'email';
    normalized.multiline = false;
  } else if (label === 'Full Name') {
    normalized.multiline = false;
  }

  if (label === 'Date' && typeof normalized.dateFormat === 'string' && normalized.dateFormat) {
    const coercedFormat = ensureFourDigitYearFormat(normalized.dateFormat);
    if (coercedFormat !== normalized.dateFormat) {
      normalized.dateFormat = coercedFormat;
    }
  }

  // strip time portion from the default value of a date field so that stored
  // settings are always YYYY-MM-DD.  This handles values coming from the API
  // or pasted from other sources.
  if (label === 'Date' && typeof normalized.defaultValue === 'string' && normalized.defaultValue) {
    const d = new Date(normalized.defaultValue);
    if (!isNaN(d.getTime())) {
      normalized.defaultValue = d.toISOString().slice(0, 10);
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const dedupeFieldsById = (fields: DocumentField[]): DocumentField[] => {
  if (!Array.isArray(fields) || fields.length === 0) return [];
  const order: DocumentField[] = [];
  const indexById = new Map<string, number>();
  const hasFieldValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    return String(value).trim().length > 0;
  };
  const hasSettingsPayload = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.keys(value as Record<string, unknown>).length > 0;
  };

  fields.forEach((field) => {
    const candidate = field as FieldLike;
    const id = normalizeFieldId(candidate?.fieldId ?? field?.id);
    if (!id) return;
    const existingIndex = indexById.get(id);
    if (existingIndex === undefined) {
      indexById.set(id, order.length);
      order.push(field);
      return;
    }
    const existing = order[existingIndex];
    const existingValue = (existing as FieldLike)?.value;
    const nextValue = candidate?.value;
    const existingHasValue = hasFieldValue(existingValue);
    const nextHasValue = hasFieldValue(nextValue);
    const existingHasSettings = hasSettingsPayload(existing?.settings);
    const nextHasSettings = hasSettingsPayload(candidate?.settings);

    if (nextHasValue && !existingHasValue) {
      order[existingIndex] = field;
      return;
    }
    if (existingHasValue && !nextHasValue) {
      return;
    }

    if (nextHasSettings && !existingHasSettings) {
      order[existingIndex] = field;
      return;
    }
    if (existingHasSettings && !nextHasSettings) {
      return;
    }

    // Same richness: keep latest field to preserve recent layout edits.
    order[existingIndex] = field;
  });

  return order;
};

export const mapFieldToDroppedComponent = (
  field: DocumentField,
  usedIds: Set<number>,
  options?: { defaultDateFormat?: string }
): DroppedComponent => {
  const candidate = field as FieldLike;
  const fieldIdRaw = normalizeFieldId(candidate?.fieldId ?? field?.id);
  const numericId = allocateNumericId(candidate?.id ?? fieldIdRaw, usedIds);
  const fieldId = fieldIdRaw || String(numericId);
  const ownerRaw = String(candidate?.fieldOwner ?? '').toLowerCase();
  const fieldOwner: FieldOwner =
    ownerRaw === 'me'
      ? 'me'
      : ownerRaw === 'recipient' || ownerRaw === 'recipients'
        ? 'recipients'
        : field?.recipientId
          ? 'recipients'
          : 'me';
  const componentLabel = resolveComponentLabel(field);
  const normalizedSettings = normalizeComponentSettings(componentLabel, field.settings);
  let effectiveSettings = normalizedSettings;
  if (componentLabel === 'Date') {
    const fallback = options?.defaultDateFormat || 'DD/MM/YYYY (EU)';
    const normalizedFallback = ensureFourDigitYearFormat(fallback) as DateFormatOption;
    if (!effectiveSettings?.dateFormat || String(effectiveSettings.dateFormat).trim().length === 0) {
      effectiveSettings = {
        ...(effectiveSettings || {}),
        dateFormat: normalizedFallback,
      };
    }
  }
  const isRecipientDateField = componentLabel === 'Date' && fieldOwner === 'recipients';
  const sanitizedSettings =
    isRecipientDateField && effectiveSettings?.defaultValue
      ? { ...effectiveSettings, defaultValue: '' }
      : effectiveSettings;
  const defaultValue = typeof sanitizedSettings?.defaultValue === 'string'
    ? sanitizedSettings.defaultValue
    : '';
  const canHydrateDefault =
    ['Text', 'Full Name', 'Email', 'Date', 'Dropdown', 'Radio'].includes(componentLabel) &&
    !isRecipientDateField;
  const incomingValue = candidate?.value;
  const shouldHydrateDefault =
    canHydrateDefault &&
    defaultValue.trim().length > 0 &&
    (incomingValue === null || incomingValue === undefined);
  const resolvedValue = shouldHydrateDefault
    ? defaultValue
    : incomingValue === null || incomingValue === undefined
      ? null
      : String(incomingValue);
  const resized = resolveAutoResizeDimensions({
    component: componentLabel,
    width: field.width,
    height: field.height,
    value: resolvedValue,
    settings: sanitizedSettings,
  });

  return {
    id: numericId,
    fieldId,
    repeatGroupId: typeof field.repeatGroupId === 'string' ? field.repeatGroupId : undefined,
    repeatSourceId: typeof field.repeatSourceId === 'string' ? field.repeatSourceId : undefined,
    component: componentLabel,
    x: field.x,
    y: field.y,
    width: resized.width,
    height: resized.height,
    pageNumber: field.pageNumber,
    data: resolvedValue,
    assignedRecipientId: field.recipientId,
    required: field.required !== false,
    placeholder: field.placeholder,
    settings: sanitizedSettings,
    pageRect: field.pageRect,
    fieldOwner,
  } as DroppedComponent;
};
