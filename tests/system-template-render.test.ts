import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { evaluateTemplateReadiness } from '@/lib/template-readiness';

type Role = {
  id: string;
  name: string;
  role: 'signer' | 'approver' | 'viewer';
  order: number;
};

type SeedField = {
  id: string;
  type: 'full_name' | 'signature' | 'date';
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
  recipientId: string;
  required: boolean;
  fieldOwner: 'recipients';
  pageRect: { width: number; height: number };
};

type SystemTemplateDefinition = {
  slug: string;
  name: string;
  roles: Role[];
  editableContent: { blocks: unknown[] };
};

type RenderedSystemTemplate = {
  pdf: Buffer;
  fields: SeedField[];
  pageCount: number;
  signaturePageNumber: number;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { systemTemplates } = require('../scripts/system-templates/catalog.cjs') as {
  systemTemplates: SystemTemplateDefinition[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PAGE_HEIGHT, PAGE_WIDTH, renderSystemTemplatePdf } = require('../scripts/system-templates/render.cjs') as {
  PAGE_HEIGHT: number;
  PAGE_WIDTH: number;
  renderSystemTemplatePdf: (definition: SystemTemplateDefinition) => Promise<RenderedSystemTemplate>;
};

describe('curated system-template PDF renderer', () => {
  it.each(systemTemplates)('$name renders a valid, ready-to-use signing plan', async (template) => {
    const rendered = await renderSystemTemplatePdf(template);
    const parsedPdf = await PDFDocument.load(rendered.pdf);

    expect(Buffer.isBuffer(rendered.pdf)).toBe(true);
    expect(rendered.pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(parsedPdf.getPageCount()).toBe(rendered.pageCount);
    expect(rendered.pageCount).toBeGreaterThan(0);
    expect(rendered.signaturePageNumber).toBe(rendered.pageCount);
    expect(rendered.fields).toHaveLength(template.roles.length * 3);

    for (const role of template.roles) {
      const roleFields = rendered.fields.filter((field) => field.recipientId === role.id);
      expect(roleFields).toHaveLength(3);
      expect(new Set(roleFields.map((field) => field.type))).toEqual(
        new Set(['full_name', 'signature', 'date'])
      );

      roleFields.forEach((field) => {
        expect(field.id).toMatch(new RegExp(`^${template.slug}-${role.id}-`));
        expect(field.pageNumber).toBe(rendered.signaturePageNumber);
        expect(field.required).toBe(true);
        expect(field.fieldOwner).toBe('recipients');
        expect(field.x).toBeGreaterThanOrEqual(0);
        expect(field.y).toBeGreaterThanOrEqual(0);
        expect(field.width).toBeGreaterThan(0);
        expect(field.height).toBeGreaterThan(0);
        expect(field.x + field.width).toBeLessThanOrEqual(PAGE_WIDTH);
        expect(field.y + field.height).toBeLessThanOrEqual(PAGE_HEIGHT);
        expect(field.pageRect).toMatchObject({ width: PAGE_WIDTH, height: PAGE_HEIGHT });
      });
    }

    const readiness = evaluateTemplateReadiness({
      fields: rendered.fields,
      roles: template.roles,
      fieldLayoutStatus: 'current',
    });
    expect(readiness).toMatchObject({
      ready: true,
      missingRoles: false,
      missingFields: false,
      layoutNeedsReview: false,
      unassignedFields: 0,
      orphanedFields: 0,
      rolesMissingFields: 0,
    });
  });
});
