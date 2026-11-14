'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';

const EMPTY_VALUE_PREFIX = '__radix-empty__';

type ParsedOption = {
  key: React.Key;
  value: string;
  radixValue: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type ParsedBlock =
  | {
      type: 'option';
      option: ParsedOption;
    }
  | {
      type: 'group';
      key: React.Key;
      label: React.ReactNode;
      options: ParsedOption[];
    };

type SelectChildProps = {
  children?: React.ReactNode;
  disabled?: boolean;
  label?: React.ReactNode;
  value?: unknown;
};

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'> {
  contentClassName?: string;
  itemClassName?: string;
  placeholder?: React.ReactNode;
  tone?: 'default' | 'dark';
}

function normalizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0] ?? '') : '';
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function createSyntheticEvent<T extends HTMLSelectElement>(
  target: T | null,
  type: 'change' | 'blur' | 'focus',
  name: string | undefined,
  value: string
) {
  const fallbackTarget = {
    name: name ?? '',
    value,
  };

  return {
    type,
    target: (target ?? fallbackTarget) as EventTarget & T,
    currentTarget: (target ?? fallbackTarget) as EventTarget & T,
    preventDefault() {},
    stopPropagation() {},
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    persist() {},
    nativeEvent: new Event(type, { bubbles: true }),
    timeStamp: Date.now(),
  } as React.ChangeEvent<T> & React.FocusEvent<T>;
}

function createOption(child: React.ReactElement<SelectChildProps>, index: number): ParsedOption {
  const value = normalizeValue(child.props.value);

  return {
    key: child.key ?? `${value || 'empty'}-${index}`,
    value,
    radixValue: value === '' ? `${EMPTY_VALUE_PREFIX}-${index}` : value,
    label: child.props.children,
    disabled: Boolean(child.props.disabled),
  };
}

