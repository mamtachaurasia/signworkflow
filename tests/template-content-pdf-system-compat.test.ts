import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { sanitizeEditableTemplateContent } from '@/lib/template-content';
import { renderEditableTemplatePdf } from '@/lib/template-content-pdf';

type CatalogTemplate = {
  slug: string;
  name: string;
  editableContent: {
    variables: Array<{ key: string; defaultValue?: string }>;
  };
};

type SeedRender = {
  signaturePageNumber: number;
  fields: Array<{ pageNumber: number }>;
};

function pageText(pdf: PDFDocument, pageIndex: number): string {
  const contents = pdf.getPage(pageIndex).node.Contents();
  const streams = contents instanceof PDFArray
    ? Array.from({ length: contents.size() }, (_, streamIndex) => contents.lookup(streamIndex, PDFRawStream))
    : contents instanceof PDFRawStream
      ? [contents]
      : [];

  const operators = streams.map((stream) =>
    Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
  ).join('\n');

  return [...operators.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { systemTemplates } = require('../scripts/system-templates/catalog.cjs') as {
  systemTemplates: CatalogTemplate[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderSystemTemplatePdf } = require('../scripts/system-templates/render.cjs') as {
  renderSystemTemplatePdf: (template: CatalogTemplate) => Promise<SeedRender>;
};

describe('curated system-template variable rendering', () => {
  it('flows a long rich-text agreement across pages without adding a blank first page', async () => {
    const clauses = Array.from(
      { length: 120 },
      (_, index) => `Clause ${index + 1} remains binding on both parties.`
    );
    const pdfBytes = await renderEditableTemplatePdf({
      version: 1,
      blocks: [{
        id: 'agreement-body',
        type: 'paragraph',
        text: clauses.join('\n'),
        html: clauses.map((clause) => `<p>${clause}</p>`).join(''),
        align: 'left',
      }],
      variables: [],
    });

    const pdf = await PDFDocument.load(pdfBytes);

    // The old whole-block preflight produced exactly two pages: an empty page
    // one, followed by all of the overflowing agreement text on page two.
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pageText(pdf, 0)).toContain('Clause 1 remains binding on both parties.');
  });

  it.each(systemTemplates)('$name keeps saved signing-field pages after variables are applied', async (template) => {
    const seeded = await renderSystemTemplatePdf(template);
    const values = Object.fromEntries(
      template.editableContent.variables.map((variable) => [
        variable.key,
        variable.key.endsWith('_address')
          ? 'Applied address\nSuite 200'
          : `Applied ${variable.key.replace(/_/g, ' ')}`,
      ])
    );

    const persistedContent = sanitizeEditableTemplateContent(template.editableContent);
    for (const content of [template.editableContent, persistedContent]) {
      const [defaults, applied] = await Promise.all([
        renderEditableTemplatePdf(content, {}),
        renderEditableTemplatePdf(content, values),
      ]);
      const [defaultPages, appliedPages] = await Promise.all([
        PDFDocument.load(defaults).then((pdf) => pdf.getPageCount()),
        PDFDocument.load(applied).then((pdf) => pdf.getPageCount()),
      ]);

      expect(defaultPages).toBe(seeded.signaturePageNumber);
      expect(appliedPages).toBe(seeded.signaturePageNumber);
      seeded.fields.forEach((field) => {
        expect(field.pageNumber).toBe(seeded.signaturePageNumber);
        expect(field.pageNumber).toBeLessThanOrEqual(defaultPages);
        expect(field.pageNumber).toBeLessThanOrEqual(appliedPages);
      });
    }
  });
});
