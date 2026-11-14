/* eslint-disable @typescript-eslint/no-require-imports -- Node CLI renderer intentionally uses CommonJS. */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 58;
const TOP = 62;
const BOTTOM = 58;
const BODY_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function resolvePlaceholders(value) {
  return String(value || '').replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (_match, key) => `{{${key}}}`);
}

function wrapText(text, font, size, width) {
  const lines = [];
  for (const paragraph of resolvePlaceholders(text).split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function blockStyle(type) {
  if (type === 'title') return { size: 22, before: 4, after: 18 };
  if (type === 'heading') return { size: 13.5, before: 14, after: 7 };
  if (type === 'list-item') return { size: 10, before: 2, after: 4 };
  return { size: 10, before: 2, after: 8 };
}

function pageRect() {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: PAGE_WIDTH,
    bottom: PAGE_HEIGHT,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  };
}

async function renderSystemTemplatePdf(definition) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - TOP;
  let pageNumber = 1;

  const drawFooter = () => {
    page.drawLine({
      start: { x: MARGIN_X, y: 42 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 42 },
      thickness: 0.4,
      color: rgb(0.78, 0.81, 0.86),
    });
    page.drawText(`${definition.name}  |  General starting point - review before use`, {
      x: MARGIN_X,
      y: 27,
      size: 7.5,
      font: regular,
      color: rgb(0.38, 0.43, 0.5),
    });
    page.drawText(String(pageNumber), {
      x: PAGE_WIDTH - MARGIN_X - 6,
      y: 27,
      size: 7.5,
      font: regular,
      color: rgb(0.38, 0.43, 0.5),
    });
  };

  const startPage = () => {
    drawFooter();
    pageNumber += 1;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - TOP;
  };

  const ensure = (height) => {
    if (y - height < BOTTOM) startPage();
  };

  const drawTextBlock = (block) => {
    const style = blockStyle(block.type);
    const font = block.bold ? bold : block.italic ? italic : block.type === 'heading' || block.type === 'title' ? bold : regular;
    const prefix = block.type === 'list-item' ? '•  ' : '';
    const lines = wrapText(`${prefix}${block.text || ''}`, font, style.size, BODY_WIDTH);
    const lineHeight = style.size * 1.42;
    const required = style.before + lines.length * lineHeight + style.after;
    ensure(required);
    y -= style.before;
    for (const line of lines) {
      const width = font.widthOfTextAtSize(line, style.size);
      const x = block.align === 'center'
        ? (PAGE_WIDTH - width) / 2
        : block.align === 'right'
          ? PAGE_WIDTH - MARGIN_X - width
          : MARGIN_X;
      page.drawText(line, { x, y, size: style.size, font, color: rgb(0.07, 0.11, 0.18) });
      y -= lineHeight;
    }
    y -= style.after;
  };

  const drawTable = (block) => {
    const rows = Array.isArray(block.table?.rows) ? block.table.rows : [];
    if (rows.length === 0) return;
    const columns = Math.max(1, ...rows.map((row) => Array.isArray(row) ? row.length : 0));
    const cellWidth = BODY_WIDTH / columns;
    const fontSize = 8.5;
    const lineHeight = 10.5;
    const padding = 5;

    for (const [rowIndex, rawRow] of rows.entries()) {
      const row = Array.isArray(rawRow) ? rawRow : [];
      const cellFont = rowIndex === 0 ? bold : regular;
      const cells = Array.from({ length: columns }, (_value, index) =>
        wrapText(row[index] || '', cellFont, fontSize, cellWidth - padding * 2)
      );
      const rowHeight = Math.max(26, Math.max(...cells.map((lines) => lines.length)) * lineHeight + padding * 2);
      ensure(rowHeight + 4);
      for (let index = 0; index < columns; index += 1) {
        const x = MARGIN_X + index * cellWidth;
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width: cellWidth,
          height: rowHeight,
          borderWidth: 0.55,
          borderColor: rgb(0.72, 0.76, 0.82),
          color: rowIndex === 0 ? rgb(0.94, 0.96, 0.99) : rgb(1, 1, 1),
        });
        cells[index].forEach((line, lineIndex) => {
          page.drawText(line, {
            x: x + padding,
            y: y - padding - fontSize - lineIndex * lineHeight,
            size: fontSize,
            font: cellFont,
            color: rgb(0.07, 0.11, 0.18),
          });
        });
      }
      y -= rowHeight;
    }
    y -= 10;
  };

  // Render contractual content, but reserve the final execution page for a
  // deterministic field plan rather than relying on reflow-prone blank lines.
  for (const block of definition.editableContent.blocks) {
    if (block.type === 'page-break') break;
    if (block.type === 'table') drawTable(block);
    else drawTextBlock(block);
  }

  startPage();
  const signaturePageNumber = pageNumber;
  page.drawText('Execution', {
    x: MARGIN_X,
    y,
    size: 17,
    font: bold,
    color: rgb(0.06, 0.12, 0.21),
  });
  y -= 28;
  const executionCopy = 'Each signatory confirms that they are authorised to sign this document for the named party. Electronic signatures and counterparts are valid to the extent permitted by applicable law.';
  for (const line of wrapText(executionCopy, regular, 10, BODY_WIDTH)) {
    page.drawText(line, { x: MARGIN_X, y, size: 10, font: regular, color: rgb(0.07, 0.11, 0.18) });
    y -= 14;
  }
  y -= 16;

  const fields = [];
  definition.roles.forEach((role, index) => {
    const top = 185 + index * 205;
    const label = role.name;
    const topFromBottom = PAGE_HEIGHT - top;
    page.drawText(label, {
      x: 72,
      y: topFromBottom + 18,
      size: 11,
      font: bold,
      color: rgb(0.07, 0.11, 0.18),
    });
    page.drawText('Full name', { x: 72, y: topFromBottom - 13, size: 8.5, font: regular, color: rgb(0.35, 0.4, 0.48) });
    page.drawText('Signature', { x: 72, y: topFromBottom - 61, size: 8.5, font: regular, color: rgb(0.35, 0.4, 0.48) });
    page.drawText('Date', { x: 326, y: topFromBottom - 61, size: 8.5, font: regular, color: rgb(0.35, 0.4, 0.48) });
    page.drawLine({ start: { x: 72, y: topFromBottom - 32 }, end: { x: 298, y: topFromBottom - 32 }, thickness: 0.5, color: rgb(0.55, 0.6, 0.68) });
    page.drawLine({ start: { x: 72, y: topFromBottom - 80 }, end: { x: 298, y: topFromBottom - 80 }, thickness: 0.5, color: rgb(0.55, 0.6, 0.68) });
    page.drawLine({ start: { x: 326, y: topFromBottom - 80 }, end: { x: 476, y: topFromBottom - 80 }, thickness: 0.5, color: rgb(0.55, 0.6, 0.68) });

    const shared = {
      pageNumber: signaturePageNumber,
      recipientId: role.id,
      required: true,
      fieldOwner: 'recipients',
      pageRect: pageRect(),
    };
    fields.push(
      {
        ...shared,
        id: `${definition.slug}-${role.id}-full-name`,
        type: 'full_name',
        x: 72,
        y: top + 25,
        width: 226,
        height: 28,
        placeholder: 'Full name',
        settings: { label: 'Full name', inputType: 'text' },
      },
      {
        ...shared,
        id: `${definition.slug}-${role.id}-signature`,
        type: 'signature',
        x: 72,
        y: top + 73,
        width: 226,
        height: 44,
        placeholder: 'Signature',
        settings: { label: 'Signature' },
      },
      {
        ...shared,
        id: `${definition.slug}-${role.id}-date`,
        type: 'date',
        x: 326,
        y: top + 73,
        width: 150,
        height: 36,
        placeholder: 'Date',
        settings: { label: 'Date' },
      }
    );
  });

  drawFooter();
  return {
    pdf: Buffer.from(await pdf.save()),
    fields,
    pageCount: pdf.getPageCount(),
    signaturePageNumber,
  };
}

module.exports = {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  pageRect,
  renderSystemTemplatePdf,
};