function collectBlocks(children: React.ReactNode, nextIndex: { current: number }): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<SelectChildProps>(child)) {
      return;
    }

    if (child.type === React.Fragment) {
      blocks.push(...collectBlocks(child.props.children, nextIndex));
      return;
    }

    if (child.type === 'option') {
      const option = createOption(child, nextIndex.current);
      nextIndex.current += 1;
      blocks.push({ type: 'option', option });
      return;
    }

    if (child.type === 'optgroup') {
      const options = collectBlocks(child.props.children, nextIndex).flatMap((block) =>
        block.type === 'option' ? [block.option] : block.options
      );

      blocks.push({
        type: 'group',
        key: child.key ?? `group-${nextIndex.current}`,
        label: child.props.label,
        options,
      });
    }
  });

  return blocks;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    children,
    className,
    contentClassName,
    defaultValue,
    disabled,
    form,
    id,
    itemClassName,
    name,
    onBlur,
    onChange,
    onFocus,
    placeholder,
    required,
    style,
    tabIndex,
    title,
    tone = 'default',
    value,
    ...props
  },
  ref
) {
  const hiddenSelectRef = React.useRef<HTMLSelectElement | null>(null);
  const parsedBlocks = React.useMemo(() => collectBlocks(children, { current: 0 }), [children]);
  const options = React.useMemo(
    () =>
      parsedBlocks.flatMap((block) => (block.type === 'option' ? [block.option] : block.options)),
    [parsedBlocks]
  );
  const firstValue = options[0]?.value ?? '';
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState<string>(() => {
    if (value !== undefined) {
      return normalizeValue(value);
    }

    if (defaultValue !== undefined) {
      return normalizeValue(defaultValue);
    }

    return firstValue;
  });
  const selectedValue = isControlled ? normalizeValue(value) : internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue) ?? null;
  const triggerToneClasses =
    tone === 'dark'
      ? 'border-white/10 bg-white/5 text-white shadow-sm data-[placeholder]:text-slate-400 focus:ring-sky-400/20'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm data-[placeholder]:text-slate-400 focus:ring-brand-100';
  const contentToneClasses =
    tone === 'dark'
      ? 'border-white/10 bg-slate-950 text-white'
      : 'border-slate-200 bg-white text-slate-900';
  const itemToneClasses =
    tone === 'dark'
      ? 'focus:bg-white/10 focus:text-white data-[state=checked]:bg-white/10'
      : 'focus:bg-slate-100 focus:text-slate-900 data-[state=checked]:bg-slate-100';

  React.useImperativeHandle(ref, () => hiddenSelectRef.current as HTMLSelectElement, []);

  React.useEffect(() => {
    if (isControlled) {
      return;
    }

    if (options.length === 0) {
      if (internalValue !== '') {
        setInternalValue('');
      }
      return;
    }

    if (!options.some((option) => option.value === internalValue)) {
      setInternalValue(firstValue);
    }
  }, [firstValue, internalValue, isControlled, options]);

  React.useEffect(() => {
    if (!hiddenSelectRef.current) {
      return;
    }

    hiddenSelectRef.current.value = selectedValue;
  }, [selectedValue]);

  const emitChange = React.useCallback(
    (nextValue: string) => {
      if (!onChange) {
        return;
      }

      onChange(createSyntheticEvent(hiddenSelectRef.current, 'change', name, nextValue));
    },
    [name, onChange]
  );

  const emitFocus = React.useCallback(() => {
    if (!onFocus) {
      return;
    }

    onFocus(createSyntheticEvent(hiddenSelectRef.current, 'focus', name, selectedValue));
  }, [name, onFocus, selectedValue]);

  const emitBlur = React.useCallback(() => {
    if (!onBlur) {
      return;
    }

    onBlur(createSyntheticEvent(hiddenSelectRef.current, 'blur', name, selectedValue));
  }, [name, onBlur, selectedValue]);

  const handleValueChange = React.useCallback(
    (nextRadixValue: string) => {
      const nextOption = options.find((option) => option.radixValue === nextRadixValue);
      if (!nextOption) {
        return;
      }

      if (!isControlled) {
        setInternalValue(nextOption.value);
      }

      if (hiddenSelectRef.current) {
        hiddenSelectRef.current.value = nextOption.value;
      }

      emitChange(nextOption.value);
    },
    [emitChange, isControlled, options]
  );

  const handleNativeChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextValue = event.target.value;

      if (!isControlled) {
        setInternalValue(nextValue);
      }

      onChange?.(event);
    },
    [isControlled, onChange]
  );

  return (
    <>
      <select
        ref={hiddenSelectRef}
        defaultValue={normalizeValue(defaultValue)}
        disabled={disabled}
        form={form}
        name={name}
        onChange={handleNativeChange}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px opacity-0"
      >
        {children}
      </select>

      <SelectPrimitive.Root
        disabled={disabled}
        onValueChange={handleValueChange}
        value={selectedOption?.radixValue}
      >
        <SelectPrimitive.Trigger
          id={id}
          title={title}
          tabIndex={tabIndex}
          onBlur={emitBlur}
          onFocus={emitFocus}
          style={style}
          className={cn(
            'inline-flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
            'focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
            triggerToneClasses,
            className
          )}
          aria-describedby={props['aria-describedby']}
          aria-invalid={props['aria-invalid']}
          aria-label={props['aria-label']}
          aria-labelledby={props['aria-labelledby']}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            data-dropdown-portal="true"
            position="popper"
            sideOffset={4}
            className={cn(
              'z-1000002 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border p-1 shadow-xl',
              contentToneClasses,
              contentClassName
            )}
          >
            <SelectPrimitive.ScrollUpButton className="flex h-8 items-center justify-center">
              <ChevronUp className="h-4 w-4" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="max-h-72 p-0.5">
              {parsedBlocks.map((block) => {
                if (block.type === 'option') {
                  return (
                    <SelectPrimitive.Item
                      key={block.option.key}
                      value={block.option.radixValue}
                      disabled={block.option.disabled}
                      className={cn(
                        'relative flex min-h-9 cursor-default select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none',
                        'data-disabled:pointer-events-none data-disabled:opacity-50',
                        itemToneClasses,
                        itemClassName
                      )}
                    >
                      <SelectPrimitive.ItemIndicator className="absolute left-2 flex h-4 w-4 items-center justify-center">
                        <Check className="h-4 w-4" />
                      </SelectPrimitive.ItemIndicator>
                      <SelectPrimitive.ItemText>{block.option.label}</SelectPrimitive.ItemText>
                    </SelectPrimitive.Item>
                  );
                }

                return (
                  <SelectPrimitive.Group key={block.key}>
                    <SelectPrimitive.Label className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {block.label}
                    </SelectPrimitive.Label>
                    {block.options.map((option) => (
                      <SelectPrimitive.Item
                        key={option.key}
                        value={option.radixValue}
                        disabled={option.disabled}
                        className={cn(
                          'relative flex min-h-9 cursor-default select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none',
                          'data-disabled:pointer-events-none data-disabled:opacity-50',
                          itemToneClasses,
                          itemClassName
                        )}
                      >
                        <SelectPrimitive.ItemIndicator className="absolute left-2 flex h-4 w-4 items-center justify-center">
                          <Check className="h-4 w-4" />
                        </SelectPrimitive.ItemIndicator>
                        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Group>
                );
              })}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-8 items-center justify-center">
              <ChevronDown className="h-4 w-4" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </>
  );
});
