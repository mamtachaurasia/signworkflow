import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const MAX_REMOTE_IMAGE_SIZE = 5_000_000;

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split('.').map(Number);
    return first === 0 || first === 10 || first === 127 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168;
  }
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

async function assertPublicImageUrl(url: URL): Promise<void> {
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error('Image host is not public');
  }
}

import { resolveTemplateVariables, stripTemplateHtml } from '@/lib/template-content';
import type { EditableTemplateContent, TemplateContentBlock } from '@/types/template-content';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 58;
const TOP = 62;
const BOTTOM = 58;

function blockStyle(block: TemplateContentBlock) {
  if (block.type === 'title') return { size: 22, gapBefore: 2, gapAfter: 16 };
  if (block.type === 'heading') return { size: 14, gapBefore: 14, gapAfter: 8 };
  if (block.type === 'list-item') return { size: 10.5, gapBefore: 2, gapAfter: 5 };
  return { size: 10.5, gapBefore: 2, gapAfter: 8 };
}

export async function renderEditableTemplatePdf(content: EditableTemplateContent, variableValues: Record<string, string> = {}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const regularItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const timesBoldItalic = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const courier = await pdf.embedFont(StandardFonts.Courier);
  const courierBold = await pdf.embedFont(StandardFonts.CourierBold);
  const courierItalic = await pdf.embedFont(StandardFonts.CourierOblique);
  const courierBoldItalic = await pdf.embedFont(StandardFonts.CourierBoldOblique);
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - TOP;
  let pageNumber = 1;

  const addPage = () => {
    page.drawText(String(pageNumber), { x: PAGE_WIDTH / 2 - 3, y: 28, size: 8, font: regular, color: rgb(0.45, 0.48, 0.54) });
    pageNumber += 1;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - TOP;
  };

  const drawTable = (block: TemplateContentBlock) => {
    const rows = block.table?.rows || [];
    if (rows.length === 0) return;
    const columns = Math.max(...rows.map((row) => row.length));
    const width = (PAGE_WIDTH - MARGIN_X * 2) / columns;
    const fontSize = 8.5;
    const lineHeight = 11;
    const padding = 5;
    const wrapCell = (value: string, font: PDFFont): string[] => {
      const normalized = stripTemplateHtml(value).replace(/\r\n?/g, '\n').trim();
      if (!normalized) return [''];
      return normalized.split('\n').flatMap((paragraph) => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) return [''];
        const lines: string[] = [];
        let line = '';
        words.forEach((word) => {
          const candidate = line ? `${line} ${word}` : word;
          if (line && font.widthOfTextAtSize(candidate, fontSize) > width - padding * 2) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        });
        if (line) lines.push(line);
        return lines;
      });
    };

    rows.forEach((row, rowIndex) => {
      const cellFont = rowIndex === 0 ? bold : regular;
      const cellLines = Array.from({ length: columns }, (_, columnIndex) => wrapCell(row[columnIndex] || '', cellFont));
      const rowHeight = Math.max(30, Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + padding * 2);
      if (y - rowHeight < BOTTOM) addPage();
      Array.from({ length: columns }, (_, columnIndex) => {
        const x = MARGIN_X + columnIndex * width;
        page.drawRectangle({ x, y: y - rowHeight, width, height: rowHeight, borderWidth: 0.7, borderColor: rgb(0.72, 0.75, 0.8), color: rowIndex === 0 ? rgb(0.95, 0.96, 0.98) : rgb(1, 1, 1) });
        cellLines[columnIndex].forEach((line, lineIndex) => {
          page.drawText(line, { x: x + padding, y: y - padding - fontSize - lineIndex * lineHeight, size: fontSize, font: cellFont, color: rgb(0.08, 0.11, 0.18) });
        });
      });
      y -= rowHeight;
    });
    y -= 10;
  };

  const drawImage = async (block: TemplateContentBlock) => {
    const html = block.html || '';
    const match = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (!match?.[1]) return;
    const src = match[1];
    const size = 160;
    if (y - size < BOTTOM) addPage();

    try {
      let bytes: Buffer | null = null;
      let imageType = '';

      if (src.startsWith('data:image/')) {
        const [metadata, base64] = src.split(',', 2);
        imageType = metadata.match(/^data:image\/([a-zA-Z0-9.+-]+);/i)?.[1]?.toLowerCase() || '';
        bytes = base64 ? Buffer.from(base64, 'base64') : null;
      } else {
        const url = new URL(src);
        if (url.protocol !== 'https:') throw new Error('Unsupported image URL');
        await assertPublicImageUrl(url);
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
        const contentType = response.headers.get('content-type')?.split(';', 1)[0].toLowerCase() || '';
        const contentLength = Number(response.headers.get('content-length') || '0');
        if (!response.ok || !['image/png', 'image/jpeg'].includes(contentType) || contentLength > MAX_REMOTE_IMAGE_SIZE) {
          throw new Error('Unsupported image response');
        }
        bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MAX_REMOTE_IMAGE_SIZE) throw new Error('Image is too large');
        imageType = contentType.replace('image/', '');
      }

      const image = imageType === 'png'
        ? await pdf.embedPng(bytes!)
        : imageType === 'jpeg' || imageType === 'jpg'
          ? await pdf.embedJpg(bytes!)
          : null;
      if (image) {
        const scale = Math.min(size / image.width, size / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(image, { x: MARGIN_X, y: y - height, width, height });
        y -= height + 10;
        return;
      }
    } catch {
      // Unsupported or unavailable images are omitted from the PDF.
    }
  };

  type InlineToken = { text: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; size?: number; color?: string; background?: string; family?: string; rise?: number; align?: string; lineHeight?: number; newline?: boolean };
  const plainTextTokens = (
    value: string,
    style: Omit<InlineToken, 'text' | 'newline'>
  ): InlineToken[] => value
    .replace(/\r\n?/g, '\n')
    .split(/(\n|[\t ]+)/)
    .flatMap((part): InlineToken[] => {
      if (!part) return [];
      if (part === '\n') return [{ text: '', ...style, newline: true }];
      if (/^[\t ]+$/.test(part)) return [{ text: ' ', ...style }];
      return [{ text: part, ...style }];
    });
  const fontFor = (token: InlineToken): PDFFont => {
    const family = (token.family || '').toLowerCase();
    if (family.includes('courier')) return token.bold && token.italic ? courierBoldItalic : token.bold ? courierBold : token.italic ? courierItalic : courier;
    if (family.includes('times') || family.includes('georgia')) return token.bold && token.italic ? timesBoldItalic : token.bold ? timesBold : token.italic ? timesItalic : times;
    return token.bold && token.italic ? boldItalic : token.bold ? bold : token.italic ? regularItalic : regular;
  };
  const pdfColor = (value: string | undefined, fallback = rgb(0.08, 0.11, 0.18)) => {
    const match = value?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (match) return rgb(parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255);
    const rgbMatch = value?.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    return rgbMatch ? rgb(Math.min(255, Number(rgbMatch[1])) / 255, Math.min(255, Number(rgbMatch[2])) / 255, Math.min(255, Number(rgbMatch[3])) / 255) : fallback;
  };
  const inlineTokens = (block: TemplateContentBlock, prefix: string): InlineToken[] => {
    if (!block.html) {
      const style = { bold: block.bold === true, italic: block.italic === true, underline: false, strike: false };
      return [
        ...(prefix ? [{ text: prefix, ...style }] : []),
        ...plainTextTokens(block.text, style),
      ];
    }
    let boldDepth = block.bold ? 1 : 0;
    let italicDepth = block.italic ? 1 : 0;
    let underlineDepth = 0;
    let strikeDepth = 0;
    let linkDepth = 0;
    const htmlStartsWithList = /^\s*<(?:ol|ul)(?:\s[^>]*)?>/i.test(block.html);
    const tokens: InlineToken[] = prefix && !htmlStartsWithList ? [{ text: prefix, bold: boldDepth > 0, italic: italicDepth > 0, underline: false, strike: false }] : [];
    let size: number | undefined;
    let color: string | undefined;
    let background: string | undefined;
    let family: string | undefined;
    let rise: number | undefined;
    let align: string | undefined;
    let lineHeight: number | undefined;
    const listStack: Array<{ ordered: boolean; index: number }> = [];
    const styleStack: Array<{ size?: number; color?: string; background?: string; family?: string; rise?: number; align?: string; lineHeight?: number }> = [];
    const pushNewline = () => {
      if (tokens.length === 0 || tokens[tokens.length - 1].newline) return;
      tokens.push({ text: '', bold: false, italic: false, underline: false, strike: false, newline: true });
    };
    const pushListMarker = () => {
      const list = listStack[listStack.length - 1];
      if (tokens.length > 0 && !tokens[tokens.length - 1].newline) pushNewline();
      if (list?.ordered) list.index += 1;
      const indentation = '    '.repeat(Math.max(0, listStack.length - 1));
      const marker = list?.ordered ? `${list.index}. ` : '• ';
      tokens.push({ text: `${indentation}${marker}`, bold: boldDepth > 0, italic: italicDepth > 0, underline: false, strike: false, family, size, color, background, rise, align, lineHeight });
    };
    block.html.replace(/<br\s*\/?>/gi, '\n').split(/(<[^>]+>)/g).forEach((part) => {
      const tag = part.toLowerCase();
      if (/^<(b|strong)>$/.test(tag)) { boldDepth += 1; return; }
      if (/^<\/(b|strong)>$/.test(tag)) { boldDepth = Math.max(0, boldDepth - 1); return; }
      if (/^<(i|em)>$/.test(tag)) { italicDepth += 1; return; }
      if (/^<\/(i|em)>$/.test(tag)) { italicDepth = Math.max(0, italicDepth - 1); return; }
      if (tag === '<u>') { underlineDepth += 1; return; }
      if (tag === '</u>') { underlineDepth = Math.max(0, underlineDepth - 1); return; }
      if (/^<(s|strike)>$/.test(tag)) { strikeDepth += 1; return; }
      if (/^<\/(s|strike)>$/.test(tag)) { strikeDepth = Math.max(0, strikeDepth - 1); return; }
      if (/^<a(?:\s[^>]*)?>$/.test(tag)) { linkDepth += 1; return; }
      if (tag === '</a>') { linkDepth = Math.max(0, linkDepth - 1); return; }
      if (/^<code(?:\s[^>]*)?>$/.test(tag)) { styleStack.push({ size, color, background, family, rise, align, lineHeight }); family = 'Courier New'; return; }
      if (tag === '</code>') { const previous = styleStack.pop() || {}; ({ size, color, background, family, rise, align, lineHeight } = previous); return; }
      if (/^<ol(?:\s[^>]*)?>$/.test(tag)) {
        const requestedStart = Number.parseInt(part.match(/\sstart\s*=\s*["']?(\d+)/i)?.[1] || '1', 10);
        listStack.push({ ordered: true, index: Number.isSafeInteger(requestedStart) && requestedStart > 0 ? requestedStart - 1 : 0 });
        return;
      }
      if (/^<ul(?:\s[^>]*)?>$/.test(tag)) { listStack.push({ ordered: false, index: 0 }); return; }
      if (tag === '</ol>' || tag === '</ul>') { listStack.pop(); return; }
      if (/^<li(?:\s[^>]*)?>$/.test(tag)) { pushListMarker(); return; }
      if (tag === '</li>') { pushNewline(); return; }
      if (/^<(span|mark|p|h1|h2|h3)(?:\s[^>]*)?>$/.test(tag)) {
        styleStack.push({ size, color, background, family, rise, align, lineHeight });
        if (tag.startsWith('<h1')) { size = 22; boldDepth += 1; }
        if (tag.startsWith('<h2')) { size = 18; boldDepth += 1; }
        if (tag.startsWith('<h3')) { size = 14; boldDepth += 1; }
        const rawStyle = part.match(/style=["']([^"']+)["']/i)?.[1] || '';
        rawStyle.split(';').forEach((declaration) => {
          const [rawProperty, ...rawValue] = declaration.split(':');
          const property = rawProperty.trim().toLowerCase();
          const value = rawValue.join(':').trim();
          if (property === 'font-size') size = Number.parseFloat(value);
          if (property === 'color') color = value;
          if (property === 'background-color') background = value;
          if (property === 'font-family') family = value;
          if (property === 'text-align') align = value;
          if (property === 'line-height') lineHeight = Number.parseFloat(value);
        });
        return;
      }
      if (/^<\/(span|mark|p|h1|h2|h3)>$/.test(tag)) {
        if (/^<\/h[1-3]>$/.test(tag)) boldDepth = Math.max(0, boldDepth - 1);
        const previous = styleStack.pop() || {};
        ({ size, color, background, family, rise, align, lineHeight } = previous);
        if (/^<\/(p|h1|h2|h3)>$/.test(tag)) pushNewline();
        return;
      }
      if (tag === '<sub>' || tag === '<sup>') { styleStack.push({ size, color, background, family, rise, align, lineHeight }); size = (size || 10.5) * 0.75; rise = tag === '<sup>' ? (size * 0.55) : -(size * 0.25); return; }
      if (tag === '</sub>' || tag === '</sup>') { const previous = styleStack.pop() || {}; ({ size, color, background, family, rise, align, lineHeight } = previous); return; }
      if (tag === '</blockquote>') { pushNewline(); return; }
      if (tag.startsWith('<')) return;
      const decoded = stripTemplateHtml(part);
      decoded.split(/(\s+)/).filter(Boolean).forEach((piece) => {
        const pieces = piece.split('\n');
        pieces.forEach((text, index) => {
          if (text) tokens.push({ text: /^\s+$/.test(text) ? ' ' : text, bold: boldDepth > 0, italic: italicDepth > 0, underline: underlineDepth > 0 || linkDepth > 0, strike: strikeDepth > 0, size, color, background, family, rise, align, lineHeight });
          if (index < pieces.length - 1) tokens.push({ text: '', bold: false, italic: false, underline: false, strike: false, newline: true });
        });
      });
    });
    while (tokens[tokens.length - 1]?.newline) tokens.pop();
    return tokens;
  };

  const layoutInlineLines = (tokens: InlineToken[], size: number, maxWidth: number): InlineToken[][] => {
    const lines: InlineToken[][] = [[]];
    let width = 0;
    tokens.forEach((token) => {
      if (token.newline) { lines.push([]); width = 0; return; }
      const tokenWidth = fontFor(token).widthOfTextAtSize(token.text, token.size || size);
      if (width + tokenWidth > maxWidth && lines[lines.length - 1].length > 0 && token.text.trim()) {
        lines.push([]);
        width = 0;
        if (token.text === ' ') return;
      }
      lines[lines.length - 1].push(token);
      width += tokenWidth;
    });
    return lines;
  };

  for (const block of resolveTemplateVariables(content, variableValues)) {
    if (block.type === 'page-break') {
      addPage();
      continue;
    }
    if (block.type === 'table') {
      drawTable(block);
      continue;
    }

    const html = block.html || '';
    const embeddedElements = [...html.matchAll(/<img[^>]+src=["'][^"']+["'][^>]*>|<table[^>]*>[\s\S]*?<\/table>/gi)].map((match) => match[0]);
    const hasEmbeddedContent = embeddedElements.length > 0;
    const textBlock = hasEmbeddedContent
      ? { ...block, html: html.replace(/<img[^>]*>/gi, '').replace(/<table[^>]*>[\s\S]*?<\/table>/gi, ''), text: '' }
      : block;

    const style = blockStyle(textBlock);
    const prefix = textBlock.type === 'list-item' ? '•  ' : '';
    const tokens = inlineTokens(textBlock, prefix);
    const richLines = layoutInlineLines(tokens, style.size, PAGE_WIDTH - MARGIN_X * 2);
    const lineHeights = richLines.map((line) => Math.max(style.size, ...line.map((token) => token.size || style.size)) * Math.max(1.15, ...line.map((token) => token.lineHeight || 1.45)));
    const usablePageHeight = PAGE_HEIGHT - TOP - BOTTOM;

    richLines.forEach((line, lineIndex) => {
      const isFirstLine = lineIndex === 0;
      const isLastLine = lineIndex === richLines.length - 1;
      const gapBefore = isFirstLine ? style.gapBefore : 0;
      const gapAfter = isLastLine ? style.gapAfter : 0;
      const requiredLineHeight = gapBefore + lineHeights[lineIndex] + gapAfter;

      // A rich-text block can hold an entire AI-generated agreement. Do not
      // move the whole block to a new page before it is drawn: that produces
      // an empty first page and lets the remaining lines run below the page.
      // Instead, reserve and paginate each line as it is drawn.
      if (requiredLineHeight <= usablePageHeight && y - requiredLineHeight < BOTTOM) {
        addPage();
      }
      y -= gapBefore;

      const width = line.reduce((sum, token) => sum + fontFor(token).widthOfTextAtSize(token.text, token.size || style.size), 0);
      const lineAlign = line.find((token) => token.align)?.align || block.align;
      let x = lineAlign === 'center'
        ? (PAGE_WIDTH - width) / 2
        : lineAlign === 'right'
          ? PAGE_WIDTH - MARGIN_X - width
          : MARGIN_X;
      const spaces = line.filter((token) => token.text === ' ').length;
      const justifySpacing = lineAlign === 'justify' && lineIndex < richLines.length - 1 && spaces > 0
        ? (PAGE_WIDTH - MARGIN_X * 2 - width) / spaces
        : 0;
      line.forEach((token) => {
        const tokenFont = fontFor(token);
        const tokenSize = token.size || style.size;
        const tokenWidth = tokenFont.widthOfTextAtSize(token.text, tokenSize);
        const tokenY = y + (token.rise || 0);
        if (token.background && token.text.trim()) page.drawRectangle({ x, y: tokenY - 2, width: tokenWidth, height: tokenSize * 1.15, color: pdfColor(token.background, rgb(1, 0.95, 0.55)) });
        const tokenColor = pdfColor(token.color);
        page.drawText(token.text, { x, y: tokenY, size: tokenSize, font: tokenFont, color: tokenColor });
        if (token.underline && token.text.trim()) page.drawLine({ start: { x, y: tokenY - 1.5 }, end: { x: x + tokenWidth, y: tokenY - 1.5 }, thickness: 0.6, color: tokenColor });
        if (token.strike && token.text.trim()) page.drawLine({ start: { x, y: tokenY + tokenSize * 0.3 }, end: { x: x + tokenWidth, y: tokenY + tokenSize * 0.3 }, thickness: 0.6, color: tokenColor });
        x += tokenWidth + (token.text === ' ' ? justifySpacing : 0);
      });
      y -= lineHeights[lineIndex];
      if (isLastLine) y -= gapAfter;
    });

    for (const embeddedElement of embeddedElements) {
      if (/^<img\b/i.test(embeddedElement)) {
        await drawImage({ ...block, html: embeddedElement });
        continue;
      }
      const tableRows = [...embeddedElement.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
        [...rowMatch[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((cellMatch) => stripTemplateHtml(cellMatch[1]).replace(/\s+/g, ' ').trim())
      ).filter((row) => row.length > 0);
      if (tableRows.length > 0) {
        drawTable({ ...block, type: 'table', table: { rows: tableRows }, html: undefined, text: '' });
      }
    }
  }

  page.drawText(String(pageNumber), { x: PAGE_WIDTH / 2 - 3, y: 28, size: 8, font: regular, color: rgb(0.45, 0.48, 0.54) });
  return Buffer.from(await pdf.save());
}
