import { randomUUID } from 'crypto';

import {
  TEMPLATE_CONTENT_VERSION,
  type EditableTemplateContent,
  type TemplateContentBlock,
  type TemplateContentBlockType,
  type TemplateTextAlign,
  type TemplateVariableDefinition,
} from '@/types/template-content';

const BLOCK_TYPES = new Set<TemplateContentBlockType>(['title', 'heading', 'paragraph', 'list-item', 'table', 'page-break']);
const TEXT_ALIGNMENTS = new Set<TemplateTextAlign>(['left', 'center', 'right']);
const VARIABLE_KEY = /^[a-z][a-z0-9_]{0,63}$/;
export const MAX_TEMPLATE_CONTENT_BLOCKS = 300;
export const MAX_TEMPLATE_BLOCK_LENGTH = 12_000;
export const MAX_TEMPLATE_VARIABLES = 100;
const ALLOWED_INLINE_TAGS = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'EM', 'H1', 'H2', 'H3', 'I', 'IMG', 'LI', 'MARK', 'OL', 'P', 'S', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TR', 'U', 'UL']);

export function stripTemplateHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '• ')
    .replace(/<\/(?:p|li|blockquote|h1|h2|h3)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'");
}

export function sanitizeTemplateHtml(value: string): string {
  return value
    .slice(0, MAX_TEMPLATE_BLOCK_LENGTH * 2)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (tag, name: string) => {
      const upper = name.toUpperCase();
      if (!ALLOWED_INLINE_TAGS.has(upper)) return '';
      if (upper === 'BR') return '<br>';
      if (upper === 'A' && !tag.startsWith('</')) {
        const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || '';
        const safeHref = /^(https?:|mailto:)/i.test(href) ? href.replace(/["<>]/g, '') : '';
        return safeHref ? `<a href="${safeHref}">` : '';
      }
      if (tag.startsWith('</')) return `</${upper.toLowerCase()}>`;
      if (upper === 'IMG') {
        const src = tag.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] || '';
        const alt = tag.match(/alt\s*=\s*["']([^"']+)["']/i)?.[1] || '';
        const safeSrc = /^(https?:|data:image\/)/i.test(src) ? src.replace(/"/g, '') : '';
        return safeSrc ? `<img src="${safeSrc}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy">` : '';
      }
      const rawStyle = tag.match(/style\s*=\s*["']([^"']+)["']/i)?.[1] || '';
      const safeStyles = rawStyle.split(';').flatMap((declaration) => {
        const separator = declaration.indexOf(':');
        if (separator < 0) return [];
        const property = declaration.slice(0, separator).trim().toLowerCase();
        const styleValue = declaration.slice(separator + 1).trim();
        if ((property === 'color' || property === 'background-color') && (/^#[0-9a-f]{6}$/i.test(styleValue) || /^rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i.test(styleValue))) return [`${property}:${styleValue}`];
        if (property === 'font-family' && /^(Arial|Georgia|Times New Roman|Courier New)$/i.test(styleValue.replace(/["']/g, ''))) return [`font-family:${styleValue.replace(/["']/g, '')}`];
        if (property === 'font-size' && /^(10|11|12|14|16|18|20|24|30)px$/.test(styleValue)) return [`font-size:${styleValue}`];
        if (property === 'line-height' && /^(1|1\.15|1\.5|2)$/.test(styleValue)) return [`line-height:${styleValue}`];
        if (property === 'text-align' && /^(left|center|right|justify)$/.test(styleValue)) return [`text-align:${styleValue}`];
        return [];
      });
      return `<${upper.toLowerCase()}${safeStyles.length ? ` style="${safeStyles.join(';')}"` : ''}>`;
    });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeVariableKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
}

export function sanitizeEditableTemplateContent(value: unknown): EditableTemplateContent {
  const source = asRecord(value);
  const rawBlocks = Array.isArray(source?.blocks) ? source.blocks.slice(0, MAX_TEMPLATE_CONTENT_BLOCKS) : [];
  const rawVariables = Array.isArray(source?.variables) ? source.variables.slice(0, MAX_TEMPLATE_VARIABLES) : [];

  const blocks = rawBlocks.flatMap<TemplateContentBlock>((raw) => {
    const block = asRecord(raw);
    const type = String(block?.type || 'paragraph') as TemplateContentBlockType;
    if (!block || !BLOCK_TYPES.has(type)) return [];
    const html = type === 'page-break' || type === 'table'
      ? undefined
      : sanitizeTemplateHtml(String(block.html || block.text || ''));
    const text = type === 'page-break' || type === 'table'
      ? ''
      : stripTemplateHtml(html || '').slice(0, MAX_TEMPLATE_BLOCK_LENGTH);
    const rawRows = asRecord(block.table)?.rows;
    const table = type === 'table'
      ? {
          rows: (Array.isArray(rawRows) ? rawRows : [['Column 1', 'Column 2'], ['', '']])
            .slice(0, 25)
            .map((row) => (Array.isArray(row) ? row : []).slice(0, 8).map((cell) => String(cell || '').slice(0, 2_000)))
            .filter((row) => row.length > 0),
        }
      : undefined;
    const align = TEXT_ALIGNMENTS.has(block.align as TemplateTextAlign)
      ? block.align as TemplateTextAlign
      : 'left';
    return [{
      id: typeof block.id === 'string' && block.id.trim() ? block.id.trim().slice(0, 100) : randomUUID(),
      type,
      text,
      html,
      table,
      align,
      bold: block.bold === true,
      italic: block.italic === true,
    }];
  });

  const seen = new Set<string>();
  const variables = rawVariables.flatMap<TemplateVariableDefinition>((raw) => {
    const variable = asRecord(raw);
    if (!variable) return [];
    const key = normalizeVariableKey(String(variable.key || ''));
    if (!VARIABLE_KEY.test(key) || seen.has(key)) return [];
    seen.add(key);
    return [{
      key,
      label: String(variable.label || key.replace(/_/g, ' ')).trim().slice(0, 120),
      defaultValue: String(variable.defaultValue || '').slice(0, 2_000),
      required: variable.required === true,
    }];
  });

  return { version: TEMPLATE_CONTENT_VERSION, blocks, variables };
}

export function resolveTemplateVariables(content: EditableTemplateContent, overrides: Record<string, string> = {}): TemplateContentBlock[] {
  const values = new Map(content.variables.map((variable) => [variable.key, overrides[variable.key] ?? variable.defaultValue ?? `{{${variable.key}}}`]));
  return content.blocks.map((block) => ({
    ...block,
    text: block.text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (token, key: string) => values.get(key.toLowerCase()) || token),
    html: block.html?.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (token, key: string) => values.get(key.toLowerCase()) || token),
    table: block.table ? {
      rows: block.table.rows.map((row) => row.map((cell) => cell.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (token, key: string) => values.get(key.toLowerCase()) || token))),
    } : undefined,
  }));
}

export function getMissingRequiredVariableLabels(
  content: Pick<EditableTemplateContent, 'variables'> | null | undefined
): string[] {
  return (content?.variables || [])
    .filter((variable) => variable.required === true && !String(variable.defaultValue || '').trim())
    .map((variable) => String(variable.label || '').trim() || String(variable.key || ''));
}

export function hasMeaningfulTemplateContent(
  content: Pick<EditableTemplateContent, 'blocks'> | null | undefined
): boolean {
  const hasVisibleText = (value: unknown) => stripTemplateHtml(String(value || ''))
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .length > 0;

  return (content?.blocks || []).some((block) => {
    if (block.type === 'page-break') return false;

    if (block.type === 'table') {
      return (block.table?.rows || []).some((row) => row.some(hasVisibleText));
    }

    const html = String(block.html || '');
    return hasVisibleText(html || block.text) ||
      /<img\b/i.test(html);
  });
}
