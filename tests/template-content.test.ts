import { describe, expect, it } from 'vitest';

import {
  getMissingRequiredVariableLabels,
  hasMeaningfulTemplateContent,
  resolveTemplateVariables,
  sanitizeEditableTemplateContent,
  sanitizeTemplateHtml,
} from '@/lib/template-content';
import {
  TEMPLATE_CONTENT_VERSION,
  type EditableTemplateContent,
} from '@/types/template-content';

describe('editable template rich-content persistence', () => {
  it('preserves supported structural tags, inline marks, and safe links', () => {
    const html = [
      '<h1>Heading one</h1>',
      '<h2>Heading two</h2>',
      '<h3>Heading three</h3>',
      '<blockquote><p><strong>Strong</strong> <b>Bold</b> <em>Emphasis</em> <i>Italic</i> <u>Underline</u> <s>Strike</s> <strike>Also strike</strike> <sub>sub</sub> <sup>sup</sup> <code>code</code><br>next line</p></blockquote>',
      '<ul><li>Bullet one</li><li><mark style="background-color:#fef08a">Bullet two</mark></li></ul>',
      '<ol><li>First</li></ol>',
      '<p><a href="https://example.com/contracts?id=1">Contract</a> <a href="mailto:legal@example.com">Email</a></p>',
    ].join('');

    const content = sanitizeEditableTemplateContent({
      version: TEMPLATE_CONTENT_VERSION,
      blocks: [{ id: 'rich-block', type: 'paragraph', text: '', html }],
      variables: [],
    });

    expect(content.blocks).toHaveLength(1);
    expect(content.blocks[0].html).toBe(html);
    expect(content.blocks[0].text).toContain('Heading one');
    expect(content.blocks[0].text).toContain('• Bullet one');
    expect(content.blocks[0].text).not.toContain('<');
  });

  it('preserves every supported font, size, color, highlight, line height, and alignment', () => {
    const families = ['Arial', 'Georgia', 'Times New Roman', 'Courier New'];
    const sizes = [10, 11, 12, 14, 16, 18, 20, 24, 30];
    const lineHeights = ['1', '1.15', '1.5', '2'];
    const alignments = ['left', 'center', 'right', 'justify'];
    const html = [
      ...families.map((family) => `<span style="font-family:${family}">${family}</span>`),
      ...sizes.map((size) => `<span style="font-size:${size}px">${size}</span>`),
      '<span style="color:#123ABC;background-color:rgb(1, 2, 3)">Colors</span>',
      '<mark style="background-color:#fef08a">Highlight</mark>',
      ...lineHeights.map((lineHeight) => `<p style="line-height:${lineHeight}">${lineHeight}</p>`),
      ...alignments.map((alignment) => `<p style="text-align:${alignment}">${alignment}</p>`),
    ].join('');

    expect(sanitizeTemplateHtml(html)).toBe(html);
  });

  it('strips unsafe tags, handler attributes, unsafe URLs, and unsupported styles', () => {
    const sanitized = sanitizeTemplateHtml([
      '<p id="copy" class="prose" onclick="alert(1)" style="color:#123456;position:fixed;font-size:99px;line-height:3;text-align:start;background-image:url(javascript:alert(1))">Safe copy</p>',
      '<img src="x" onerror="alert(1)">',
      '<script>alert(1)</script>',
      '<iframe src="https://unsafe.example">frame</iframe>',
      '<svg onload="alert(1)"><circle></circle></svg>',
      '<a href="javascript:alert(1)" onclick="alert(1)">Unsafe link</a>',
      '<a href="data:text/html,bad">Data link</a>',
      '<a href="https://safe.example/path" target="_blank" rel="opener" onmouseover="alert(1)">Safe link</a>',
    ].join(''));

    expect(sanitized).toContain('<p style="color:#123456">Safe copy</p>');
    expect(sanitized).toContain('<a href="https://safe.example/path">Safe link</a>');
    expect(sanitized).toContain('Unsafe link');
    expect(sanitized).toContain('Data link');
    expect(sanitized).not.toMatch(/<(?:script|iframe|img|svg|circle)\b/i);
    expect(sanitized).not.toMatch(/(?:onclick|onerror|onload|onmouseover)\s*=/i);
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('data:text/html');
    expect(sanitized).not.toContain('position:fixed');
    expect(sanitized).not.toContain('font-size:99px');
    expect(sanitized).not.toContain('line-height:3');
    expect(sanitized).not.toContain('text-align:start');
    expect(sanitized).not.toContain('background-image');
    expect(sanitized).not.toContain('target=');
    expect(sanitized).not.toContain('rel=');
  });

  it('preserves safe images and tables in rich template content', () => {
    const sanitized = sanitizeTemplateHtml([
      '<p>Intro paragraph</p>',
      '<img src="https://example.com/logo.png" alt="Logo">',
      '<table><tr><td>Alpha</td><td>Beta</td></tr></table>',
    ].join(''));

    expect(sanitized).toContain('<img src="https://example.com/logo.png" alt="Logo" loading="lazy">');
    expect(sanitized).toContain('<table>');
    expect(sanitized).toContain('<td>Alpha</td>');
  });

  it('resolves defaults and overrides in text, rich HTML, and table cells while retaining unresolved placeholders', () => {
    const content: EditableTemplateContent = {
      version: TEMPLATE_CONTENT_VERSION,
      blocks: [
        {
          id: 'paragraph',
          type: 'paragraph',
          text: '{{company_name}} owes {{amount}} to {{ counterparty }}. Keep {{unknown}}.',
          html: '<p><strong>{{company_name}}</strong> owes {{amount}} to {{COUNTERPARTY}}. Keep {{unknown}}.</p>',
          align: 'left',
        },
        {
          id: 'table',
          type: 'table',
          text: '',
          table: {
            rows: [
              ['{{company_name}}', '{{amount}}'],
              ['{{counterparty}}', '{{unknown}}'],
            ],
          },
        },
      ],
      variables: [
        { key: 'company_name', label: 'Company name', defaultValue: 'Acme LLC' },
        { key: 'amount', label: 'Amount', defaultValue: 'INR 1,000' },
        { key: 'counterparty', label: 'Counterparty' },
      ],
    };

    const resolved = resolveTemplateVariables(content, {
      company_name: 'Globex Ltd',
      counterparty: 'Northwind Traders',
    });

    expect(resolved[0].text).toBe('Globex Ltd owes INR 1,000 to Northwind Traders. Keep {{unknown}}.');
    expect(resolved[0].html).toBe('<p><strong>Globex Ltd</strong> owes INR 1,000 to Northwind Traders. Keep {{unknown}}.</p>');
    expect(resolved[1].table?.rows).toEqual([
      ['Globex Ltd', 'INR 1,000'],
      ['Northwind Traders', '{{unknown}}'],
    ]);

    const defaults = resolveTemplateVariables(content);
    expect(defaults[0].text).toBe('Acme LLC owes INR 1,000 to {{counterparty}}. Keep {{unknown}}.');
    expect(content.blocks[0].text).toContain('{{company_name}}');
    expect(content.blocks[1].table?.rows[0][0]).toBe('{{company_name}}');
  });

  it('identifies required Smart variables that do not have a value', () => {
    expect(getMissingRequiredVariableLabels({
      variables: [
        { key: 'company_name', label: 'Company name', defaultValue: 'Acme Ltd', required: true },
        { key: 'effective_date', label: 'Effective date', defaultValue: '  ', required: true },
        { key: 'notes', label: 'Notes', defaultValue: '', required: false },
        { key: 'fallback_name', label: '', defaultValue: '', required: true },
      ],
    })).toEqual(['Effective date', 'fallback_name']);
  });

  it('recognizes meaningful document content while ignoring blank blocks and uninserted variables', () => {
    expect(hasMeaningfulTemplateContent({
      blocks: [
        { id: 'paragraph', type: 'paragraph', text: ' \u200B ', html: '<p>&nbsp;<br></p>' },
        { id: 'page-break', type: 'page-break', text: 'Ignored page-break text' },
        { id: 'table', type: 'table', text: '', table: { rows: [[' ', '\uFEFF']] } },
      ],
    })).toBe(false);

    expect(hasMeaningfulTemplateContent({
      blocks: [{ id: 'variable', type: 'paragraph', text: '{{seller_name}}', html: '<p>{{seller_name}}</p>' }],
    })).toBe(true);
    expect(hasMeaningfulTemplateContent({
      blocks: [{ id: 'table', type: 'table', text: '', table: { rows: [['Property address']] } }],
    })).toBe(true);
    expect(hasMeaningfulTemplateContent({
      blocks: [{ id: 'image', type: 'paragraph', text: '', html: '<img src="https://example.com/logo.png">' }],
    })).toBe(true);
  });
});
