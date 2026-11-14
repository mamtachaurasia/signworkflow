import { describe, expect, it } from 'vitest';

import { getDocumentWritingPrompts } from '@/lib/template-writing-prompts';

describe('document-aware template writing prompts', () => {
  it('prioritizes suggestions that match the selected payment language', () => {
    const result = getDocumentWritingPrompts({
      documentName: 'Professional Services Agreement',
      documentText: 'The Client shall pay invoices within thirty days.',
      selectedText: 'Payment is due within 30 days of each invoice.',
    });

    expect(result.contextLabel).toContain('payment terms');
    expect(result.prompts[0]).toMatchObject({
      id: 'payment',
      label: 'Clarify payment terms',
      mode: 'plain_language',
    });
    expect(result.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'clearer', mode: 'rewrite' }),
      expect.objectContaining({ id: 'shorter', mode: 'concise' }),
    ]));
  });

  it('uses the wider agreement when the active section has no obvious topic', () => {
    const result = getDocumentWritingPrompts({
      documentText: 'This Mutual Non-Disclosure Agreement defines Confidential Information and exclusions.',
      sectionText: 'Each party will comply with this agreement.',
    });

    expect(result.contextLabel).toContain('confidentiality');
    expect(result.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'confidentiality', label: 'Clarify confidentiality' }),
    ]));
  });

  it('offers draft questions for an empty section and keeps the list concise', () => {
    const result = getDocumentWritingPrompts({
      documentName: 'Consulting Agreement',
      documentText: 'The consultant will provide services and deliverables.',
    });

    expect(result.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'draft-clause', mode: 'draft' }),
      expect.objectContaining({ id: 'draft-obligations', mode: 'draft' }),
    ]));
    expect(result.prompts.find((prompt) => prompt.id === 'draft-obligations')?.instruction).toContain(
      'Use Smart variables'
    );
    expect(result.prompts.length).toBeLessThanOrEqual(4);
    expect(result.prompts.every((prompt) => prompt.instruction.length >= 5)).toBe(true);
  });
});
