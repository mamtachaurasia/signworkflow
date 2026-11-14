import { describe, expect, it } from 'vitest';

import {
  sanitizeTemplateDefaultSigners,
  sanitizeTemplateFields,
  sanitizeTemplateTags,
} from '@/lib/template-persistence';

describe('template persistence helpers', () => {
  it('normalizes template fields and preserves saved metadata', () => {
    const [field] = sanitizeTemplateFields([
      {
        id: 42,
        type: 'text',
        x: 10,
        y: 20,
        width: 120,
        height: 40,
        pageNumber: 1,
        recipientId: 'recipient-1',
        placeholder: 'Enter value',
        mimeType: 'text/plain',
        settings: { inputType: 'email' },
        pageRect: {
          top: 100,
          left: 10,
          right: 610,
          bottom: 900,
          width: 600,
          height: 800,
          x: 10,
          y: 100,
        },
      },
    ]);

    expect(field).toMatchObject({
      id: '42',
      recipientId: 'recipient-1',
      fieldOwner: 'recipients',
      mimeType: 'text/plain',
      settings: { inputType: 'email' },
    });
    expect(field.pageRect).toMatchObject({
      top: 100,
      left: 10,
      width: 600,
      height: 800,
    });
  });

  it('sanitizes template default signers and tags', () => {
    const [signer] = sanitizeTemplateDefaultSigners([
      {
        name: ' Alex ',
        email: ' alex@example.com ',
        role: 'viewer',
      },
    ]);
    const tags = sanitizeTemplateTags([' legal ', '', 'sales']);

    expect(signer).toMatchObject({
      name: 'Alex',
      email: 'alex@example.com',
      role: 'viewer',
      order: 1,
    });
    expect(typeof signer.id).toBe('string');
    expect(signer.id.length).toBeGreaterThan(0);
    expect(tags).toEqual(['legal', 'sales']);
  });
});
