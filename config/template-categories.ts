export const TEMPLATE_CATEGORIES = ['HR', 'Legal', 'Sales', 'Finance', 'Other'] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

const templateCategorySet = new Set<string>(TEMPLATE_CATEGORIES);

export function isTemplateCategory(value: unknown): value is TemplateCategory {
  return typeof value === 'string' && templateCategorySet.has(value);
}
