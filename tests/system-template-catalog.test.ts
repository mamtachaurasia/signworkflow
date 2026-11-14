import { describe, expect, it } from 'vitest';

import { TEMPLATE_CATEGORIES } from '@/config/template-categories';

type CatalogRole = {
  id: string;
  name: string;
  role: 'signer' | 'approver' | 'viewer';
  order: number;
};

type CatalogVariable = {
  key: string;
  label: string;
  required: boolean;
  defaultValue: string;
};

type CatalogBlock = {
  id: string;
  type: string;
  text?: string;
  table?: { rows?: string[][] };
};

type SystemTemplateDefinition = {
  slug: string;
  revision: number;
  name: string;
  description: string;
  category: string;
  jurisdiction: string;
  tags: string[];
  roles: CatalogRole[];
  variables: CatalogVariable[];
  blocks: CatalogBlock[];
  editableContent: {
    version: number;
    variables: CatalogVariable[];
    blocks: CatalogBlock[];
  };
};

// The catalog is intentionally CommonJS so the production seed runner can be
// invoked directly by Node. Test the source of truth rather than a copied
// TypeScript fixture.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CATALOG_VERSION, CURATED_TEMPLATE_REVISION, systemTemplates } = require('../scripts/system-templates/catalog.cjs') as {
  CATALOG_VERSION: string;
  CURATED_TEMPLATE_REVISION: number;
  systemTemplates: SystemTemplateDefinition[];
};

const VARIABLE_TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;
const VARIABLE_KEY = /^[a-z][a-z0-9_]{0,63}$/;

function referencedVariables(blocks: CatalogBlock[]): Set<string> {
  const values = blocks.flatMap((block) => [
    block.text || '',
    ...(block.table?.rows || []).flat(),
  ]);
  const references = new Set<string>();

  values.forEach((value) => {
    for (const match of value.matchAll(VARIABLE_TOKEN)) {
      references.add(match[1].toLowerCase());
    }
  });

  return references;
}

describe('curated system template catalog', () => {
  it('has a versioned, unique definition for every supported category', () => {
    expect(CATALOG_VERSION).toMatch(/^\d{4}\.\d{2}\.\d+$/);
    expect(CURATED_TEMPLATE_REVISION).toBeGreaterThan(0);
    expect(systemTemplates.length).toBeGreaterThanOrEqual(TEMPLATE_CATEGORIES.length);

    const slugs = systemTemplates.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(systemTemplates.map((template) => template.category))).toEqual(new Set(TEMPLATE_CATEGORIES));

    for (const template of systemTemplates) {
      expect(template.slug).toMatch(/^professional-[a-z0-9-]+$/);
      expect(template.revision).toBe(CURATED_TEMPLATE_REVISION);
      expect(template.name.trim()).not.toBe('');
      expect(template.description.trim()).not.toBe('');
      expect(template.tags.length).toBeGreaterThan(0);
      expect(new Set(template.tags).size).toBe(template.tags.length);
      expect(template.tags).toContain('editable');
      expect(template.editableContent.version).toBe(1);
      expect(template.editableContent.variables).toBe(template.variables);
      expect(template.editableContent.blocks).toBe(template.blocks);
    }
  });

  it('keeps reusable roles, variables, and editable content internally consistent', () => {
    for (const template of systemTemplates) {
      const roleIds = template.roles.map((role) => role.id);
      expect(template.roles.length).toBeGreaterThan(0);
      expect(new Set(roleIds).size).toBe(roleIds.length);
      expect(new Set(template.roles.map((role) => role.order)).size).toBe(template.roles.length);
      expect(template.roles.map((role) => role.order)).toEqual(
        Array.from({ length: template.roles.length }, (_value, index) => index + 1)
      );

      template.roles.forEach((role) => {
        expect(role.id).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(role.name.trim()).not.toBe('');
        expect(['signer', 'approver', 'viewer']).toContain(role.role);
      });

      const variableKeys = template.variables.map((variable) => variable.key);
      expect(new Set(variableKeys).size).toBe(variableKeys.length);
      template.variables.forEach((variable) => {
        expect(variable.key).toMatch(VARIABLE_KEY);
        expect(variable.label.trim()).not.toBe('');
        expect(typeof variable.required).toBe('boolean');
        expect(typeof variable.defaultValue).toBe('string');
      });

      const blockIds = template.blocks.map((block) => block.id);
      expect(template.blocks.length).toBeGreaterThan(0);
      expect(new Set(blockIds).size).toBe(blockIds.length);
      expect(template.blocks.some((block) => block.type === 'page-break')).toBe(true);

      const declaredVariables = new Set(variableKeys);
      for (const key of referencedVariables(template.blocks)) {
        expect(declaredVariables).toContain(key);
      }
    }
  });
});
