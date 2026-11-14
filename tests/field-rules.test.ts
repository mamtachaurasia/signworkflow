import { describe, expect, it } from 'vitest';

import { getEffectiveFieldValue, isFieldValueFilled, validateFieldValue, normalizeValidationKind } from '@/lib/field-rules';
import { DATE_FORMAT_OPTIONS } from '@/lib/date-formats';

describe('field-rules', () => {
  it('uses default value when current value is undefined', () => {
    const value = getEffectiveFieldValue({
      component: 'Text',
      settings: { defaultValue: 'Preset' },
    });
    expect(value).toBe('Preset');
  });

  it('does not override explicit empty string with default value', () => {
    const value = getEffectiveFieldValue({
      component: 'Text',
      value: '',
      settings: { defaultValue: 'Preset' },
    });
    expect(value).toBe('');
  });

  it('enforces required fields', () => {
    const result = validateFieldValue({
      component: 'Text',
      required: true,
      value: '',
    });
    expect(result.valid).toBe(false);
  });

  it('validates email format', () => {
    const invalid = validateFieldValue({
      component: 'Email',
      value: 'not-an-email',
    });
    const valid = validateFieldValue({
      component: 'Email',
      value: 'a@b.com',
    });
    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });

  it('applies text input type email validation', () => {
    const invalid = validateFieldValue({
      component: 'Text',
      value: 'not-an-email',
      settings: { inputType: 'email' },
    });
    const valid = validateFieldValue({
      component: 'Text',
      value: 'name@example.com',
      settings: { inputType: 'email' },
    });
    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });

  it('applies numeric-only validation for number input type', () => {
    const invalid = validateFieldValue({
      component: 'Text',
      value: '12A',
      settings: { inputType: 'number' },
    });
    const valid = validateFieldValue({
      component: 'Text',
      value: '1234',
      settings: { inputType: 'number' },
    });
    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });

  it('honors explicit no-validation override', () => {
    const result = validateFieldValue({
      component: 'Email',
      value: 'not-an-email',
      settings: { validationKind: 'none' },
    });
    expect(result.valid).toBe(true);
  });

  it('treats required checkbox as selected-only', () => {
    const unchecked = validateFieldValue({
      component: 'Checkbox',
      required: true,
      value: '',
      settings: { checkedValue: 'YES', uncheckedValue: 'NO' },
    });
    const checked = validateFieldValue({
      component: 'Checkbox',
      required: true,
      value: 'YES',
      settings: { checkedValue: 'YES', uncheckedValue: 'NO' },
    });
    expect(unchecked.valid).toBe(false);
    expect(checked.valid).toBe(true);
  });

  it('rejects unrecognized checkbox values', () => {
    const result = validateFieldValue({
      component: 'Checkbox',
      required: false,
      value: 'unexpected',
      settings: { checkedValue: 'YES', uncheckedValue: 'NO' },
    });
    expect(result.valid).toBe(false);
  });

  it('applies number range constraints', () => {
    const tooSmall = validateFieldValue({
      component: 'Text',
      value: '2',
      settings: { validationKind: 'number', minValue: 3 },
    });
    const inRange = validateFieldValue({
      component: 'Text',
      value: '4',
      settings: { validationKind: 'number', minValue: 3, maxValue: 10 },
    });
    expect(tooSmall.valid).toBe(false);
    expect(inRange.valid).toBe(true);
  });

  it('enforces lines limit for text-based fields', () => {
    const invalid = validateFieldValue({
      component: 'Text',
      value: 'Line 1\nLine 2\nLine 3',
      settings: { maxLines: 2 },
    });
    const valid = validateFieldValue({
      component: 'Text',
      value: 'Line 1\nLine 2',
      settings: { maxLines: 2 },
    });
    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });

  it('applies configured date format', () => {
    const invalid = validateFieldValue({
      component: 'Date',
      value: '2025/12/31',
      settings: { dateFormat: 'YYYY-MM-DD' },
    });
    const valid = validateFieldValue({
      component: 'Date',
      value: '2025-12-31',
      settings: { dateFormat: 'YYYY-MM-DD' },
    });
    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });

  it('treats date format tokens case-insensitively and ignores notes', () => {
    // parentheses should be stripped and lowercase tokens should still work
    const valid = validateFieldValue({
      component: 'Date',
      value: '12/31/2025',
      settings: { dateFormat: 'mm/dd/yyyy (US)' },
    });
    const invalid = validateFieldValue({
      component: 'Date',
      value: '2025-12-31',
      settings: { dateFormat: 'mm/dd/yyyy (US)' },
    });
    expect(valid.valid).toBe(true);
    expect(invalid.valid).toBe(false);
  });

  it('accepts all predefined date-format options', () => {
    const examples: Record<string, string> = {
      'MM/DD/YYYY (US)': '12/31/2025',
      'DD/MM/YYYY (EU)': '31/12/2025',
      'YYYY-MM-DD (ISO)': '2025-12-31',
    };
    DATE_FORMAT_OPTIONS.forEach((fmt) => {
      const result = validateFieldValue({
        component: 'Date',
        value: examples[fmt],
        settings: { dateFormat: fmt },
      });
      expect(result.valid, `format ${fmt} should accept ${examples[fmt]}`).toBe(true);
    });
  });

  it('enforces dropdown options when configured', () => {
    const invalid = validateFieldValue({
      component: 'Dropdown',
      value: 'Option C',
      settings: { options: ['Option A', 'Option B'] },
    });
    const valid = validateFieldValue({
      component: 'Dropdown',
      value: 'Option B',
      settings: { options: ['Option A', 'Option B'] },
    });
    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });

  it('enforces radio options when configured', () => {
    const invalid = validateFieldValue({
      component: 'Radio',
      value: 'Option C',
      settings: { options: ['Option A', 'Option B'] },
    });
    const valid = validateFieldValue({
      component: 'Radio',
      value: 'Option A',
      settings: { options: ['Option A', 'Option B'] },
    });
    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });

  it('accepts valid full name values', () => {
    const valid = validateFieldValue({
      component: 'Full Name',
      value: 'John Doe',
    });
    const singleWord = validateFieldValue({
      component: 'Full Name',
      value: 'Prince',
    });
    const validByType = validateFieldValue({
      type: 'full_name',
      value: 'Jane Smith',
    });
    expect(valid.valid).toBe(true);
    expect(singleWord.valid).toBe(true);
    expect(validByType.valid).toBe(true);
  });

  it('rejects invalid full name values', () => {
    const withDigits = validateFieldValue({
      component: 'Full Name',
      value: 'John2 Doe',
    });
    const emptyValue = validateFieldValue({
      component: 'Full Name',
      value: '   ',
    });
    expect(withDigits.valid).toBe(false);
    expect(emptyValue.valid).toBe(false);
  });

  it('flags invalid regex patterns', () => {
    const result = validateFieldValue({
      component: 'Text',
      value: 'ABC123',
      settings: { validationKind: 'regex', validationPattern: '(' },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid regex pattern');
  });

  it('tracks filled-state for checkbox values', () => {
    const unchecked = isFieldValueFilled({
      component: 'Checkbox',
      value: '',
      settings: { checkedValue: 'YES' },
    });
    const checked = isFieldValueFilled({
      component: 'Checkbox',
      value: 'YES',
      settings: { checkedValue: 'YES' },
    });
    expect(unchecked).toBe(false);
    expect(checked).toBe(true);
  });

  it('validates default values against rules', () => {
    const badEmail = validateFieldValue({
      component: 'Email',
      settings: { defaultValue: 'not-an-email' },
    });
    const goodEmail = validateFieldValue({
      component: 'Email',
      settings: { defaultValue: 'hello@example.com' },
    });
    const badDate = validateFieldValue({
      component: 'Date',
      settings: { defaultValue: '2025/01/01', dateFormat: 'YYYY-MM-DD' },
    });
    const goodDate = validateFieldValue({
      component: 'Date',
      settings: { defaultValue: '2025-01-01' },
    });
    expect(badEmail.valid).toBe(false);
    expect(goodEmail.valid).toBe(true);
    expect(badDate.valid).toBe(false);
    expect(goodDate.valid).toBe(true);
  });

  it('normalizeValidationKind picks sensible defaults', () => {
    expect(normalizeValidationKind({ component: 'Date' })).toBe('date');
    expect(normalizeValidationKind({ component: 'Email' })).toBe('email');
    expect(normalizeValidationKind({ component: 'Text', settings: { inputType: 'number' } })).toBe('number');
  });
});
