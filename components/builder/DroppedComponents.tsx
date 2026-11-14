"use client";
import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { Rnd, DraggableData } from 'react-rnd';
import { DroppedComponent, FieldInputType, FieldPropertySettings, Recipient } from '@/types/types';
import MultilineTextField from './MultilineTextField';
import type { RichTextEditorHandle } from '@/components/editor/RichTextEditor';
import ImageField from './ImageField';
import DatePicker from 'react-multi-date-picker';
import { DATE_FORMAT_OPTIONS, DateFormatOption } from '@/lib/date-formats';

// shared utility ensures four-digit year and strips notes
import { ensureFourDigitYearFormat, formatForPicker, normalizeDateFormat } from '@/lib/date-formats';
const getPickerFormat = normalizeDateFormat;
import FieldSelectionMenu from './FieldSelectionMenu';
import Initials from './Initials';
import { getEffectiveFieldValue, supportsReadOnlySetting, validateFieldValue } from '@/lib/field-rules';
import { Button, Input } from '@ui';
import { Calendar1Icon, CircleHelp, GripVertical, Pencil, X } from 'lucide-react';
import { Select } from '@ui';


interface DroppedComponentsProps {
  droppedComponents: DroppedComponent[];
  selectedFieldId: number | null;
  setSelectedFieldId: React.Dispatch<React.SetStateAction<number | null>>;
  onSelectField: (field: DroppedComponent) => void;
  onAssignRecipient: (fieldId: number, recipientId: string | null) => void;
  onDuplicateField: (field: DroppedComponent) => void;
  onDeleteField: (field: DroppedComponent) => void;
  updateField: (data: string | null, id: number) => void;
  handleDragStop: (e: MouseEvent | TouchEvent, item: DroppedComponent, data: DraggableData) => void;
  handleResizeStop: (
    e: MouseEvent | TouchEvent,
    item: DroppedComponent,
    ref: { style: { width: string; height: string } },
    pos: { x: number, y: number },
    delta?: { width: number, height: number }
  ) => void;
  textFieldRefs: React.MutableRefObject<Record<number, RichTextEditorHandle | null>>;
  zoom: number;
  recipients?: Recipient[];
  onAddRecipients: () => void;
  onClickField: (event: React.MouseEvent<Element>, item: DroppedComponent, isEdit?:boolean) => void;
  isSigningMode:boolean;
  isReadOnly?: boolean;
  isSigned?:boolean;
  currentRecipientId?: string;
  guidedFieldId?: string | null;
  guidedBadgeLabel?: 'Sign here' | 'Review';
  defaultDateFormat?: string;
  defaultWeekStart?: 'sunday' | 'monday';
}

export const textInputTypes = new Set<FieldInputType>(['text', 'email', 'phone', 'number']);
export const multilineCapableComponents = new Set(['Text']);
export const textLikeComponents = new Set(['Text', 'Full Name', 'Email']);

export const resolveTextInputType = (
  component: string | undefined,
  settings: FieldPropertySettings,
): FieldInputType => {
  if (component === 'Full Name') {
    return 'text';
  }
  const configured = String(settings.inputType || '').toLowerCase();
  if (textInputTypes.has(configured as FieldInputType)) {
    return configured as FieldInputType;
  }
  const legacyValidation = String(settings.validationKind || '').toLowerCase();
  if (legacyValidation === 'email') {
    return 'email';
  }
  if (legacyValidation === 'number') {
    return 'number';
  }
  if (component === 'Email') {
    return 'email';
  }
  return 'text';
};

export function mapToHtmlInputType(inputType: FieldInputType): 'text' | 'email' | 'tel' | 'number' {
  switch (inputType) {
  case 'email':
    return 'email';
  case 'phone':
    return 'tel';
  case 'number':
    return 'number';
  default:
    return 'text';
  }
}

