export const TEMPLATE_JURISDICTIONS = [
  'International',
  'India',
  'United States',
  'European Union',
  'Australia',
] as const;

export type TemplateJurisdiction = (typeof TEMPLATE_JURISDICTIONS)[number];

const templateJurisdictionSet = new Set<string>(TEMPLATE_JURISDICTIONS);

export function isTemplateJurisdiction(value: unknown): value is TemplateJurisdiction {
  return typeof value === 'string' && templateJurisdictionSet.has(value);
}
