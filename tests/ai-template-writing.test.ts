import { describe, expect, it, vi } from 'vitest';

import type { AIProvider, WritingAssistMode } from '@/lib/modules/ai/ai-provider.interface';
import { AIService } from '@/lib/modules/ai/ai.service';
import {
  buildWritingAssistPrompt,
  WRITING_ASSIST_MODE_RULES,
} from '@/lib/modules/ai/prompt-templates';
import { sanitizeWritingInput } from '@/lib/modules/ai/sanitization';
import {
  assertWritingPlaceholderIntegrity,
  extractWritingPlaceholders,
  getNewWritingSmartVariableKeys,
  WritingPlaceholderIntegrityError,
} from '@/lib/modules/ai/writing-assistant';

const MODES: WritingAssistMode[] = [
  'draft',
  'rewrite',
  'professional',
  'concise',
  'plain_language',
  'grammar',
];

describe('template AI writing helpers', () => {
  it('preserves paragraph and list-line structure only for writing sanitization', () => {
    const source = '  First paragraph.\r\n\r\n- First item\n\t- Nested item\u0000  ';

    expect(sanitizeWritingInput(source)).toBe(
      'First paragraph.\n\n- First item\n\t- Nested item'
    );
  });

  it.each(MODES)('adds explicit %s mode and plain-text rules to the prompt', (mode) => {
    const prompt = buildWritingAssistPrompt(
      'First paragraph.\n\nSecond paragraph with {{company_name}}.',
      'Improve this section.',
      mode
    );

    expect(prompt).toContain(`Mode: ${mode}`);
    expect(prompt).toContain(`Mode rule: ${WRITING_ASSIST_MODE_RULES[mode]}`);
    expect(prompt).toContain('Return only the proposed replacement text as raw plain text.');
    expect(prompt).toContain('Do not return HTML, Markdown formatting, code fences');
    expect(prompt).toContain('First paragraph.\n\nSecond paragraph');
  });

  it('extracts and accepts the exact placeholder multiset, including duplicates', () => {
    const source = '{{company_name}} shall pay {{amount}} to {{company_name}}.';
    const suggestion = '{{company_name}} must pay {{amount}} to {{company_name}}.';

    expect(extractWritingPlaceholders(source)).toEqual([
      '{{company_name}}',
      '{{amount}}',
      '{{company_name}}',
    ]);
    expect(() => assertWritingPlaceholderIntegrity(source, suggestion)).not.toThrow();
  });

  it('reports missing and unexpected placeholders without normalizing them', () => {
    const source = '{{company_name}} pays {{amount}} and {{amount}}.';
    const suggestion = '{{Company_Name}} pays {{amount}} in {{currency}}.';

    try {
      assertWritingPlaceholderIntegrity(source, suggestion);
      throw new Error('Expected placeholder integrity validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(WritingPlaceholderIntegrityError);
      expect(error).toMatchObject({
        code: 'WRITING_PLACEHOLDER_INTEGRITY_FAILED',
        missing: ['{{company_name}}', '{{amount}}'],
        unexpected: ['{{Company_Name}}', '{{currency}}'],
      });
    }
  });

  it('rejects a new Smart variable by default, even when its key is valid', () => {
    const source = '{{seller_name}} agrees to sell the property.';
    const suggestion = '{{seller_name}} agrees to sell the property for {{sale_price}}.';

    expect(() => assertWritingPlaceholderIntegrity(source, suggestion)).toThrow(
      WritingPlaceholderIntegrityError
    );
  });

  it('allows valid new lowercase snake_case Smart variables only in creation mode', () => {
    const source = '{{seller_name}} agrees to sell the property.';
    const suggestion = '{{seller_name}} agrees to sell {{property_address}} for {{sale_price}}.';

    expect(() => assertWritingPlaceholderIntegrity(
      source,
      suggestion,
      { allowNewVariables: true }
    )).not.toThrow();
    expect(getNewWritingSmartVariableKeys(source, suggestion)).toEqual([
      'property_address',
      'sale_price',
    ]);
  });

  it('rejects malformed new Smart variables even in creation mode', () => {
    const source = 'Draft new agreement language.';
    const suggestion = 'The seller is {{Seller Name}}.';

    expect(() => assertWritingPlaceholderIntegrity(
      source,
      suggestion,
      { allowNewVariables: true }
    )).toThrow(WritingPlaceholderIntegrityError);
  });

  it('normalizes human-readable Smart variables returned for a new draft', async () => {
    const source = 'Draft new agreement language.';
    const assistWriting = vi.fn().mockResolvedValue({
      result: 'The Seller {{Seller Name}} agrees to sell the property for {{SalePrice}}.',
    });
    const service = new AIService({ assistWriting } as unknown as AIProvider);

    await expect(service.assistWriting(
      source,
      'Draft an agreement to sell with editable details.',
      'draft',
      { allowNewVariables: true }
    )).resolves.toBe(
      'The Seller {{seller_name}} agrees to sell the property for {{sale_price}}.'
    );
  });

  it('does not reinterpret a changed existing Smart variable as a newly-created one', async () => {
    const source = '{{seller_name}} agrees to sell the property.';
    const assistWriting = vi.fn().mockResolvedValue({
      result: '{{Seller Name}} agrees to sell the property to {{buyer_name}}.',
    });
    const service = new AIService({ assistWriting } as unknown as AIProvider);

    await expect(service.assistWriting(
      source,
      'Draft an agreement with editable buyer details.',
      'draft',
      { allowNewVariables: true }
    )).rejects.toBeInstanceOf(WritingPlaceholderIntegrityError);
  });

  it('bypasses the shared cache and preserves multiline source passed to the provider', async () => {
    const source = 'Payment terms:\r\n- {{company_name}} pays monthly.\r\n- Net 30 applies.';
    const suggestion = 'Payment terms:\n- {{company_name}} pays each month.\n- Net 30 applies.';
    const assistWriting = vi.fn().mockResolvedValue({ result: suggestion });
    const service = new AIService({ assistWriting } as unknown as AIProvider);

    await service.assistWriting(source, 'Polish this language.', 'professional');
    await service.assistWriting(source, 'Polish this language.', 'professional');

    expect(assistWriting).toHaveBeenCalledTimes(2);
    expect(assistWriting).toHaveBeenNthCalledWith(
      1,
      'Payment terms:\n- {{company_name}} pays monthly.\n- Net 30 applies.',
      'Polish this language.',
      'professional'
    );
  });

  it('tells the provider how to create Smart variables when that mode is explicitly enabled', async () => {
    const source = 'Draft new agreement language.';
    const instruction = 'Draft an agreement to sell with editable details.';
    const assistWriting = vi.fn().mockResolvedValue({
      result: 'This agreement is between {{seller_name}} and {{buyer_name}}.',
    });
    const service = new AIService({ assistWriting } as unknown as AIProvider);

    await expect(service.assistWriting(source, instruction, 'draft', {
      allowNewVariables: true,
    })).resolves.toBe('This agreement is between {{seller_name}} and {{buyer_name}}.');

    expect(assistWriting).toHaveBeenCalledWith(
      source,
      expect.stringContaining('Use Smart variables for details the user may need to set later.'),
      'draft'
    );
  });

  it('uses the complete request payload for shared AI cache keys', async () => {
    const summarize = vi.fn(async (text: string) => ({ result: `Summary: ${text}` }));
    const service = new AIService({ summarize } as unknown as AIProvider);
    const commonPrefix = 'This agreement contains a long shared opening clause that used to collide. ';

    const first = await service.summarizeSelection(`${commonPrefix}Payment is due in 15 days.`);
    const second = await service.summarizeSelection(`${commonPrefix}Payment is due in 45 days.`);

    expect(first).not.toBe(second);
    expect(summarize).toHaveBeenCalledTimes(2);
  });

  it('passes clause context to the provider and scopes cached explanations by it', async () => {
    const explainClause = vi.fn(async (_text: string, options?: { context?: string }) => ({
      result: `Explanation for ${options?.context}`,
    }));
    const service = new AIService({ explainClause } as unknown as AIProvider);

    const first = await service.explainClause('A sufficiently long clause.', 'Payment terms');
    const second = await service.explainClause('A sufficiently long clause.', 'Termination terms');

    expect(first).not.toBe(second);
    expect(explainClause).toHaveBeenNthCalledWith(1, 'A sufficiently long clause.', {
      context: 'Payment terms',
    });
    expect(explainClause).toHaveBeenNthCalledWith(2, 'A sufficiently long clause.', {
      context: 'Termination terms',
    });
  });

  it('uses the requested maximum summary length for full-document chunks', async () => {
    const summarize = vi.fn(async () => ({ result: 'Summary' }));
    const service = new AIService({ summarize } as unknown as AIProvider);

    await service.summarizeDocument(
      'This is enough document text for the AI input validator to accept.',
      'English',
      175
    );

    expect(summarize).toHaveBeenCalledWith(expect.any(String), {
      language: 'English',
      maxLength: 175,
    });
  });
});