const DroppedComponents: React.FC<DroppedComponentsProps> = ({
  droppedComponents,
  selectedFieldId,
  setSelectedFieldId,
  onSelectField,
  onAssignRecipient,
  onDuplicateField,
  onDeleteField,
  updateField,
  handleDragStop,
  handleResizeStop,
  textFieldRefs,
  zoom,
  recipients = [],
  onAddRecipients,
  onClickField,
  isSigningMode,
  isReadOnly = false,
  isSigned,
  currentRecipientId,
  guidedFieldId,
  guidedBadgeLabel,
  defaultDateFormat,
  defaultWeekStart,
}) => {
  const [enableBounds, setEnableBounds] = useState(true);
  const hasMountedRef = useRef(false);
  const fallbackDateFormat = useMemo(
    () => ensureFourDigitYearFormat(defaultDateFormat || 'DD/MM/YYYY (EU)'),
    [defaultDateFormat]
  );
  const weekStartDayIndex = defaultWeekStart === 'monday' ? 1 : 0;

  // Temporarily disable bounds when components update (e.g. page insertion)
  // to prevent fields from snapping to the old container height.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setEnableBounds(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [droppedComponents]);

  useEffect(() => {
    if (!enableBounds) {
      const timer = setTimeout(() => setEnableBounds(true), 500);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [enableBounds]);

  /* ---------------------------------- */
  /* Recipient lookup  */
  /* ---------------------------------- */
  const recipientMap = useMemo(() => {
    const map = new Map<string, Recipient>();
    recipients.forEach(r => map.set(r.id, r));
    return map;
  }, [recipients]);

  /* ---------------------------------- */
  /* Resize handles                     */
  /* ---------------------------------- */
  const cornersCSS = 'bg-brand-500 w-3! h-3! rounded-full';

  const assignedLabel =
    'after:content-[attr(data-name)] after:block after:rounded-sm after:bg-[inherit] after:w-1/2 after:whitespace-nowrap after:text-ellipsis after:p-0.5 after:text-xs after:overflow-hidden';

  const resolvePlaceholder = useCallback((item: DroppedComponent): string => {
    const configured = (item.placeholder || '').trim();
    if (configured) return configured;
    if (item.component === 'Text') {
      return 'Enter text';
    }
    if (item.component === 'Full Name') {
      return 'Enter full name';
    }
    if (item.component === 'Email' && item.fieldOwner === 'recipients') {
      const inputType = resolveTextInputType(item.component, item.settings || {});
      switch (inputType) {
        case 'phone':
          return 'Type a phone number or select recipient';
        case 'number':
          return 'Type a number or select recipient';
        case 'text':
          return 'Type a value or select recipient';
        default:
          return 'Type an email address or select recipient';
      }
    }
    return '';
  }, []);

  /* ---------------------------------- */
  /* Field renderer                     */
  /* ---------------------------------- */
  const renderField = useCallback(
    (item: DroppedComponent, isFieldReadOnly: boolean, effectiveValue: string) => {
      const settings = item.settings;
      const value = effectiveValue;
      const placeholder = resolvePlaceholder(item);

      switch (item.component) {
      case 'Image':
      case 'Live Photo':
        return item.data ? (
          <ImageField image={item.data} />
        ) : item.component === 'Live Photo' ? (
          'Click to capture Live Photo'
        ) : (
          item.component.toLowerCase()
        );

      case 'Text':
      case 'Full Name':
      case 'Email': {
        const inputType = resolveTextInputType(item.component, item.settings || {});
        const allowMultiline =
          item.component && multilineCapableComponents.has(item.component) && inputType === 'text' &&
          settings?.multiline !== false;

        if (!allowMultiline) {
          return (
            <Input
              type={mapToHtmlInputType(inputType)}
              inputMode={inputType === 'number' ? 'numeric' : inputType === 'phone' ? 'tel' : undefined}
              value={value}
              readOnly={isFieldReadOnly}
              onChange={(e) => updateField(e.target.value, item.id)}
              placeholder={placeholder}
              maxLength={typeof settings?.maxLength === 'number' ? settings.maxLength : undefined}
              className="!h-full border-0 bg-transparent px-2 py-1 shadow-none focus-visible:ring-0"
            />
          );
        }
        return (
          <MultilineTextField
            value={value}
            readOnly={isFieldReadOnly}
            textInput={(text) => updateField(text, item.id)}
            placeholder={placeholder}
            maxLength={typeof settings?.maxLength === 'number' ? settings.maxLength : undefined}
            maxLines={typeof settings?.maxLines === 'number' ? settings.maxLines : undefined}
            ref={(el) => {
              textFieldRefs.current[item.id] = el;
            }}
          />
        );
      }
      case 'Stamp':
      case 'Signature':
      case 'Initials':
        return(
          <Initials
            key={`${item.id}-${item.data}`}
            value={
              item.fieldOwner === "me"
                ? item.data ? item.data : `Add ${item.component}`// your own signature
                : item.fieldOwner === "recipients" && item.data
                ? item.data // recipient already signed
                : isSigningMode
                ? value // currently signing
                : `Add ${item.component}` // placeholder
            }
            width={item.width}
            height={item.height}
          />
        )
      case 'Date': {
          // always use the custom picker; the native control shipped by
          // <input type="date"/> was causing inconsistent behaviour
          // across browsers. we mirror the logic used in the property panel
          // so the field editor and the live document share format handling.
          const dateFormatSource =
            typeof settings?.dateFormat === 'string' && settings.dateFormat.trim().length > 0
              ? settings.dateFormat
              : fallbackDateFormat;
          const dateFormat = ensureFourDigitYearFormat(dateFormatSource);
          const pickerFormat = getPickerFormat(dateFormat);
          const isRecipientDateField = (item.fieldOwner ?? 'recipients') === 'recipients';
          // normalize existing value for ISO format
          let pickerValue = value || '';
          if (dateFormat.includes('YYYY-MM-DD') && pickerValue) {
            const d = new Date(pickerValue);
            if (!isNaN(d.getTime())) {
              const iso = d.toISOString().slice(0, 10);
              pickerValue = iso;
            }
          }
          const coercedPickerValue = pickerValue
            ? formatForPicker(String(pickerValue), pickerFormat) || pickerValue
            : '';
          return (
            <DatePicker
              key={`date-field-${item.id}-${coercedPickerValue || 'empty'}`}
              value={coercedPickerValue}
              format={pickerFormat}
              weekStartDayIndex={weekStartDayIndex}
              onChange={(date: { format?: (fmt?: string) => string } | null) => {
                const str = date ? date.format?.(pickerFormat) || String(date) : '';
                updateField(str, item.id);
              }}
              onOpenPickNewDate={!isRecipientDateField}
              disabled={isFieldReadOnly}
              data-testid="date-picker"
              render={(value, openCalendar) => (
                <div className="p-1 relative">
                  <Calendar1Icon size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                  {value && !isFieldReadOnly && (
                    <button
                      type="button"
                      aria-label="Clear date"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        updateField('', item.id);
                      }}
                      className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <Input
                    value={value}
                    onClick={openCalendar}
                    readOnly
                    disabled={isFieldReadOnly}
                    placeholder="Select dates"
                    className="rmdp-input w-full p-1 pr-10"
                  />
                </div>
              )}
              placeholder={
                dateFormat && !DATE_FORMAT_OPTIONS.includes(dateFormat as DateFormatOption)
                  ? dateFormat
                  : ''
              }
            />
          );
        }
        case 'Checkbox': {
          const checkedValue = (settings?.checkedValue || '').trim() || 'true';
          const normalized = String(value || '').trim().toLowerCase();
          const isChecked =
            normalized === checkedValue.toLowerCase() ||
            normalized === 'true' ||
            normalized === '1' ||
            normalized === 'on' ||
            normalized === 'yes';
          const uncheckedValue = (settings?.uncheckedValue || '').trim();

          return (
            <label className="flex h-full w-full items-start gap-2 overflow-hidden px-2 py-1 text-left text-xs leading-tight">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={isChecked}
                disabled={isFieldReadOnly}
                onChange={(e) => updateField(e.target.checked ? checkedValue : uncheckedValue, item.id)}
              />
              <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word text-left leading-tight">
                {settings?.label || 'Checkbox'}
              </span>
            </label>
          );
        }
        case 'Dropdown': {
          const options = Array.isArray(settings?.options)
            ? settings.options.map((option) => option.trim()).filter(Boolean)
            : [];
          const dropdownPlaceholder = placeholder || 'Select an option';
          return (
            <>
            {(!isSigningMode || isFieldReadOnly) &&  <div className='z-99 h-full w-[calc(100%-20px)] absolute left-0 top-0'/>}
            <Select
              value={value}
              disabled={isFieldReadOnly}
              onChange={(e) => updateField(e.target.value, item.id)}
              className="w-full h-full text-xs px-1 bg-white border border-slate-200 rounded-sm"
            >
              <option value="">{dropdownPlaceholder}</option>
              {options.map((option, optionIndex) => (
                <option key={`${option}-${optionIndex}`} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </>
          );
        }
        case 'Radio': {
          const configured = Array.isArray(settings?.options)
            ? settings.options.map((option) => option.trim()).filter(Boolean)
            : [];
          const options = configured.length > 0 ? configured : ['Option 1', 'Option 2'];
          return (
            <div className="flex h-full w-full flex-col justify-start gap-2 overflow-auto px-2 py-1 text-left text-xs">
              {options.map((option, optionIndex) => (
                <label key={`${option}-${optionIndex}`} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={`field-radio-${item.id}`}
                    className="mt-0.5 shrink-0"
                    checked={value === option}
                    disabled={isFieldReadOnly}
                    onChange={() => updateField(option, item.id)}
                  />
                  <span className="whitespace-pre-wrap wrap-break-word leading-tight">{option}</span>
                </label>
              ))}
            </div>
          );
        }

        default:
          return item.component.toLowerCase();
      }
    },
    [fallbackDateFormat, isSigningMode, resolvePlaceholder, textFieldRefs, updateField, weekStartDayIndex]
  );
  /* ---------------------------------- */
  /* Render                             */
  /* ---------------------------------- */
  return (
    <>
      {droppedComponents.map((item) => {
        const assignedRecipient = item.assignedRecipientId ? recipientMap.get(item.assignedRecipientId) : undefined;
        const isSelected = selectedFieldId === item.id;
        const isCurrentUserField = isSigningMode ? item.assignedRecipientId === currentRecipientId : true;
        const isReadOnlyBySetting =
          supportsReadOnlySetting({ component: item.component }) &&
          item.settings?.readOnly === true;
        const isResizeAllowed = item.settings?.allowResize === true;
        const isFieldReadOnlyInSigning = isSigningMode && (!isCurrentUserField || isSigned || isReadOnlyBySetting);
        const isReadOnlyMeField = item.fieldOwner === 'me' && [''].includes(item.component);
        const isFieldReadOnly = isReadOnly || isFieldReadOnlyInSigning || isReadOnlyMeField;
        const canResizeInBuilder = !isSigningMode && !isReadOnly;
        const canResizeInSigning =
          isSigningMode &&
          !isReadOnly &&
          !isFieldReadOnly &&
          isCurrentUserField &&
          isResizeAllowed;
        const canManualResize = canResizeInBuilder || canResizeInSigning;
        const fieldDataId = item.fieldId ?? String(item.id);
        const isChoiceField = item.component === 'Checkbox' || item.component === 'Radio';
        const fieldLabel = String(item.settings?.label || '').trim();
        const fieldHelpText = String(item.settings?.hint || '').trim();
        const showFieldLabel = isSigningMode && fieldLabel.length > 0 && item.component !== 'Checkbox';
        const showFieldHelpText = isSigningMode && fieldHelpText.length > 0;
        const showFieldMeta = showFieldLabel;
        const isGuidedFocus = isSigningMode && guidedFieldId && fieldDataId === guidedFieldId;
        const activeGuidedBadgeLabel =
          guidedBadgeLabel ??
          (typeof item.data === "string" && item.data.trim().length > 0 ? "Review" : "Sign here");
        const showGuidedBadge =
          Boolean(isGuidedFocus) &&
          isCurrentUserField &&
          (!isFieldReadOnly || activeGuidedBadgeLabel === 'Review');
        const effectiveValue = getEffectiveFieldValue({
          component: item.component,
          required: item.required,
          value: item.data,
          settings: item.settings,
        });
        const validation = validateFieldValue({
          component: item.component,
          required: item.required,
          value: effectiveValue,
          settings: item.settings,
        });
        const shouldValidate =
          item.fieldOwner === 'me' ||
          (item.fieldOwner === 'recipients' && !isSigningMode && !!effectiveValue) ||
          (item.fieldOwner === 'recipients' && isSigningMode && isCurrentUserField && !isSigned);
        const hasError = shouldValidate && (item.hasError || !validation.valid);

        return (
          <Rnd
            key={item.id}
            scale={zoom}
            bounds={enableBounds ? "parent" : undefined}
            className={`absolute cursor-pointer min-w-37.5 min-h-12.5 text-sm ${isChoiceField ? 'text-left' : 'text-center'}
              ${assignedRecipient ? 'border-2' : 'bg-[#1ca4ff33]'}
              ${isSelected ? 'bg-[#1ca4ff66]' : ''}
              ${isGuidedFocus ? 'ring-2 ring-brand-500 ring-offset-2' : ''}
            ${assignedRecipient ? assignedLabel : ''}
            ${!isCurrentUserField ? 'opacity-50' : ''}
            `}
            style={{
              zIndex: isSelected ? 99 : 10,
              ...(assignedRecipient && {
                backgroundColor: `${assignedRecipient.color}33`,
                borderColor: assignedRecipient.color,
              }),
              ...(hasError && {
                backgroundColor: `#ff000033`,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'red',
              }),
            }}
            position={{ x: item.x, y: item.y }}
            size={{ width: item.width, height: item.height }}
            data-field-id={fieldDataId}
            data-field-page={item.pageNumber ?? ''}
            data-field-recipient-id={item.assignedRecipientId ?? ''}
            data-field-required={item.required !== false ? 'true' : 'false'}
            onDragStop={(e, data) => handleDragStop(e as MouseEvent, item, data)}
            onResizeStop={(e, _direction, ref, delta, position) => handleResizeStop(e, item, ref, position, delta)}

            {...(canManualResize && isSelected && {
                resizeHandleClasses: ['bottomLeft', 'bottomRight', 'topLeft', 'topRight'].reduce(
                  (acc, key) => ({ ...acc, [key]: cornersCSS }),
                  {}
                ),
                ...(assignedRecipient && {
                  resizeHandleStyles: ['bottomLeft', 'bottomRight', 'topLeft', 'topRight'].reduce(
                    (acc, position) => {
                      acc[position] = { backgroundColor: `${assignedRecipient.color}33` };
                      return acc;
                    },
                    {} as Record<string, React.CSSProperties>
                  ),
                })
              }
            )}
            onClick={(e: React.MouseEvent<HTMLDivElement>) =>  {
              if (isReadOnly || !isCurrentUserField || (isSigningMode && isFieldReadOnly)) return;
              e.stopPropagation();
              setSelectedFieldId(item.id)
              if (!isSigningMode && !isReadOnly) {
                onSelectField(item);
              }
              if (item.fieldOwner === 'me' && !isSigningMode) return;
              onClickField(e, item);
            }}
            disableDragging={isSigningMode || isReadOnly}
            enableResizing={canManualResize}
            data-name={assignedRecipient?.name}
          >
            {showGuidedBadge && (
                <div className="absolute w-full bg-yellow-400 p-2 rounded shadow-xl
                        before:content-['']
                        before:absolute
                        before:-bottom-2
                        before:left-1/2
                        before:-translate-x-1/2
                        before:w-4
                        before:h-4
                        before:bg-yellow-400
                        before:rotate-45
                        before:shadow-md -top-12 animate-bounce">
                       {activeGuidedBadgeLabel}
                 </div>
            )}
            {showFieldHelpText && (
              <div
                className="absolute -left-1 -top-1 z-20"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  aria-label="Field help"
                  className="group/help relative flex text-slate-400 hover:text-slate-600 focus:text-slate-600"
                >
                 <CircleHelp size={13} className='bg-white rounded-full' />
                  <span className="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-48 rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-[10px] font-normal leading-tight text-slate-600 shadow-lg group-hover/help:block group-focus-within/help:block">
                    {fieldHelpText}
                  </span>
                </button>
              </div>
            )}
            {/* Field Selection Menu */}
            {isSelected && !isSigningMode && !isReadOnly && (
              <>
              <div className="absolute -top-12 -left-6 right-0 z-50 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
               {item.fieldOwner === 'me' && !isSigningMode && (
                <Button
                  onClick={(e?: React.MouseEvent<HTMLButtonElement>) => {
                    if (!e) return;
                    onClickField(e, item, true);
                  }}
                  size="sm"
                  className="shadow-lg w-10! border-gray-300 border"
                  title="Change or Add value in the field"
                  icon={<Pencil size={16} className="text-gray-600" />}
                  inverted

                />
              )}
              <FieldSelectionMenu
                field={item}
                recipients={recipients || []}
                onAssignRecipient={onAssignRecipient}
                onDuplicateField={onDuplicateField}
                onDeleteField={()=> onDeleteField(item)}
                onAddRecipients={onAddRecipients}
              />
            </div>
             {/* Drag Handle Button */}
            {!isSigningMode && !isReadOnly && <Button
              size="icon-xs"
              className="absolute -left-6 top-1 h-10! w-5! cursor-grab active:cursor-grabbing rounded!"
              title="Drag to move field"
              onClick={(e) => e?.stopPropagation()}
              icon={ <GripVertical size={20} />}
            />}
            </>
            )}
            <div className={`flex h-full w-full overflow-hidden ${assignedRecipient ? '' : 'border border-brand-500'}`}>
              {showFieldMeta ? (
                <div className={`flex h-full w-full min-h-0 flex-col overflow-hidden px-1 py-1 ${isChoiceField ? 'items-start' : ''}`}>
                  {showFieldLabel && (
                    <span className="shrink-0 truncate text-left text-[10px] font-medium leading-tight text-slate-700">
                      {fieldLabel}
                    </span>
                  )}
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {renderField(item, isFieldReadOnly, effectiveValue)}
                  </div>
                </div>
              ) : (
                <div className={`${isChoiceField ? 'flex h-full w-full items-start justify-start p-2' : 'flex h-full w-full items-center justify-center p-1'}`}>
                  {renderField(item, isFieldReadOnly, effectiveValue)}
                </div>
              )}
            </div>
          </Rnd>
        );
      })}
    </>
  );
};

export default DroppedComponents;
